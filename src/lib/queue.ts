import { Queue } from "bullmq";
import IORedis from "ioredis";

import type { CommitScanJobData } from "@/lib/jobs";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const commitScanQueue = new Queue<CommitScanJobData>("commit-scan", {
  connection: new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  }),
});
