import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getShanghaiYear, getShanghaiYearStartUtcForYear } from "@/lib/time";

export const runtime = "nodejs";

const DEFAULT_ORG_LOGIN = "zjutjh";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const org = process.env.ORG_LOGIN ?? DEFAULT_ORG_LOGIN;
  const year = Number(process.env.ORG_CACHE_YEAR ?? getShanghaiYear(now));
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "invalid_year" }, { status: 500 });
  }
  const fromUtc = getShanghaiYearStartUtcForYear(year);

  const row = await prisma.orgYearCache.findUnique({
    where: {
      org_year: {
        org,
        year,
      },
    },
    select: {
      org: true,
      year: true,
      timezone: true,
      from: true,
      to: true,
      computedAt: true,
      status: true,
      progress: true,
      totalRepos: true,
      message: true,
      jobId: true,
      totals: true,
      updatedAt: true,
    },
  });

  if (!row) {
    return NextResponse.json({
      org,
      year,
      timezone: "Asia/Shanghai",
      from: fromUtc.toISOString(),
      to: now.toISOString(),
      computedAt: null,
      status: "not_started",
      progress: 0,
      totalRepos: null,
      message: null,
      jobId: null,
      totals: {},
      updatedAt: null,
    });
  }

  return NextResponse.json({
    org: row.org,
    year: row.year,
    timezone: row.timezone,
    from: row.from.toISOString(),
    to: row.to.toISOString(),
    computedAt: row.computedAt ? row.computedAt.toISOString() : null,
    status: row.status,
    progress: row.progress,
    totalRepos: row.totalRepos ?? null,
    message: row.message ?? null,
    jobId: row.jobId ?? null,
    totals: row.totals ?? {},
    updatedAt: row.updatedAt.toISOString(),
  });
}
