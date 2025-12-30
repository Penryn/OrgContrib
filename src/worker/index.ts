import "dotenv/config";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { prisma } from "../lib/db";
import { githubGraphql } from "../lib/github";
import type { CommitScanJobData, OrgYearSyncJobData } from "../lib/jobs";
import { formatShanghaiDate, getShanghaiYear, getShanghaiYearStartUtcForYear, getWeekStartShanghaiKey } from "../lib/time";

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

type BranchRef = {
  name: string;
  tipDate: string; // ISO
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
}): Promise<BranchRef[]> {
  const branches: BranchRef[] = [];

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
      branches.push({ name: node.name, tipDate });
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
    await args.progress?.(`扫描 ${args.repo.fullName} 分支 ${scannedBranches}/${branches.length}: ${branch.name}`);

    await scanBranchCommits({
      token: args.token,
      owner: args.repo.owner,
      name: args.repo.name,
      branch: branch.name,
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

type PullRequestNode = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  isDraft: boolean;
  author: { login: string } | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviews: {
    nodes: Array<{
      submittedAt: string | null;
      author: { login: string } | null;
    }>;
  };
};

type PullRequestsQuery = {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: PullRequestNode[];
    };
  } | null;
};

async function listRepoPullRequests(args: {
  token: string;
  owner: string;
  name: string;
  sinceIso: string;
  untilIso: string;
}): Promise<PullRequestNode[]> {
  const nodes: PullRequestNode[] = [];
  let cursor: string | null = null;
  let shouldStop = false;

  do {
    const data: PullRequestsQuery = await withRetry(
      () =>
        githubGraphql<PullRequestsQuery>({
          token: args.token,
          query: `
            query($owner: String!, $name: String!, $after: String) {
              repository(owner: $owner, name: $name) {
                pullRequests(
                  first: 100
                  after: $after
                  states: [OPEN, MERGED, CLOSED]
                  orderBy: { field: UPDATED_AT, direction: DESC }
                ) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    id
                    number
                    title
                    url
                    state
                    createdAt
                    updatedAt
                    mergedAt
                    closedAt
                    isDraft
                    author { login }
                    additions
                    deletions
                    changedFiles
                    reviews(first: 100) {
                      nodes {
                        submittedAt
                        author { login }
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
            after: cursor,
          },
        }),
      `GraphQL pullRequests ${args.owner}/${args.name}`,
    );

    const prConn = data.repository?.pullRequests;
    if (!prConn) break;

    for (const pr of prConn.nodes) {
      if (pr.updatedAt < args.sinceIso) {
        shouldStop = true;
        break;
      }
      if (pr.updatedAt > args.untilIso) continue;
      nodes.push(pr);
    }

    if (shouldStop) break;
    cursor = prConn.pageInfo.hasNextPage ? prConn.pageInfo.endCursor : null;
  } while (cursor);

  return nodes;
}

type CommitHistoryNode = {
  oid: string;
  committedDate: string;
  url: string;
  messageHeadline: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: {
    name: string | null;
    email: string | null;
    user: { login: string } | null;
  } | null;
  parents: { totalCount: number };
};

type BranchHistoryAllQuery = {
  repository: {
    ref: {
      target: {
        __typename: string;
        history?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: CommitHistoryNode[];
        };
      } | null;
    } | null;
  } | null;
};

async function scanBranchCommitRecords(args: {
  token: string;
  org: string;
  year: number;
  repo: RepoRef;
  branch: string;
  sinceIso: string;
  untilIso: string;
  seen: Set<string>;
  progress?: (message: string) => Promise<void>;
}): Promise<{ inserted: number; contributors: Set<string> }> {
  const contributors = new Set<string>();
  let inserted = 0;
  let cursor: string | null = null;
  let stop = false;

  const qualifiedRef = `refs/heads/${args.branch}`;
  const batch: Array<{
    repo: string;
    oid: string;
    org: string;
    year: number;
    committedDate: Date;
    url: string;
    messageHeadline: string;
    isMerge: boolean;
    authorLogin: string | null;
    authorEmail: string | null;
    authorName: string | null;
    additions: number;
    deletions: number;
    changedFiles: number;
    committedDateLocal: string;
  }> = [];

  const flush = async () => {
    if (!batch.length) return;
    const result = await prisma.commitRecord.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
    batch.length = 0;
  };

  do {
    const data: BranchHistoryAllQuery = await withRetry(
      () =>
        githubGraphql<BranchHistoryAllQuery>({
          token: args.token,
          query: `
            query(
              $owner: String!
              $name: String!
              $ref: String!
              $after: String
              $since: GitTimestamp!
              $until: GitTimestamp!
            ) {
              repository(owner: $owner, name: $name) {
                ref(qualifiedName: $ref) {
                  target {
                    __typename
                    ... on Commit {
                      history(first: 100, after: $after, since: $since, until: $until) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                          oid
                          committedDate
                          url
                          messageHeadline
                          additions
                          deletions
                          changedFiles
                          author {
                            name
                            email
                            user { login }
                          }
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
            owner: args.repo.owner,
            name: args.repo.name,
            ref: qualifiedRef,
            after: cursor,
            since: args.sinceIso,
            until: args.untilIso,
          },
        }),
      `GraphQL history(all) ${args.repo.fullName}@${args.branch}`,
    );

    const history = data.repository?.ref?.target?.__typename === "Commit" ? data.repository?.ref?.target?.history : undefined;
    if (!history) break;

    for (const c of history.nodes) {
      if (args.seen.has(c.oid)) {
        stop = true;
        break;
      }

      args.seen.add(c.oid);

      if (c.parents.totalCount > 1) continue;

      const authorLogin = c.author?.user?.login ?? null;
      if (authorLogin) contributors.add(authorLogin);

      batch.push({
        repo: args.repo.fullName,
        oid: c.oid,
        org: args.org,
        year: args.year,
        committedDate: new Date(c.committedDate),
        url: c.url,
        messageHeadline: c.messageHeadline,
        isMerge: false,
        authorLogin,
        authorEmail: c.author?.email ?? null,
        authorName: c.author?.name ?? null,
        additions: c.additions,
        deletions: c.deletions,
        changedFiles: c.changedFiles,
        committedDateLocal: formatShanghaiDate(c.committedDate),
      });

      if (batch.length >= 500) {
        await flush();
      }
    }

    if (stop) break;
    cursor = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;

    if (cursor) {
      await args.progress?.(`扫描 ${args.repo.fullName}@${args.branch} commits...`);
    }
  } while (cursor);

  await flush();
  return { inserted, contributors };
}

async function scanRepoAllBranchCommits(args: {
  token: string;
  org: string;
  year: number;
  repo: RepoRef;
  sinceIso: string;
  untilIso: string;
  progress?: (message: string) => Promise<void>;
}): Promise<{ inserted: number; contributors: Set<string>; scannedBranches: number; totalBranches: number }> {
  const branches = await listBranchesToScan({
    token: args.token,
    owner: args.repo.owner,
    name: args.repo.name,
    sinceIso: args.sinceIso,
  });

  branches.sort((a, b) => b.tipDate.localeCompare(a.tipDate));

  const seen = new Set<string>();
  const contributors = new Set<string>();
  let inserted = 0;

  let scannedBranches = 0;
  for (const branch of branches) {
    scannedBranches += 1;
    await args.progress?.(`扫描 ${args.repo.fullName} 分支 ${scannedBranches}/${branches.length}: ${branch.name}`);

    const result = await scanBranchCommitRecords({
      token: args.token,
      org: args.org,
      year: args.year,
      repo: args.repo,
      branch: branch.name,
      sinceIso: args.sinceIso,
      untilIso: args.untilIso,
      seen,
      progress: args.progress,
    });

    inserted += result.inserted;
    for (const login of result.contributors) contributors.add(login);
  }

  return { inserted, contributors, scannedBranches, totalBranches: branches.length };
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const orgYearSyncWorker = new Worker<OrgYearSyncJobData>(
  "org-year-sync",
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

    await prisma.orgYearCache.upsert({
      where: {
        org_year: {
          org: job.data.org,
          year: job.data.year,
        },
      },
      update: {
        timezone: job.data.timezone,
        from: new Date(job.data.from),
        to: new Date(job.data.to),
        jobId: job.data.jobId,
        status: "running",
        progress: 0,
        totalRepos: null,
        message: "starting",
      },
      create: {
        org: job.data.org,
        year: job.data.year,
        timezone: job.data.timezone,
        from: new Date(job.data.from),
        to: new Date(job.data.to),
        jobId: job.data.jobId,
        status: "running",
        progress: 0,
        message: "starting",
        totals: {},
      },
    });

    await prisma.pullRequestRecord.deleteMany({ where: { org: job.data.org, year: job.data.year } });
    await prisma.pullRequestReviewRecord.deleteMany({ where: { org: job.data.org, year: job.data.year } });
    await prisma.commitRecord.deleteMany({ where: { org: job.data.org, year: job.data.year } });

    const repos = await listAccessibleOrgRepos({ token: job.data.accessToken, org: job.data.org });

    await prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        total: repos.length,
        progress: 0,
        message: `found ${repos.length} repos`,
      },
    });

    await prisma.orgYearCache.update({
      where: {
        org_year: {
          org: job.data.org,
          year: job.data.year,
        },
      },
      data: {
        totalRepos: repos.length,
        progress: 0,
        message: `found ${repos.length} repos`,
      },
    });

    let totalPrs = 0;
    let totalReviews = 0;
    let totalCommits = 0;
    let errorCount = 0;
    const contributors = new Set<string>();

    for (let idx = 0; idx < repos.length; idx += 1) {
      const repo = repos[idx]!;
      const prefix = `[${idx + 1}/${repos.length}]`;

      const progress = async (message: string) => {
        await prisma.job.update({
          where: { id: job.data.jobId },
          data: {
            message: `${prefix} ${message}`,
          },
        });

        await prisma.orgYearCache.update({
          where: {
            org_year: {
              org: job.data.org,
              year: job.data.year,
            },
          },
          data: {
            message: `${prefix} ${message}`,
          },
        });
      };

      try {
        await progress(`sync ${repo.fullName}`);

        const prs = await listRepoPullRequests({
          token: job.data.accessToken,
          owner: repo.owner,
          name: repo.name,
          sinceIso: job.data.from,
          untilIso: job.data.to,
        });

        const prRows = prs
          .filter((pr) => pr.createdAt >= job.data.from && pr.createdAt <= job.data.to)
          .map((pr) => ({
            id: pr.id,
            org: job.data.org,
            year: job.data.year,
            repo: repo.fullName,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            state: pr.state,
            createdAt: new Date(pr.createdAt),
            mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
            closedAt: pr.closedAt ? new Date(pr.closedAt) : null,
            isDraft: pr.isDraft,
            authorLogin: pr.author?.login ?? null,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changedFiles,
            createdAtLocal: formatShanghaiDate(pr.createdAt),
          }));

        const reviewRows: Array<{
          pullRequestId: string;
          reviewerLogin: string;
          org: string;
          year: number;
          repo: string;
          pullRequestNumber: number;
          pullRequestTitle: string;
          pullRequestUrl: string;
          pullRequestAuthorLogin: string | null;
          reviewedAt: Date;
          reviewedAtLocal: string;
        }> = [];

        for (const pr of prs) {
          const prAuthor = pr.author?.login ?? null;
          const earliest = new Map<string, string>();

          for (const review of pr.reviews.nodes) {
            const reviewer = review.author?.login;
            const submittedAt = review.submittedAt;
            if (!reviewer || !submittedAt) continue;
            if (submittedAt < job.data.from || submittedAt > job.data.to) continue;

            const existing = earliest.get(reviewer);
            if (!existing || submittedAt < existing) {
              earliest.set(reviewer, submittedAt);
            }
          }

          for (const [reviewerLogin, submittedAt] of earliest) {
            reviewRows.push({
              pullRequestId: pr.id,
              reviewerLogin,
              org: job.data.org,
              year: job.data.year,
              repo: repo.fullName,
              pullRequestNumber: pr.number,
              pullRequestTitle: pr.title,
              pullRequestUrl: pr.url,
              pullRequestAuthorLogin: prAuthor,
              reviewedAt: new Date(submittedAt),
              reviewedAtLocal: formatShanghaiDate(submittedAt),
            });
          }
        }

        if (prRows.length) {
          let inserted = 0;
          for (let start = 0; start < prRows.length; start += 500) {
            const batch = prRows.slice(start, start + 500);
            const result = await prisma.pullRequestRecord.createMany({ data: batch, skipDuplicates: true });
            inserted += result.count;
          }

          totalPrs += inserted;
          for (const pr of prRows) {
            if (pr.authorLogin) contributors.add(pr.authorLogin);
          }
        }

        if (reviewRows.length) {
          let inserted = 0;
          for (let start = 0; start < reviewRows.length; start += 500) {
            const batch = reviewRows.slice(start, start + 500);
            const result = await prisma.pullRequestReviewRecord.createMany({ data: batch, skipDuplicates: true });
            inserted += result.count;
          }

          totalReviews += inserted;
          for (const row of reviewRows) contributors.add(row.reviewerLogin);
        }

        await progress(`scan commits ${repo.fullName}`);
        const commitResult = await scanRepoAllBranchCommits({
          token: job.data.accessToken,
          org: job.data.org,
          year: job.data.year,
          repo,
          sinceIso: job.data.from,
          untilIso: job.data.to,
          progress,
        });

        totalCommits += commitResult.inserted;
        for (const login of commitResult.contributors) contributors.add(login);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${prefix} repo sync failed`, { repo: repo.fullName, message });
        await progress(`repo failed ${repo.fullName}: ${message}`);

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

      await prisma.orgYearCache.update({
        where: {
          org_year: {
            org: job.data.org,
            year: job.data.year,
          },
        },
        data: {
          progress: progressPct,
        },
      });

      await job.updateProgress(progressPct);
    }

    const durationMs = Date.now() - startedAt.getTime();

    await prisma.orgYearCache.update({
      where: {
        org_year: {
          org: job.data.org,
          year: job.data.year,
        },
      },
      data: {
        status: "completed",
        progress: 100,
        computedAt: new Date(),
        message: `completed in ${Math.round(durationMs / 1000)}s` + (errorCount ? ` (${errorCount} repo errors)` : ""),
        totals: {
          repos: repos.length,
          repoErrors: errorCount,
          prs: totalPrs,
          reviews: totalReviews,
          commits: totalCommits,
          contributors: contributors.size,
        },
      },
    });

    await prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        status: "completed",
        progress: 100,
        message: `completed in ${Math.round(durationMs / 1000)}s` + (errorCount ? ` (${errorCount} repo errors)` : ""),
      },
    });

    return { ok: true, totalPrs, totalReviews, totalCommits, errorCount, durationMs };
  },
  { connection },
);

orgYearSyncWorker.on("failed", async (job, err) => {
  if (!job) return;

  await prisma.job.update({
    where: { id: job.data.jobId },
    data: { status: "failed", message: err.message },
  });

  await prisma.orgYearCache.upsert({
    where: {
      org_year: {
        org: job.data.org,
        year: job.data.year,
      },
    },
    update: {
      status: "failed",
      message: err.message,
    },
    create: {
      org: job.data.org,
      year: job.data.year,
      timezone: job.data.timezone,
      from: new Date(job.data.from),
      to: new Date(job.data.to),
      jobId: job.data.jobId,
      status: "failed",
      progress: 0,
      message: err.message,
      totals: {},
    },
  });
});

const commitScanWorker = new Worker<CommitScanJobData>(
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

commitScanWorker.on("failed", async (job, err) => {
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

console.log("worker started", { queues: ["commit-scan", "org-year-sync"], redisUrl });

const DEFAULT_ORG_LOGIN = "zjutjh";
const DEFAULT_TIMEZONE = "Asia/Shanghai";

const orgYearSyncQueue = new Queue<OrgYearSyncJobData>("org-year-sync", { connection });

async function ensureOrgYearSyncOnStartup(): Promise<void> {
  const token = process.env.ORG_SYNC_GITHUB_TOKEN;
  if (!token) {
    console.log("ORG_SYNC_GITHUB_TOKEN missing; skip org-year-sync on startup.");
    return;
  }

  const org = process.env.ORG_LOGIN ?? DEFAULT_ORG_LOGIN;
  const now = new Date();
  const year = Number(process.env.ORG_CACHE_YEAR ?? getShanghaiYear(now));
  if (!Number.isFinite(year)) {
    console.warn("invalid ORG_CACHE_YEAR; skip org-year-sync on startup.", { year: process.env.ORG_CACHE_YEAR });
    return;
  }

  const fromUtc = getShanghaiYearStartUtcForYear(year);
  const toUtc = now;

  try {
    const existing = await prisma.orgYearCache.findUnique({
      where: {
        org_year: {
          org,
          year,
        },
      },
      select: {
        status: true,
        to: true,
        jobId: true,
      },
    });

    if (existing?.status === "queued" || existing?.status === "running") {
      console.log("org-year-sync already in progress; skip startup enqueue.", { org, year, jobId: existing.jobId });
      return;
    }

    if (existing?.status === "completed") {
      console.log("org-year cache already completed; skip startup enqueue.", { org, year, to: existing.to.toISOString() });
      return;
    }

    const job = await prisma.job.create({
      data: {
        userLogin: "org-sync",
        type: "org_year_sync",
        status: "queued",
        progress: 0,
        message: "queued (startup)",
      },
    });

    await prisma.orgYearCache.upsert({
      where: {
        org_year: {
          org,
          year,
        },
      },
      update: {
        timezone: DEFAULT_TIMEZONE,
        from: fromUtc,
        to: toUtc,
        computedAt: null,
        status: "queued",
        progress: 0,
        totalRepos: null,
        message: "queued (startup)",
        jobId: job.id,
        totals: {},
      },
      create: {
        org,
        year,
        timezone: DEFAULT_TIMEZONE,
        from: fromUtc,
        to: toUtc,
        computedAt: null,
        status: "queued",
        progress: 0,
        totalRepos: null,
        message: "queued (startup)",
        jobId: job.id,
        totals: {},
      },
    });

    const payload: OrgYearSyncJobData = {
      jobId: job.id,
      org,
      year,
      from: fromUtc.toISOString(),
      to: toUtc.toISOString(),
      timezone: DEFAULT_TIMEZONE,
      accessToken: token,
      startedBy: "startup",
    };

    await orgYearSyncQueue.add("org_year_sync", payload, {
      jobId: job.id,
      removeOnComplete: 20,
      removeOnFail: 20,
    });

    console.log("org-year-sync enqueued (startup).", { org, year, jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("failed to enqueue org-year-sync on startup.", { org, year, message });
  }
}

void ensureOrgYearSyncOnStartup();
