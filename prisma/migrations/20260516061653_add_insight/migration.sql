-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insight_audience_scope_expiresAt_idx" ON "Insight"("audience", "scope", "expiresAt");

-- CreateIndex
CREATE INDEX "Insight_scope_createdAt_idx" ON "Insight"("scope", "createdAt");
