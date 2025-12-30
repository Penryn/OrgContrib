-- ExtendEnum
ALTER TYPE "JobType" ADD VALUE 'org_year_sync';

-- CreateEnum
CREATE TYPE "CacheStatus" AS ENUM ('not_started', 'queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "OrgYearCache" (
    "id" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3),
    "status" "CacheStatus" NOT NULL DEFAULT 'not_started',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalRepos" INTEGER,
    "message" TEXT,
    "jobId" TEXT,
    "totals" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgYearCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestRecord" (
    "id" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "repo" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "authorLogin" TEXT,
    "additions" INTEGER,
    "deletions" INTEGER,
    "changedFiles" INTEGER,
    "createdAtLocal" TEXT,

    CONSTRAINT "PullRequestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitRecord" (
    "repo" TEXT NOT NULL,
    "oid" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "committedDate" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "messageHeadline" TEXT NOT NULL,
    "isMerge" BOOLEAN NOT NULL DEFAULT false,
    "authorLogin" TEXT,
    "authorEmail" TEXT,
    "authorName" TEXT,
    "additions" INTEGER,
    "deletions" INTEGER,
    "changedFiles" INTEGER,
    "committedDateLocal" TEXT,

    CONSTRAINT "CommitRecord_pkey" PRIMARY KEY ("repo","oid")
);

-- CreateTable
CREATE TABLE "AiAnnualReportCache" (
    "id" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAnnualReportCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgYearCache_org_year_key" ON "OrgYearCache"("org", "year");

-- CreateIndex
CREATE INDEX "OrgYearCache_org_year_idx" ON "OrgYearCache"("org", "year");

-- CreateIndex
CREATE INDEX "PullRequestRecord_org_year_idx" ON "PullRequestRecord"("org", "year");

-- CreateIndex
CREATE INDEX "PullRequestRecord_org_year_repo_idx" ON "PullRequestRecord"("org", "year", "repo");

-- CreateIndex
CREATE INDEX "PullRequestRecord_org_year_authorLogin_idx" ON "PullRequestRecord"("org", "year", "authorLogin");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestRecord_org_repo_number_key" ON "PullRequestRecord"("org", "repo", "number");

-- CreateIndex
CREATE INDEX "CommitRecord_org_year_idx" ON "CommitRecord"("org", "year");

-- CreateIndex
CREATE INDEX "CommitRecord_org_year_repo_idx" ON "CommitRecord"("org", "year", "repo");

-- CreateIndex
CREATE INDEX "CommitRecord_org_year_authorLogin_idx" ON "CommitRecord"("org", "year", "authorLogin");

-- CreateIndex
CREATE UNIQUE INDEX "AiAnnualReportCache_userLogin_org_year_key" ON "AiAnnualReportCache"("userLogin", "org", "year");

-- CreateIndex
CREATE INDEX "AiAnnualReportCache_org_year_idx" ON "AiAnnualReportCache"("org", "year");

