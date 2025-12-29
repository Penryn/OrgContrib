-- CreateTable
CREATE TABLE "AiCommentaryCache" (
    "id" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "commentary" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCommentaryCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCommentaryCache_org_date_idx" ON "AiCommentaryCache"("org", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AiCommentaryCache_userLogin_org_date_key" ON "AiCommentaryCache"("userLogin", "org", "date");

