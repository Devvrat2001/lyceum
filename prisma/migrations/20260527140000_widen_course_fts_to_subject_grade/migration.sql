-- Widen the FTS expression to include subject + grade so the BM25
-- ranker can match queries like "math" / "maths" / "grade 6" against
-- the catalog. Without these fields the previous index could only
-- match against title/tagline/description text — so a course with
-- subject="math" and no "math" in the title was invisible to BM25
-- for a "math" query.
--
-- Pattern: drop + recreate the expression-index. Postgres can't ALTER
-- the expression of an existing GIN index in place. Since the index is
-- not unique and small (under a million rows), the brief unavailability
-- is fine; the planner falls back to a seqscan for matching queries
-- between DROP and CREATE.
--
-- subject + grade are NOT NULL in the schema so no coalesce() needed
-- for them; tagline still needs the guard.
--
-- The companion query in marketplace.semanticSearch must use the
-- exact same expression — otherwise the planner won't pick the index.
DROP INDEX IF EXISTS "Course_fts_idx";

CREATE INDEX "Course_fts_idx" ON "Course"
  USING GIN (
    to_tsvector(
      'english',
      coalesce("title", '') || ' ' ||
      coalesce("tagline", '') || ' ' ||
      coalesce("description", '') || ' ' ||
      "subject" || ' ' ||
      "grade"
    )
  );
