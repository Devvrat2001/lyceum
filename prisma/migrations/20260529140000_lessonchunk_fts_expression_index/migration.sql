-- Restore full-text search for LessonChunk after `searchable` was lost.
--
-- The original `add_lesson_chunks` migration created a generated
-- `searchable` tsvector COLUMN plus a GIN index over it. A later
-- `prisma migrate dev` (`attempt_polymorphic`) saw that column as drift
-- — it isn't in schema.prisma because Prisma can't model tsvector — and
-- dropped it. That left `findCitation`'s `ts_rank("searchable", ...)`
-- query referencing a column that no longer existed, which threw
-- ColumnNotFound and 500'd the entire AI tutor before it could stream.
--
-- Fix: back the search with a GIN *expression* index instead of a
-- stored column. An expression index has no column for Prisma to diff,
-- so it survives future `migrate dev` runs. `findCitation` computes the
-- identical `to_tsvector('english', coalesce("content", ''))`
-- expression inline so the planner can use this index.

-- Defensive cleanup for any environment still holding the old artifacts.
DROP INDEX IF EXISTS "LessonChunk_searchable_idx";
ALTER TABLE "LessonChunk" DROP COLUMN IF EXISTS "searchable";

-- GIN expression index backing findCitation().
CREATE INDEX IF NOT EXISTS "LessonChunk_content_fts_idx"
  ON "LessonChunk"
  USING GIN (to_tsvector('english', coalesce("content", '')));
