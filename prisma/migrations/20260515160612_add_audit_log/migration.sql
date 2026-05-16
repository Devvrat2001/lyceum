-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "lessonId" TEXT,
    "courseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redactedAt" TIMESTAMP(3),

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_kind_createdAt_idx" ON "AuditLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_courseId_createdAt_idx" ON "AuditLog"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_lessonId_createdAt_idx" ON "AuditLog"("lessonId", "createdAt");
