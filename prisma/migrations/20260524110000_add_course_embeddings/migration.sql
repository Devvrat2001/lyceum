-- pgvector extension for embedding-based semantic search on the
-- marketplace header. Available on Neon (where prod runs) and the
-- standard Postgres docker image (where local dev runs).
CREATE EXTENSION IF NOT EXISTS vector;

-- 1536-dim vector matches OpenAI's text-embedding-3-small output.
-- Nullable so existing rows survive the migration — the backfill
-- script (`scripts/backfill-course-embeddings.ts`) populates them in
-- batches, and `marketplace.semanticSearch` filters by IS NOT NULL.
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- HNSW index with cosine-distance opclass. The `<=>` operator pgvector
-- uses for ORDER BY needs `vector_cosine_ops` to traverse the index;
-- the default opclass is L2, which would silently degrade to a seq scan.
-- m=16, ef_construction=64 are pgvector's recommended defaults — good
-- recall on catalogs up to ~1M rows, fast build.
CREATE INDEX IF NOT EXISTS "Course_embedding_hnsw_idx"
  ON "Course" USING hnsw ("embedding" vector_cosine_ops);
