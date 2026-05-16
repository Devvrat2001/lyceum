-- CreateTable
CREATE TABLE "LessonChunk" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonChunk_lessonId_idx" ON "LessonChunk"("lessonId");

-- AddForeignKey
ALTER TABLE "LessonChunk" ADD CONSTRAINT "LessonChunk_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full-text search column + GIN index. Prisma can't model tsvector
-- natively, so we add it post-create. Generated STORED so writes are
-- transparent — every INSERT/UPDATE on `content` recomputes searchable.
ALTER TABLE "LessonChunk"
  ADD COLUMN "searchable" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;

CREATE INDEX "LessonChunk_searchable_idx" ON "LessonChunk" USING GIN ("searchable");
