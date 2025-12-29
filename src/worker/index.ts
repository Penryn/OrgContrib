import "dotenv/config";

import { Worker } from "bullmq";
import IORedis from "ioredis";

import { prisma } from "../lib/db";
import { githubGraphql } from "../lib/github";
import type { CommitScanJobData } from "../lib/jobs";
import { getWeekStartShanghaiKey } from "../lib/time";

type RestRepo = {
  name: string;
  full_name: string;
  owner: { login: string };
  archived: boolean;
  disabled: boolean;
};

type RepoRef = { owner: string; name: string; fullName: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return message.includes("rate limit") || message.includes("secondary rate limit");
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  if (message.includes("secondary rate limit")) return true;
  if (message.includes("timeout")) return true;
  if (message.includes("something went wrong")) return true;
  if (message.includes("bad gateway") || message.includes("gateway timeout")) return true;
  if (message.includes("fetch failed") || message.includes("network")) return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxAttempts = 4;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxAttempts) break;

      const base = 800 * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * 250);
      const delayMs = base + jitter;
      console.warn(`retrying (${attempt}/${maxAttempts})`, { label, delayMs, message: err instanceof Error ? err.message : String(err) });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

type BranchNode = {
  name: string;
  target: {
    __typename: string;
    committedDate?: string;
  } | null;
};

type BranchRefsQuery = {
  repository: {
    refs: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: BranchNode[];
    };
  } | null;
};

type CommitNode = {
  oid: string;
  committedDate: string;
  parents: { totalCount: number };
};

type BranchHistoryQuery = {
  repository: {
    ref: {
      target: {
        __typename: string;
        history?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: CommitNode[];
        };
      } | null;
    } | null;
  } | null;
};

async function githubRestJson<T>(args: { token: string; url: string }): Promise<T> {
  const res = await withRetry(
    () =>
      fetch(args.url, {
        headers: {
          Authorization: `bearer ${args.token}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }),
    `REST ${args.url}`,
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub REST HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text) as T;
}

async function listAccessibleOrgRepos(args: { token: string; org: string }): Promise<RepoRef[]> {
  const fromUserRepos: RepoRef[] = [];

  for (let page = 1; page <= 1000; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("visibility", "all");
    url.searchParams.set("affiliation", "collaborator,organization_member,owner");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const batch = await githubRestJson<RestRepo[]>({ token: args.token, url: url.toString() });

    for (const repo of batch) {
      if (repo.owner.login !== args.org) continue;
      if (repo.disabled) continue;
      fromUserRepos.push({ owner: repo.owner.login, name: repo.name, fullName: repo.full_name });
    }

    if (batch.length < 100) break;
  }

  const fromOrgPublicRepos: RepoRef[] = [];
  for (let page = 1; page <= 1000; page += 1) {
    const url = new URL(`https://api.github.com/orgs/${args.org}/repos`);
    url.searchParams.set("type", "public");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const batch = await githubRestJson<RestRepo[]>({ token: args.token, url: url.toString() });

    for (const repo of batch) {
      if (repo.owner.login !== args.org) continue;
      if (repo.disabled) continue;
      fromOrgPublicRepos.push({ owner: repo.owner.login, name: repo.name, fullName: repo.full_name });
    }

    if (batch.length < 100) break;
  }

  const merged = new Map<string, RepoRef>();
  for (const repo of [...fromOrgPublicRepos, ...fromUserRepos]) {
    merged.set(repo.fullName, repo);
  }

  return Array.from(merged.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function listBranchesToScan(args: {
  token: string;
  owner: string;
  name: string;
  sinceIso: string;
}): Promise<string[]> {
  const branches: string[] = [];

  let cursor: string | null = null;
  do {
    const data: BranchRefsQuery = await withRetry(
      () =>
        githubGraphql<BranchRefsQuery>({
          token: args.token,
          query: `
            query($owner: String!, $name: String!, $after: String) {
              repository(owner: $owner, name: $name) {
                refs(refPrefix: "refs/heads/", first: 100, after: $after) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    name
                    target {
                      __typename
                      ... on Commit { committedDate }
                    }
                  }
                }
              }
            }
          `,
          variables: {
            owner: args.owner,
            name: args.name,
            after: cursor,
          },
        }),
      `GraphQL refs ${args.owner}/${args.name}`,
    );

    const refs = data.repository?.refs;
    if (!refs) break;

    for (const node of refs.nodes) {
      const tipDate = node.target?.__typename === "Commit" ? node.target.committedDate : undefined;
      if (!tipDate) continue;
      if (tipDate < args.sinceIso) continue;
      branches.push(node.name);
    }

    cursor = refs.pageInfo.hasNextPage ? refs.pageInfo.endCursor : null;
  } while (cursor);

  return branches;
}

async function scanBranchCommits(args: {
  token: string;
  owner: string;
  name: string;
  branch: string;
  sinceIso: string;
  untilIso: string;
  authorId: string;
  authorEmails: string[];
  seen: Set<string>;
  weekCounts: Record<string, number>;
}): Promise<number> {
  let cursor: string | null = null;
  let added = 0;

  const qualifiedRef = `refs/heads/${args.branch}`;

  do {
    const data: BranchHistoryQuery = await withRetry(
      () =>
        githubGraphql<BranchHistoryQuery>({
          token: args.token,
          query: `
            query(
              $owner: String!
              $name: String!
              $ref: String!
              $after: String
              $since: GitTimestamp!
              $until: GitTimestamp!
              $authorId: ID
              $emails: [String!]
            ) {
              repository(owner: $owner, name: $name) {
                ref(qualifiedName: $ref) {
                  target {
                    __typename
                    ... on Commit {
                      history(
                        first: 100
                        after: $after
                        since: $since
                        until: $until
                        author: { id: $authorId, emails: $emails }
                      ) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                          oid
                          committedDate
                          parents(first: 10) { totalCount }
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: {
            owner: args.owner,
            name: args.name,
            ref: qualifiedRef,
            after: cursor,
            since: args.sinceIso,
            until: args.untilIso,
            authorId: args.authorId,
            emails: args.authorEmails.length > 0 ? args.authorEmails : null,
          },
        }),
      `GraphQL history ${args.owner}/${args.name}@${args.branch}`,
    );

    const history = data.repository?.ref?.target?.__typename === "Commit" ? data.repository?.ref?.target?.history : undefined;
    if (!history) break;

    for (const c of history.nodes) {
      if (c.parents.totalCount > 1) continue;
      if (args.seen.has(c.oid)) continue;

      args.seen.add(c.oid);
      added += 1;

      const weekKey = getWeekStartShanghaiKey(c.committedDate);
      args.weekCounts[weekKey] = (args.weekCounts[weekKey] ?? 0) + 1;
    }

    cursor = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;
  } while (cursor);

  return added;
}

async function scanRepoCommits(args: {
  token: string;
  repo: RepoRef;
  sinceIso: string;
  untilIso: string;
  authorId: string;
  authorEmails: string[];
  progress?: (message: string) => Promise<void>;
}): Promise<{ commits: number; byWeek: Record<string, number> }> {
  const branches = await listBranchesToScan({
    token: args.token,
    owner: args.repo.owner,
    name: args.repo.name,
    sinceIso: args.sinceIso,
  });

  const seen = new Set<string>();
  const weekCounts: Record<string, number> = {};

  let scannedBranches = 0;
  for (const branch of branches) {
    scannedBranches += 1;
    await args.progress?.(`扫描 ${args.repo.fullName} 分支 ${scannedBranches}/${branches.length}: ${branch}`);

    await scanBranchCommits({
      token: args.token,
      owner: args.repo.owner,
      name: args.repo.name,
      branch,
      sinceIso: args.sinceIso,
      untilIso: args.untilIso,
      authorId: args.authorId,
      authorEmails: args.authorEmails,
      seen,
      weekCounts,
    });
  }

  return { commits: seen.size, byWeek: weekCounts };
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const worker = new Worker<CommitScanJobData>(
  "commit-scan",
  async (job) => {
    const startedAt = new Date();

    await prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        status: "running",
        progress: 0,
        message: "starting",
      },
    });

    await prisma.snapshot.upsert({
      where: {
        userLogin_org_year: {
          userLogin: job.data.userLogin,
          org: job.data.org,
          year: job.data.year,
        },
      },
      update: {
        from: new Date(job.data.from),
        to: new Date(job.data.to),
        computedAt: new Date(),
        commitsStatus: "running",
      },
      create: {
        userLogin: job.data.userLogin,
        org: job.data.org,
        year: job.data.year,
        timezone: "Asia/Shanghai",
        from: new Date(job.data.from),
        to: new Date(job.data.to),
        computedAt: new Date(),
        totals: { commits: null },
        byRepo: {},
        byWeek: {},
        commitsStatus: "running",
      },
    });

    const repos = await listAccessibleOrgRepos({ token: job.data.accessToken, org: job.data.org });

    await prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        total: repos.length,
        progress: 0,
        message: `found ${repos.length} repos`,
      },
    });

    const commitByRepo: Record<string, number> = {};
    const commitByWeek: Record<string, number> = {};
    let totalCommits = 0;
    let errorCount = 0;

    for (let idx = 0; idx < repos.length; idx += 1) {
      const repo = repos[idx]!;
      const prefix = `[${idx + 1}/${repos.length}]`;
      commitByRepo[repo.fullName] = 0;

      const progress = async (message: string) => {
        await prisma.job.update({
          where: { id: job.data.jobId },
          data: {
            message: `${prefix} ${message}`,
          },
        });
      };

      try {
        await progress(`扫描仓库 ${repo.fullName}`);

        const scanned = await scanRepoCommits({
          token: job.data.accessToken,
          repo,
          sinceIso: job.data.from,
          untilIso: job.data.to,
          authorId: job.data.userId,
          authorEmails: job.data.authorEmails,
          progress,
        });

        commitByRepo[repo.fullName] = scanned.commits;
        totalCommits += scanned.commits;

        for (const [week, count] of Object.entries(scanned.byWeek)) {
          commitByWeek[week] = (commitByWeek[week] ?? 0) + count;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${prefix} repo scan failed`, { repo: repo.fullName, message });
        await progress(`仓库失败 ${repo.fullName}: ${message}`);

        if (isRateLimitError(err)) {
          throw err;
        }

        errorCount += 1;
      }

      const progressPct = repos.length > 0 ? Math.floor(((idx + 1) / repos.length) * 100) : 100;

      await prisma.job.update({
        where: { id: job.data.jobId },
        data: {
          progress: progressPct,
        },
      });

      await job.updateProgress(progressPct);
    }

    await prisma.snapshot.upsert({
      where: {
        userLogin_org_year: {
          userLogin: job.data.userLogin,
          org: job.data.org,
          year: job.data.year,
        },
      },
      update: {
        timezone: "Asia/Shanghai",
        from: new Date(job.data.from),
        to: new Date(job.data.to),
        computedAt: new Date(),
        totals: { commits: totalCommits, attemptedRepos: repos.length, repoErrors: errorCount },
        byRepo: commitByRepo,
        byWeek: commitByWeek,
        commitsStatus: "completed",
      },
      create: {
        userLogin: job.data.userLogin,
        org: job.data.org,
        year: job.data.year,
        timezone: "Asia/Shanghai",
        from: new Date(job.data.from),
        to: new Date(job.data.to),
        computedAt: new Date(),
        totals: { commits: totalCommits, attemptedRepos: repos.length, repoErrors: errorCount },
        byRepo: commitByRepo,
        byWeek: commitByWeek,
        commitsStatus: "completed",
      },
    });

    const durationMs = Date.now() - startedAt.getTime();

    await prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        status: "completed",
        progress: 100,
        message: `completed in ${Math.round(durationMs / 1000)}s` + (errorCount ? ` (${errorCount} repo errors)` : ""),
      },
    });

    return { ok: true, totalCommits, errorCount, durationMs };
  },
  { connection },
);

worker.on("failed", async (job, err) => {
  if (!job) return;

  await prisma.job.update({
    where: { id: job.data.jobId },
    data: { status: "failed", message: err.message },
  });

  await prisma.snapshot.upsert({
    where: {
      userLogin_org_year: {
        userLogin: job.data.userLogin,
        org: job.data.org,
        year: job.data.year,
      },
    },
    update: {
      commitsStatus: "failed",
    },
    create: {
      userLogin: job.data.userLogin,
      org: job.data.org,
      year: job.data.year,
      timezone: "Asia/Shanghai",
      from: new Date(job.data.from),
      to: new Date(job.data.to),
      computedAt: new Date(),
      totals: { commits: null },
      byRepo: {},
      byWeek: {},
      commitsStatus: "failed",
    },
  });
});

console.log("worker started", { queue: "commit-scan", redisUrl });
