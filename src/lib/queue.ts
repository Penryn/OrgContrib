import { Queue } from "bullmq";
import IORedis from "ioredis";

import type { CommitScanJobData } from "@/lib/jobs";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let cached: Queue<CommitScanJobData> | null = null;

export function getCommitScanQueue(): Queue<CommitScanJobData> {
  if (cached) return cached;

  cached = new Queue<CommitScanJobData>("commit-scan", {
    connection: new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    }),
  });

  return cached;
}
