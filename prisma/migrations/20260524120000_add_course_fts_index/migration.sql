-- Expression-indexed full-text vector for hybrid search. We don't add
-- a stored tsvector column because Prisma 7 doesn't model GENERATED
-- ALWAYS AS cleanly, and the expression index gives us the same query
-- performance — Postgres uses the index automatically when the WHERE
-- predicate matches the expression.
--
-- coalesce() guards against NULL tagline (most other columns are NOT
-- NULL but tagline is). 'english' is fine for the K-12 catalog; if we
-- ever index non-English content, switch to 'simple' or a multi-config
-- setup with langid detection.
--
-- The companion query in marketplace.semanticSearch uses
-- `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(tagline,'') || ' ' || coalesce(description,''))`
-- — keep both in sync, otherwise the planner won't pick the index.
CREATE INDEX IF NOT EXISTS "Course_fts_idx" ON "Course"
  USING GIN (
    to_tsvector(
      'english',
      coalesce("title", '') || ' ' ||
      coalesce("tagline", '') || ' ' ||
      coalesce("description", '')
    )
  );
