import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type CitationHit = {
  page: number;
  section: string | null;
  snippet: string;
  score: number;
};

/**
 * Look up the best-matching lesson chunk for a free-text query.
 *
 * Uses Postgres full-text search (`plainto_tsquery` + `ts_rank`) against
 * the `LessonChunk.searchable` GIN-indexed tsvector column. The same
 * call site shape will work when we swap pgvector + dense embeddings
 * in (P3+) — only the SQL inside this function changes.
 *
 * Returns `null` when no chunk matches at all OR when the corpus
 * for that lesson is empty. Caller should fall back to a generic
 * citation referencing the course/unit titles.
 */
export async function findCitation(args: {
  query: string;
  lessonId: string;
}): Promise<CitationHit | null> {
  const q = args.query.trim();
  if (!q) return null;

  // plainto_tsquery handles arbitrary user text safely (no need to
  // sanitize for tsquery syntax). It returns no rows when the query
  // produces no lexemes.
  const rows = await db.$queryRaw<
    Array<{ page: number; section: string | null; content: string; score: number }>
  >(Prisma.sql`
    SELECT
      "page",
      "section",
      "content",
      ts_rank("searchable", plainto_tsquery('english', ${q})) AS score
    FROM "LessonChunk"
    WHERE "lessonId" = ${args.lessonId}
      AND "searchable" @@ plainto_tsquery('english', ${q})
    ORDER BY score DESC
    LIMIT 1
  `);

  const top = rows[0];
  if (!top) return null;

  // Trim the snippet for display — citations footer in the tutor UI
  // is small.
  const snippet =
    top.content.length > 140
      ? top.content.slice(0, 140).trim() + "…"
      : top.content;

  return {
    page: top.page,
    section: top.section,
    snippet,
    score: Number(top.score),
  };
}
