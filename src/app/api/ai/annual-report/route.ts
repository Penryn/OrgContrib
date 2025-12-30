import { NextResponse } from "next/server";

import { z } from "zod";

import { auth } from "@/auth";
import { aiCommentarySchema, annualReportMetricsSchema, fallbackAnnualReport, generateAiAnnualReport } from "@/lib/ai/annualReport";
import { prisma } from "@/lib/db";
import { githubGraphql } from "@/lib/github";
import { listAccessibleOrgRepoFullNames } from "@/lib/githubRest";
import { getShanghaiYear, getShanghaiYearStartUtcForYear } from "@/lib/time";

export const runtime = "nodejs";

const DEFAULT_ORG_LOGIN = "zjutjh";

type ApiResponse =
  | {
      source: "ai" | "fallback";
      report: z.infer<typeof aiCommentarySchema>;
      error?: string;
    }
  | { error: string };

type ViewerLoginQuery = { viewer: { login: string } };

function isFresh(date: Date, now: Date): boolean {
  const diffMs = now.getTime() - date.getTime();
  return diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
}

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" } satisfies ApiResponse, { status: 401 });
  }

  const org = process.env.ORG_LOGIN ?? DEFAULT_ORG_LOGIN;
  const now = new Date();
  const year = Number(process.env.ORG_CACHE_YEAR ?? getShanghaiYear(now));
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "invalid_year" } satisfies ApiResponse, { status: 500 });
  }

  const fromUtc = getShanghaiYearStartUtcForYear(year);
  const toUtc = now;

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
    return NextResponse.json({ error: "cache_not_ready" } satisfies ApiResponse, { status: 409 });
  }

  const viewer = await githubGraphql<ViewerLoginQuery>({
    token: session.accessToken,
    query: "query { viewer { login } }",
  });
  const login = viewer.viewer.login;

  const accessibleRepos = await listAccessibleOrgRepoFullNames({ token: session.accessToken, org });

  const cached = await prisma.aiAnnualReportCache.findUnique({
    where: {
      userLogin_org_year: {
        userLogin: login,
        org,
        year,
      },
    },
    select: {
      source: true,
      report: true,
      error: true,
      updatedAt: true,
    },
  });

  if (cached && isFresh(cached.updatedAt, now)) {
    const parsed = aiCommentarySchema.safeParse(cached.report);
    if (parsed.success) {
      return NextResponse.json({
        source: cached.source === "ai" ? "ai" : "fallback",
        report: parsed.data,
        error: cached.error ?? undefined,
      } satisfies ApiResponse);
    }
  }

  const reviewOtherWhere = {
    OR: [{ pullRequestAuthorLogin: null }, { pullRequestAuthorLogin: { not: login } }],
  };

  const repoFilter = accessibleRepos.length ? { in: accessibleRepos } : { in: ["__none__"] };

  const [
    prAgg,
    reviewAgg,
    commitAgg,
    prRepoCounts,
    reviewRepoCounts,
    commitRepoCounts,
    prDaysRows,
    reviewDaysRows,
    commitDaysRows,
  ] = await Promise.all([
    prisma.pullRequestRecord.aggregate({
      where: { org, year, repo: repoFilter, authorLogin: login },
      _count: { _all: true },
      _sum: { additions: true, deletions: true },
    }),
    prisma.pullRequestReviewRecord.aggregate({
      where: { org, year, repo: repoFilter, reviewerLogin: login, ...reviewOtherWhere },
      _count: { _all: true },
    }),
    prisma.commitRecord.aggregate({
      where: { org, year, repo: repoFilter, authorLogin: login },
      _count: { _all: true },
      _sum: { additions: true, deletions: true },
    }),
    prisma.pullRequestRecord.groupBy({
      by: ["repo"],
      where: { org, year, repo: repoFilter, authorLogin: login },
      _count: { _all: true },
    }),
    prisma.pullRequestReviewRecord.groupBy({
      by: ["repo"],
      where: { org, year, repo: repoFilter, reviewerLogin: login, ...reviewOtherWhere },
      _count: { _all: true },
    }),
    prisma.commitRecord.groupBy({
      by: ["repo"],
      where: { org, year, repo: repoFilter, authorLogin: login },
      _count: { _all: true },
    }),
    prisma.pullRequestRecord.findMany({
      where: { org, year, repo: repoFilter, authorLogin: login, createdAtLocal: { not: null } },
      distinct: ["createdAtLocal"],
      select: { createdAtLocal: true },
    }),
    prisma.pullRequestReviewRecord.findMany({
      where: { org, year, repo: repoFilter, reviewerLogin: login, reviewedAtLocal: { not: null }, ...reviewOtherWhere },
      distinct: ["reviewedAtLocal"],
      select: { reviewedAtLocal: true },
    }),
    prisma.commitRecord.findMany({
      where: { org, year, repo: repoFilter, authorLogin: login, committedDateLocal: { not: null } },
      distinct: ["committedDateLocal"],
      select: { committedDateLocal: true },
    }),
  ]);

  const repoTotals = new Map<string, number>();
  for (const row of prRepoCounts) repoTotals.set(row.repo, (repoTotals.get(row.repo) ?? 0) + row._count._all);
  for (const row of reviewRepoCounts) repoTotals.set(row.repo, (repoTotals.get(row.repo) ?? 0) + row._count._all);
  for (const row of commitRepoCounts) repoTotals.set(row.repo, (repoTotals.get(row.repo) ?? 0) + row._count._all);

  const activities = Array.from(repoTotals.values());
  const totalActivities = activities.reduce((sum, n) => sum + n, 0);
  const sorted = [...activities].sort((a, b) => b - a);
  const top1Share = totalActivities > 0 ? Number((sorted[0]! / totalActivities).toFixed(4)) : null;
  const top3Sum = sorted.slice(0, 3).reduce((sum, n) => sum + n, 0);
  const top3Share = totalActivities > 0 ? Number((top3Sum / totalActivities).toFixed(4)) : null;

  const daySet = new Set<string>();
  for (const row of prDaysRows) if (row.createdAtLocal) daySet.add(row.createdAtLocal);
  for (const row of reviewDaysRows) if (row.reviewedAtLocal) daySet.add(row.reviewedAtLocal);
  for (const row of commitDaysRows) if (row.committedDateLocal) daySet.add(row.committedDateLocal);

  const reviewToPrRatio =
    prAgg._count._all > 0 ? Number((reviewAgg._count._all / prAgg._count._all).toFixed(4)) : null;

  const metrics = annualReportMetricsSchema.parse({
    org,
    year,
    timezone: "Asia/Shanghai",
    from: fromUtc.toISOString(),
    to: toUtc.toISOString(),
    totals: {
      prs: prAgg._count._all,
      reviewedPrs: reviewAgg._count._all,
      commits: commitAgg._count._all,
      prAdditions: prAgg._sum.additions ?? null,
      prDeletions: prAgg._sum.deletions ?? null,
      commitAdditions: commitAgg._sum.additions ?? null,
      commitDeletions: commitAgg._sum.deletions ?? null,
      contributingRepos: repoTotals.size,
      activeDays: daySet.size,
    },
    repos: {
      top1Share,
      top3Share,
    },
    mix: {
      reviewToPrRatio,
    },
    notes: {
      commitScope: "refs/heads/* history, dedup by oid, excluding merge commits",
      prScope: "PRs created within the year",
    },
  });

  try {
    const report = await generateAiAnnualReport(metrics);

    await prisma.aiAnnualReportCache.upsert({
      where: {
        userLogin_org_year: {
          userLogin: login,
          org,
          year,
        },
      },
      update: {
        source: "ai",
        report,
        metrics,
        error: null,
      },
      create: {
        userLogin: login,
        org,
        year,
        source: "ai",
        report,
        metrics,
        error: null,
      },
    });

    return NextResponse.json({ source: "ai", report } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const report = fallbackAnnualReport(metrics);

    await prisma.aiAnnualReportCache.upsert({
      where: {
        userLogin_org_year: {
          userLogin: login,
          org,
          year,
        },
      },
      update: {
        source: "fallback",
        report,
        metrics,
        error: message,
      },
      create: {
        userLogin: login,
        org,
        year,
        source: "fallback",
        report,
        metrics,
        error: message,
      },
    });

    return NextResponse.json({ source: "fallback", report, error: message } satisfies ApiResponse);
  }
}
