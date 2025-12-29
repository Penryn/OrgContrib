import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { githubGraphql } from "@/lib/github";
import type { CommitScanJobData } from "@/lib/jobs";
import { commitScanQueue } from "@/lib/queue";
import { getShanghaiYear, getShanghaiYearStartUtc } from "@/lib/time";

export const runtime = "nodejs";

const ORG_LOGIN = "zjutjh";

type ViewerQuery = { viewer: { login: string; id: string } };

type EmailItem = { email: string; verified: boolean };

type RestUser = { id: number; login: string };

async function listVerifiedEmails(token: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });

    if (!res.ok) return [];

    const json = (await res.json()) as EmailItem[];
    return json.filter((e) => e.verified).map((e) => e.email);
  } catch {
    return [];
  }
}

async function getRestViewer(token: string): Promise<RestUser | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return (await res.json()) as RestUser;
  } catch {
    return null;
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = getShanghaiYear(now);
  const fromUtc = getShanghaiYearStartUtc(now);
  const toUtc = now;

  const viewer = await githubGraphql<ViewerQuery>({
    token: session.accessToken,
    query: "query { viewer { login id } }",
  });

  const [verifiedEmails, restViewer] = await Promise.all([
    listVerifiedEmails(session.accessToken),
    getRestViewer(session.accessToken),
  ]);

  const authorEmailSet = new Set<string>(verifiedEmails);
  authorEmailSet.add(`${viewer.viewer.login}@users.noreply.github.com`);
  if (restViewer?.id) {
    authorEmailSet.add(`${restViewer.id}+${viewer.viewer.login}@users.noreply.github.com`);
  }
  const authorEmails = Array.from(authorEmailSet);

  const job = await prisma.job.create({
    data: {
      userLogin: viewer.viewer.login,
      type: "commit_scan",
      status: "queued",
      progress: 0,
      message: "queued",
    },
  });

  await prisma.snapshot.upsert({
    where: {
      userLogin_org_year: {
        userLogin: viewer.viewer.login,
        org: ORG_LOGIN,
        year,
      },
    },
    update: {
      timezone: "Asia/Shanghai",
      from: fromUtc,
      to: toUtc,
      computedAt: new Date(),
      totals: { commits: null },
      byRepo: {},
      byWeek: {},
      commitsStatus: "queued",
    },
    create: {
      userLogin: viewer.viewer.login,
      org: ORG_LOGIN,
      year,
      timezone: "Asia/Shanghai",
      from: fromUtc,
      to: toUtc,
      computedAt: new Date(),
      totals: { commits: null },
      byRepo: {},
      byWeek: {},
      commitsStatus: "queued",
    },
  });

  const payload: CommitScanJobData = {
    jobId: job.id,
    org: ORG_LOGIN,
    year,
    from: fromUtc.toISOString(),
    to: toUtc.toISOString(),
    accessToken: session.accessToken,
    userLogin: viewer.viewer.login,
    userId: viewer.viewer.id,
    authorEmails,
  };

  await commitScanQueue.add("commit_scan", payload, {
    jobId: job.id,
    removeOnComplete: 50,
    removeOnFail: 50,
  });

  return NextResponse.json({ jobId: job.id });
}
