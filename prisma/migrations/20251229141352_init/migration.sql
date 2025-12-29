-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('commit_scan');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "totals" JSONB NOT NULL,
    "byRepo" JSONB NOT NULL,
    "byWeek" JSONB NOT NULL,
    "commitsStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_userLogin_createdAt_idx" ON "Job"("userLogin", "createdAt");

-- CreateIndex
CREATE INDEX "Snapshot_org_year_idx" ON "Snapshot"("org", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_userLogin_org_year_key" ON "Snapshot"("userLogin", "org", "year");
