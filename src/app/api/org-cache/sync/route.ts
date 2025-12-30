import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { githubGraphql } from "@/lib/github";
import type { OrgYearSyncJobData } from "@/lib/jobs";
import { getOrgYearSyncQueue } from "@/lib/queue";
import { getShanghaiYear, getShanghaiYearStartUtcForYear } from "@/lib/time";

export const runtime = "nodejs";

const DEFAULT_ORG_LOGIN = "zjutjh";

type ViewerQuery = { viewer: { login: string } };

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const syncToken = process.env.ORG_SYNC_GITHUB_TOKEN;
  if (!syncToken) {
    return NextResponse.json({ error: "missing_org_sync_token" }, { status: 500 });
  }

  const org = process.env.ORG_LOGIN ?? DEFAULT_ORG_LOGIN;
  const now = new Date();
  const year = Number(process.env.ORG_CACHE_YEAR ?? getShanghaiYear(now));
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "invalid_year" }, { status: 500 });
  }
  const fromUtc = getShanghaiYearStartUtcForYear(year);
  const toUtc = now;

  const existing = await prisma.orgYearCache.findUnique({
    where: {
      org_year: {
        org,
        year,
      },
    },
    select: {
      status: true,
      jobId: true,
    },
  });

  if ((existing?.status === "queued" || existing?.status === "running") && existing.jobId) {
    return NextResponse.json({ jobId: existing.jobId, reused: true });
  }

  const viewer = await githubGraphql<ViewerQuery>({
    token: session.accessToken,
    query: "query { viewer { login } }",
  });

  const job = await prisma.job.create({
    data: {
      userLogin: viewer.viewer.login,
      type: "org_year_sync",
      status: "queued",
      progress: 0,
      message: "queued",
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
      timezone: "Asia/Shanghai",
      from: fromUtc,
      to: toUtc,
      computedAt: null,
      status: "queued",
      progress: 0,
      totalRepos: null,
      message: "queued",
      jobId: job.id,
      totals: {},
    },
    create: {
      org,
      year,
      timezone: "Asia/Shanghai",
      from: fromUtc,
      to: toUtc,
      computedAt: null,
      status: "queued",
      progress: 0,
      totalRepos: null,
      message: "queued",
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
    timezone: "Asia/Shanghai",
    accessToken: syncToken,
    startedBy: viewer.viewer.login,
  };

  const queue = getOrgYearSyncQueue();
  await queue.add("org_year_sync", payload, {
    jobId: job.id,
    removeOnComplete: 20,
    removeOnFail: 20,
  });

  return NextResponse.json({ jobId: job.id, reused: false });
}
