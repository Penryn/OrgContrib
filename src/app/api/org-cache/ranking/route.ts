import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatError } from "@/lib/errors";
import { githubGraphql } from "@/lib/github";
import { listAccessibleOrgRepoFullNames } from "@/lib/githubRest";
import { getShanghaiYear } from "@/lib/time";

export const runtime = "nodejs";

const DEFAULT_ORG_LOGIN = "zjutjh";

type ViewerLoginQuery = { viewer: { login: string } };

type ContributorStats = {
  login: string;
  prs: number;
  reviews: number;
  commits: number;
  total: number;
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const org = process.env.ORG_LOGIN ?? DEFAULT_ORG_LOGIN;
    const now = new Date();
    const year = Number(process.env.ORG_CACHE_YEAR ?? getShanghaiYear(now));
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "invalid_year" }, { status: 500 });
    }

    // Check if cache is ready
    const cache = await prisma.orgYearCache.findUnique({
      where: {
        org_year: {
          org,
          year,
        },
      },
      select: { status: true },
    });

    if (!cache || cache.status !== "completed") {
      return NextResponse.json(
        {
          error: "cache_not_ready",
          status: cache?.status ?? "not_started",
        },
        { status: 409 },
      );
    }

    const viewer = await githubGraphql<ViewerLoginQuery>({
      token: session.accessToken,
      query: "query { viewer { login } }",
    });
    const login = viewer.viewer.login;

    const accessibleRepos = await listAccessibleOrgRepoFullNames({ token: session.accessToken, org });

    if (!accessibleRepos.length) {
      return NextResponse.json({
        login,
        rank: 0,
        totalUsers: 0,
        percentile: 0,
        totalRank: { rank: 0, total: 0 },
        prRank: { rank: 0, total: 0 },
        reviewRank: { rank: 0, total: 0 },
        commitRank: { rank: 0, total: 0 },
      });
    }

    const reviewOtherWhere = {
      OR: [{ pullRequestAuthorLogin: null }, { pullRequestAuthorLogin: { not: login } }],
    };

    // Get all contributors' stats
    const [prStats, reviewStats, commitStats] = await Promise.all([
      prisma.pullRequestRecord.groupBy({
        by: ["authorLogin"],
        where: { org, year, repo: { in: accessibleRepos }, authorLogin: { not: null } },
        _count: { _all: true },
      }),
      prisma.pullRequestReviewRecord.groupBy({
        by: ["reviewerLogin"],
        where: { org, year, repo: { in: accessibleRepos }, ...reviewOtherWhere },
        _count: { _all: true },
      }),
      prisma.commitRecord.groupBy({
        by: ["authorLogin"],
        where: { org, year, repo: { in: accessibleRepos }, authorLogin: { not: null } },
        _count: { _all: true },
      }),
    ]);

    // Build contributor stats map
    const contributors = new Map<string, ContributorStats>();

    for (const row of prStats) {
      if (!row.authorLogin) continue;
      contributors.set(row.authorLogin, {
        login: row.authorLogin,
        prs: row._count._all,
        reviews: 0,
        commits: 0,
        total: row._count._all,
      });
    }

    for (const row of reviewStats) {
      const existing = contributors.get(row.reviewerLogin) ?? {
        login: row.reviewerLogin,
        prs: 0,
        reviews: 0,
        commits: 0,
        total: 0,
      };
      existing.reviews = row._count._all;
      existing.total = existing.prs + existing.reviews + existing.commits;
      contributors.set(row.reviewerLogin, existing);
    }

    for (const row of commitStats) {
      if (!row.authorLogin) continue;
      const existing = contributors.get(row.authorLogin) ?? {
        login: row.authorLogin,
        prs: 0,
        reviews: 0,
        commits: 0,
        total: 0,
      };
      existing.commits = row._count._all;
      existing.total = existing.prs + existing.reviews + existing.commits;
      contributors.set(row.authorLogin, existing);
    }

    // Convert to array and sort by total contributions (descending)
    const allContributors = Array.from(contributors.values()).filter((c) => c.total > 0);

    // Sort by total
    const sortedByTotal = [...allContributors].sort((a, b) => b.total - a.total);
    const totalRank = sortedByTotal.findIndex((c) => c.login === login) + 1;

    // Sort by PRs
    const sortedByPrs = [...allContributors].sort((a, b) => b.prs - a.prs);
    const prRank = sortedByPrs.findIndex((c) => c.login === login) + 1;

    // Sort by Reviews
    const sortedByReviews = [...allContributors].sort((a, b) => b.reviews - a.reviews);
    const reviewRank = sortedByReviews.findIndex((c) => c.login === login) + 1;

    // Sort by Commits
    const sortedByCommits = [...allContributors].sort((a, b) => b.commits - a.commits);
    const commitRank = sortedByCommits.findIndex((c) => c.login === login) + 1;

    const totalUsers = allContributors.length;
    // Top X% means you're within the first X% of contributors.
    // Example: rank=10,total=100 => Top 10% (not Top 90%).
    const percentile =
      totalRank > 0 && totalUsers > 0
        ? Math.min(100, Math.max(1, Math.ceil((totalRank / totalUsers) * 100)))
        : 0;

    return NextResponse.json({
      login,
      rank: totalRank,
      totalUsers,
      percentile,
      totalRank: { rank: totalRank, total: totalUsers },
      prRank: { rank: prRank, total: totalUsers },
      reviewRank: { rank: reviewRank, total: totalUsers },
      commitRank: { rank: commitRank, total: totalUsers },
    });
  } catch (err) {
    const message = formatError(err);
    console.error("GET /api/org-cache/ranking failed", { message });

    return NextResponse.json(
      {
        error: "internal_error",
        message: message.slice(0, 500),
      },
      { status: 500 },
    );
  }
}
