import { Queue } from "bullmq";
import IORedis from "ioredis";

import type { CommitScanJobData, OrgYearSyncJobData } from "@/lib/jobs";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let cached: Queue<CommitScanJobData> | null = null;
let orgYearSyncCached: Queue<OrgYearSyncJobData> | null = null;

export function getCommitScanQueue(): Queue<CommitScanJobData> {
  if (cached) return cached;

  cached = new Queue<CommitScanJobData>("commit-scan", {
    connection: new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    }),
  });

  return cached;
}

export function getOrgYearSyncQueue(): Queue<OrgYearSyncJobData> {
  if (orgYearSyncCached) return orgYearSyncCached;

  orgYearSyncCached = new Queue<OrgYearSyncJobData>("org-year-sync", {
    connection: new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    }),
  });

  return orgYearSyncCached;
}
