import { githubGraphql } from "@/lib/github";
import { getShanghaiYear, getShanghaiYearStartUtc, getWeekStartShanghaiKey, listShanghaiWeekStartKeys } from "@/lib/time";

const ORG_LOGIN = "zjutjh";

type OrgIdQuery = {
  organization: { id: string } | null;
};

async function getOrganizationId(token: string): Promise<string> {
  const data = await githubGraphql<OrgIdQuery>({
    token,
    query: `query($login: String!) { organization(login: $login) { id } }`,
    variables: { login: ORG_LOGIN },
  });

  if (!data.organization?.id) {
    throw new Error(`Organization not found: ${ORG_LOGIN}`);
  }

  return data.organization.id;
}

type PullRequestContributionNode = {
  occurredAt: string;
  pullRequest: {
    id: string;
    repository: { nameWithOwner: string };
  };
};

type PullRequestContributionsQuery = {
  viewer: {
    login: string;
    contributionsCollection: {
      pullRequestContributions: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: PullRequestContributionNode[];
      };
    };
  };
};

async function listPullRequestContributions(args: {
  token: string;
  orgId: string;
  from: string;
  to: string;
}): Promise<{ viewerLogin: string; nodes: PullRequestContributionNode[] }> {
  const nodes: PullRequestContributionNode[] = [];
  let cursor: string | null = null;
  let viewerLogin = "";

  do {
    const data: PullRequestContributionsQuery = await githubGraphql<PullRequestContributionsQuery>({
      token: args.token,
      query: `
        query($orgId: ID!, $from: DateTime!, $to: DateTime!, $after: String) {
          viewer {
            login
            contributionsCollection(from: $from, to: $to, organizationID: $orgId) {
              pullRequestContributions(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  occurredAt
                  pullRequest {
                    id
                    repository { nameWithOwner }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        orgId: args.orgId,
        from: args.from,
        to: args.to,
        after: cursor,
      },
    });

    viewerLogin = data.viewer.login;
    nodes.push(...data.viewer.contributionsCollection.pullRequestContributions.nodes);

    const pageInfo = data.viewer.contributionsCollection.pullRequestContributions.pageInfo;
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return { viewerLogin, nodes };
}

type PullRequestReviewContributionNode = {
  occurredAt: string;
  pullRequest: {
    id: string;
    repository: { nameWithOwner: string };
  };
};

type PullRequestReviewContributionsQuery = {
  viewer: {
    contributionsCollection: {
      pullRequestReviewContributions: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: PullRequestReviewContributionNode[];
      };
    };
  };
};

async function listPullRequestReviewContributions(args: {
  token: string;
  orgId: string;
  from: string;
  to: string;
}): Promise<PullRequestReviewContributionNode[]> {
  const nodes: PullRequestReviewContributionNode[] = [];
  let cursor: string | null = null;

  do {
    const data: PullRequestReviewContributionsQuery = await githubGraphql<PullRequestReviewContributionsQuery>({
      token: args.token,
      query: `
        query($orgId: ID!, $from: DateTime!, $to: DateTime!, $after: String) {
          viewer {
            contributionsCollection(from: $from, to: $to, organizationID: $orgId) {
              pullRequestReviewContributions(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  occurredAt
                  pullRequest {
                    id
                    repository { nameWithOwner }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        orgId: args.orgId,
        from: args.from,
        to: args.to,
        after: cursor,
      },
    });

    nodes.push(...data.viewer.contributionsCollection.pullRequestReviewContributions.nodes);

    const pageInfo = data.viewer.contributionsCollection.pullRequestReviewContributions.pageInfo;
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return nodes;
}

export type ContributionByWeek = {
  weekStart: string; // YYYY-MM-DD (Asia/Shanghai week start, Monday)
  prs: number;
  reviewedPrs: number;
  commits: number | null;
};

export type ContributionByRepo = {
  repo: string; // nameWithOwner
  prs: number;
  reviewedPrs: number;
  commits: number | null;
};

export type CommitScanStatus = "not_started" | "queued" | "running" | "completed" | "failed";

export type YearToDateSnapshot = {
  org: string;
  timezone: "Asia/Shanghai";
  from: string; // UTC ISO
  to: string; // UTC ISO
  computedAt: string; // UTC ISO
  totals: {
    prs: number;
    reviewedPrs: number;
    commits: number | null;
    commitsStatus: CommitScanStatus;
    commitsAttemptedRepos?: number | null;
    commitsRepoErrors?: number | null;
  };
  byWeek: ContributionByWeek[];
  byRepo: ContributionByRepo[];
  viewer: {
    login: string;
  };
};

type CommitScanData = {
  status: CommitScanStatus;
  totalCommits: number | null;
  byRepo: Record<string, number>;
  byWeek: Record<string, number>;
  attemptedRepos: number | null;
  repoErrors: number | null;
};

function normalizeCommitScanStatus(value: unknown): CommitScanStatus {
  switch (value) {
    case "queued":
    case "running":
    case "completed":
    case "failed":
    case "not_started":
      return value;
    case "pending":
      return "not_started";
    default:
      return "not_started";
  }
}

function toNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

async function loadCommitScanData(args: {
  userLogin: string;
  org: string;
  year: number;
}): Promise<CommitScanData> {
  if (!process.env.DATABASE_URL) {
    return {
      status: "not_started",
      totalCommits: null,
      byRepo: {},
      byWeek: {},
      attemptedRepos: null,
      repoErrors: null,
    };
  }

  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.snapshot.findUnique({
      where: {
        userLogin_org_year: {
          userLogin: args.userLogin,
          org: args.org,
          year: args.year,
        },
      },
      select: {
        commitsStatus: true,
        totals: true,
        byRepo: true,
        byWeek: true,
      },
    });

    if (!row) {
      return {
        status: "not_started",
        totalCommits: null,
        byRepo: {},
        byWeek: {},
        attemptedRepos: null,
        repoErrors: null,
      };
    }

    const status = normalizeCommitScanStatus(row.commitsStatus);
    const totals = row.totals as { commits?: unknown; attemptedRepos?: unknown; repoErrors?: unknown };

    const totalCommits = status === "completed" && typeof totals?.commits === "number" ? totals.commits : null;

    const byRepo = status === "completed" ? toNumberRecord(row.byRepo) : {};
    const byWeek = status === "completed" ? toNumberRecord(row.byWeek) : {};

    const latestJob = await prisma.job.findFirst({
      where: { userLogin: args.userLogin, type: "commit_scan" },
      orderBy: { createdAt: "desc" },
      select: { total: true, message: true },
    });

    const attemptedRepos =
      typeof totals?.attemptedRepos === "number"
        ? totals.attemptedRepos
        : typeof latestJob?.total === "number"
          ? latestJob.total
          : null;

    let repoErrors: number | null = typeof totals?.repoErrors === "number" ? totals.repoErrors : null;
    if (repoErrors === null && typeof latestJob?.message === "string") {
      const match = latestJob.message.match(/\\((\\d+)\\s+repo errors\\)/);
      if (match) repoErrors = Number(match[1]);
    }
    if (repoErrors === null && attemptedRepos !== null) {
      repoErrors = Math.max(0, attemptedRepos - Object.keys(byRepo).length);
    }

    return {
      status,
      totalCommits,
      byRepo,
      byWeek,
      attemptedRepos,
      repoErrors,
    };
  } catch {
    return {
      status: "not_started",
      totalCommits: null,
      byRepo: {},
      byWeek: {},
      attemptedRepos: null,
      repoErrors: null,
    };
  }
}

export async function computeYearToDateSnapshot(args: {
  token: string;
  now?: Date;
}): Promise<YearToDateSnapshot> {
  const now = args.now ?? new Date();
  const year = getShanghaiYear(now);
  const fromUtc = getShanghaiYearStartUtc(now);
  const toUtc = now;

  const orgId = await getOrganizationId(args.token);

  const [prResult, reviewContribs] = await Promise.all([
    listPullRequestContributions({
      token: args.token,
      orgId,
      from: fromUtc.toISOString(),
      to: toUtc.toISOString(),
    }),
    listPullRequestReviewContributions({
      token: args.token,
      orgId,
      from: fromUtc.toISOString(),
      to: toUtc.toISOString(),
    }),
  ]);

  const byRepo = new Map<string, { prs: number; reviewedPrIds: Set<string> }>();
  const prsByWeek = new Map<string, number>();

  for (const contrib of prResult.nodes) {
    const repo = contrib.pullRequest.repository.nameWithOwner;
    const repoEntry = byRepo.get(repo) ?? { prs: 0, reviewedPrIds: new Set<string>() };
    repoEntry.prs += 1;
    byRepo.set(repo, repoEntry);

    const weekKey = getWeekStartShanghaiKey(contrib.occurredAt);
    prsByWeek.set(weekKey, (prsByWeek.get(weekKey) ?? 0) + 1);
  }

  const reviewedPrEarliest = new Map<string, { occurredAt: string; repo: string }>();
  for (const contrib of reviewContribs) {
    const prId = contrib.pullRequest.id;
    const repo = contrib.pullRequest.repository.nameWithOwner;

    const existing = reviewedPrEarliest.get(prId);
    if (!existing || contrib.occurredAt < existing.occurredAt) {
      reviewedPrEarliest.set(prId, { occurredAt: contrib.occurredAt, repo });
    }
  }

  const reviewedPrsByWeek = new Map<string, number>();
  for (const [prId, meta] of reviewedPrEarliest) {
    const repoEntry = byRepo.get(meta.repo) ?? { prs: 0, reviewedPrIds: new Set<string>() };
    repoEntry.reviewedPrIds.add(prId);
    byRepo.set(meta.repo, repoEntry);

    const weekKey = getWeekStartShanghaiKey(meta.occurredAt);
    reviewedPrsByWeek.set(weekKey, (reviewedPrsByWeek.get(weekKey) ?? 0) + 1);
  }

  const commitScan = await loadCommitScanData({
    userLogin: prResult.viewerLogin,
    org: ORG_LOGIN,
    year,
  });

  const commitTotal = commitScan.status === "completed" ? commitScan.totalCommits : null;

  const weekKeys = listShanghaiWeekStartKeys(fromUtc, toUtc);
  const byWeekSeries: ContributionByWeek[] = weekKeys.map((weekStart) => ({
    weekStart,
    prs: prsByWeek.get(weekStart) ?? 0,
    reviewedPrs: reviewedPrsByWeek.get(weekStart) ?? 0,
    commits: commitScan.status === "completed" ? (commitScan.byWeek[weekStart] ?? 0) : null,
  }));

  const repoKeys = new Set<string>();
  for (const repo of byRepo.keys()) repoKeys.add(repo);
  if (commitScan.status === "completed") {
    for (const repo of Object.keys(commitScan.byRepo)) repoKeys.add(repo);
  }

  const byRepoRows: ContributionByRepo[] = Array.from(repoKeys)
    .map((repo) => {
      const entry = byRepo.get(repo);
      const commits = commitScan.status === "completed" ? (commitScan.byRepo[repo] ?? 0) : null;

      return {
        repo,
        prs: entry?.prs ?? 0,
        reviewedPrs: entry?.reviewedPrIds.size ?? 0,
        commits,
      };
    })
    .sort((a, b) => {
      const aTotal = a.prs + a.reviewedPrs + (a.commits ?? 0);
      const bTotal = b.prs + b.reviewedPrs + (b.commits ?? 0);
      if (bTotal !== aTotal) return bTotal - aTotal;
      return a.repo.localeCompare(b.repo);
    });

  return {
    org: ORG_LOGIN,
    timezone: "Asia/Shanghai",
    from: fromUtc.toISOString(),
    to: toUtc.toISOString(),
    computedAt: new Date().toISOString(),
    totals: {
      prs: prResult.nodes.length,
      reviewedPrs: reviewedPrEarliest.size,
      commits: commitTotal,
      commitsStatus: commitScan.status,
      commitsAttemptedRepos: commitScan.attemptedRepos,
      commitsRepoErrors: commitScan.repoErrors,
    },
    byWeek: byWeekSeries,
    byRepo: byRepoRows,
    viewer: { login: prResult.viewerLogin },
  };
}
