import "server-only";
import { getOpenAI, isOpenAIEnabled } from "./openai";

/**
 * Embedding model used for course catalog + query embeddings.
 *
 * text-embedding-3-small:
 *   - 1536 dims (matches Course.embedding column)
 *   - $0.02 / 1M tokens (~$0.0002 per course, ~$0.00002 per query)
 *   - 5x cheaper than -large with ~90% of the recall on short docs
 *
 * If we ever need higher quality, switching to text-embedding-3-large
 * requires bumping Course.embedding to vector(3072) and re-embedding
 * the whole catalog — keep an eye on EMBEDDING_DIM if it ever changes.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

/**
 * Embed a single string. Returns null when OPENAI_API_KEY isn't
 * configured so callers can fall back gracefully (e.g., the marketplace
 * router routes to ILIKE search when this returns null).
 *
 * The input is truncated to a reasonable max to keep token bills
 * bounded — embeddings of full novel-length text don't add value
 * over a few-hundred-token summary.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!isOpenAIEnabled()) return null;
  const client = getOpenAI()!;
  // ~8k chars ≈ 2k tokens — well under the 8192 input limit but plenty
  // for a course description.
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;

  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding length mismatch: got ${vec?.length ?? 0}, expected ${EMBEDDING_DIM}`
    );
  }
  return vec;
}

/**
 * Format a number[] as a pgvector literal string for $queryRaw.
 *
 * pgvector accepts `'[0.1, 0.2, …]'::vector` as text input. Prisma's
 * `$queryRaw` passes parameters as plain values; we serialize the
 * array client-side and let Postgres parse + cast.
 *
 * Caller is responsible for adding `::vector(1536)` in the SQL.
 */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Build the canonical "embed me" text for a Course. Same composition
 * used at write time (course create/update) and at backfill time so
 * embeddings stay consistent across the catalog.
 *
 * Fields chosen: title carries the most signal; tagline + description
 * disambiguate similar titles; subject + grade help cluster by domain
 * even when the user query is generic ("math for 8th graders").
 */
export function courseEmbedText(args: {
  title: string;
  tagline: string | null;
  description: string;
  subject: string;
  grade: string;
}): string {
  return [
    args.title,
    args.tagline ?? "",
    args.description,
    `Subject: ${args.subject}`,
    `Grade: ${args.grade}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * True when we can embed text. Used to gate the semantic search code
 * path — if false, callers should fall back to ILIKE / tsvector.
 */
export function isEmbeddingsEnabled(): boolean {
  return isOpenAIEnabled();
}
