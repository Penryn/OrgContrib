-- CreateTable
CREATE TABLE "PullRequestReviewRecord" (
    "pullRequestId" TEXT NOT NULL,
    "reviewerLogin" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "repo" TEXT NOT NULL,
    "pullRequestNumber" INTEGER NOT NULL,
    "pullRequestTitle" TEXT NOT NULL,
    "pullRequestUrl" TEXT NOT NULL,
    "pullRequestAuthorLogin" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAtLocal" TEXT,

    CONSTRAINT "PullRequestReviewRecord_pkey" PRIMARY KEY ("pullRequestId","reviewerLogin")
);

-- CreateIndex
CREATE INDEX "PullRequestReviewRecord_org_year_idx" ON "PullRequestReviewRecord"("org", "year");

-- CreateIndex
CREATE INDEX "PullRequestReviewRecord_org_year_repo_idx" ON "PullRequestReviewRecord"("org", "year", "repo");

-- CreateIndex
CREATE INDEX "PullRequestReviewRecord_org_year_reviewerLogin_idx" ON "PullRequestReviewRecord"("org", "year", "reviewerLogin");

