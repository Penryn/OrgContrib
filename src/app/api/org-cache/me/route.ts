import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatError, includesFetchFailedMessage } from "@/lib/errors";
import { githubGraphql } from "@/lib/github";
import { listAccessibleOrgRepoFullNames } from "@/lib/githubRest";
import { getShanghaiYear } from "@/lib/time";

export const runtime = "nodejs";

const DEFAULT_ORG_LOGIN = "zjutjh";

type ViewerLoginQuery = { viewer: { login: string } };

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

    const cache = await prisma.orgYearCache.findUnique({
      where: {
        org_year: {
          org,
          year,
        },
      },
      select: { status: true, progress: true, message: true, updatedAt: true },
    });

    if (!cache || cache.status !== "completed") {
      return NextResponse.json(
        {
          error: "cache_not_ready",
          status: cache?.status ?? "not_started",
          progress: cache?.progress ?? 0,
          message: cache?.message ?? null,
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
        org,
        year,
        viewer: { login },
        scope: { accessibleRepos: 0 },
        totals: { prs: 0, reviewedPrs: 0, commits: 0 },
        byRepo: [],
        recent: { prs: [], reviews: [], commits: [], limit: 50 },
      });
    }

    const reviewOtherWhere = {
      OR: [{ pullRequestAuthorLogin: null }, { pullRequestAuthorLogin: { not: login } }],
    };

    const [prByRepo, reviewByRepo, commitByRepo, recentPrs, recentReviews, recentCommits] = await Promise.all([
      prisma.pullRequestRecord.groupBy({
        by: ["repo"],
        where: { org, year, repo: { in: accessibleRepos }, authorLogin: login },
        _count: { _all: true },
      }),
      prisma.pullRequestReviewRecord.groupBy({
        by: ["repo"],
        where: { org, year, repo: { in: accessibleRepos }, reviewerLogin: login, ...reviewOtherWhere },
        _count: { _all: true },
      }),
      prisma.commitRecord.groupBy({
        by: ["repo"],
        where: { org, year, repo: { in: accessibleRepos }, authorLogin: login },
        _count: { _all: true },
      }),
      prisma.pullRequestRecord.findMany({
        where: { org, year, repo: { in: accessibleRepos }, authorLogin: login },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          repo: true,
          number: true,
          title: true,
          url: true,
          state: true,
          createdAt: true,
          mergedAt: true,
        },
      }),
      prisma.pullRequestReviewRecord.findMany({
        where: { org, year, repo: { in: accessibleRepos }, reviewerLogin: login, ...reviewOtherWhere },
        orderBy: { reviewedAt: "desc" },
        take: 50,
        select: {
          repo: true,
          pullRequestNumber: true,
          pullRequestTitle: true,
          pullRequestUrl: true,
          reviewedAt: true,
        },
      }),
      prisma.commitRecord.findMany({
        where: { org, year, repo: { in: accessibleRepos }, authorLogin: login },
        orderBy: { committedDate: "desc" },
        take: 50,
        select: {
          repo: true,
          oid: true,
          messageHeadline: true,
          url: true,
          committedDate: true,
        },
      }),
    ]);

    type RepoRow = { repo: string; prs: number; reviewedPrs: number; commits: number; total: number };

    const byRepo = new Map<string, RepoRow>();

    for (const row of prByRepo) {
      byRepo.set(row.repo, {
        repo: row.repo,
        prs: row._count._all,
        reviewedPrs: 0,
        commits: 0,
        total: row._count._all,
      });
    }
    for (const row of reviewByRepo) {
      const existing = byRepo.get(row.repo) ?? { repo: row.repo, prs: 0, reviewedPrs: 0, commits: 0, total: 0 };
      existing.reviewedPrs = row._count._all;
      existing.total = existing.prs + existing.reviewedPrs + existing.commits;
      byRepo.set(row.repo, existing);
    }
    for (const row of commitByRepo) {
      const existing = byRepo.get(row.repo) ?? { repo: row.repo, prs: 0, reviewedPrs: 0, commits: 0, total: 0 };
      existing.commits = row._count._all;
      existing.total = existing.prs + existing.reviewedPrs + existing.commits;
      byRepo.set(row.repo, existing);
    }

    const repoRows = Array.from(byRepo.values())
      .filter((r) => r.total > 0)
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.commits !== a.commits) return b.commits - a.commits;
        if (b.prs !== a.prs) return b.prs - a.prs;
        return a.repo.localeCompare(b.repo);
      });

    const totals = repoRows.reduce(
      (acc, row) => {
        acc.prs += row.prs;
        acc.reviewedPrs += row.reviewedPrs;
        acc.commits += row.commits;
        return acc;
      },
      { prs: 0, reviewedPrs: 0, commits: 0 },
    );

    return NextResponse.json({
      org,
      year,
      viewer: { login },
      scope: { accessibleRepos: accessibleRepos.length },
      totals,
      byRepo: repoRows,
      recent: {
        prs: recentPrs.map((pr) => ({
          repo: pr.repo,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          state: pr.state,
          createdAt: pr.createdAt.toISOString(),
          mergedAt: pr.mergedAt ? pr.mergedAt.toISOString() : null,
        })),
        reviews: recentReviews.map((r) => ({
          repo: r.repo,
          number: r.pullRequestNumber,
          title: r.pullRequestTitle,
          url: r.pullRequestUrl,
          reviewedAt: r.reviewedAt.toISOString(),
        })),
        commits: recentCommits.map((c) => ({
          repo: c.repo,
          oid: c.oid,
          messageHeadline: c.messageHeadline,
          url: c.url,
          committedDate: c.committedDate.toISOString(),
        })),
        limit: 50,
      },
    });
  } catch (err) {
    const message = formatError(err);
    console.error("GET /api/org-cache/me failed", { message });

    const hints: string[] = [];
    if (!process.env.DATABASE_URL) hints.push("missing DATABASE_URL");
    if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) hints.push("missing NEXTAUTH_SECRET/AUTH_SECRET");
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) hints.push("missing GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET");
    if (includesFetchFailedMessage(err)) {
      hints.push("network/proxy/DNS/TLS issue reaching api.github.com (check HTTPS_PROXY/HTTP_PROXY, corporate proxy, and connectivity)");
    }

    return NextResponse.json(
      {
        error: "internal_error",
        message: message.slice(0, 500),
        hints,
      },
      { status: 500 },
    );
  }
}
