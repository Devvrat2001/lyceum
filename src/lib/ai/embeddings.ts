import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * Embeddings are isolated from the chat completion client on purpose.
 * Course-builder calls are infrequent and warrant a top-tier model;
 * embedding calls fire on every catalog change AND every typeahead
 * keystroke, so they belong on a cheaper / lower-tier key when the
 * deployment can afford to separate them.
 *
 * Key resolution:
 *   - If OPENAI_EMBEDDING_API_KEY is set, use that.
 *   - Else fall back to OPENAI_API_KEY (single-key deployments).
 *   - Else embeddings are disabled — semanticSearch degrades to ILIKE.
 *
 * Model:
 *   OPENAI_EMBEDDING_MODEL (default: text-embedding-3-small).
 *
 * NOTE: dimension MUST match the Course.embedding column (`vector(1536)`).
 * text-embedding-3-small is 1536; text-embedding-3-large is 3072.
 * Switching to -large requires a migration to widen the column AND a
 * full backfill — don't change the env var casually.
 */

const EMBEDDING_DIM = 1536;

let _client: OpenAI | null = null;
let _resolvedKey: string | null | undefined; // undefined = not yet resolved

function getEmbeddingsKey(): string | null {
  if (_resolvedKey !== undefined) return _resolvedKey;
  _resolvedKey =
    env.OPENAI_EMBEDDING_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim() ||
    null;
  return _resolvedKey;
}

function getEmbeddingsClient(): OpenAI | null {
  const key = getEmbeddingsKey();
  if (!key) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

/**
 * Which model the embeddings path is configured to call. Exposed
 * mostly for diagnostics + the backfill script's log line so it's
 * obvious when prod is running on a non-default model.
 */
export const EMBEDDING_MODEL = env.OPENAI_EMBEDDING_MODEL;

/**
 * Embed a single string. Returns null when no embeddings key is
 * configured so callers can fall back gracefully (semanticSearch
 * routes to ILIKE; refreshCourseEmbedding silently no-ops).
 *
 * Input is truncated to ~8K chars (~2K tokens) — well under the
 * 8192-token API ceiling but plenty for a course description.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getEmbeddingsClient();
  if (!client) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;

  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dim mismatch: model=${EMBEDDING_MODEL} produced ${vec?.length ?? 0} dims, ` +
        `Course.embedding column expects ${EMBEDDING_DIM}. ` +
        `Likely you set OPENAI_EMBEDDING_MODEL to a model with a different output size. ` +
        `Either revert to text-embedding-3-small or migrate the column + re-backfill.`
    );
  }
  return vec;
}

/**
 * Format a number[] as a pgvector literal string for $queryRaw.
 *
 * pgvector accepts `'[0.1, 0.2, …]'::vector` as text input. Prisma's
 * $queryRaw passes parameters as plain values; we serialize the array
 * client-side and let Postgres parse + cast.
 *
 * Caller is responsible for adding `::vector` in the SQL.
 */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Canonical "embed me" text composition for a Course. Used at write
 * time (course create/update hooks) AND at backfill time so the same
 * course produces the same embedding regardless of code path.
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
 * True when an embeddings key is configured (dedicated or shared).
 * Gates the semantic-search code path — callers fall back to ILIKE
 * / no-op when this returns false.
 */
export function isEmbeddingsEnabled(): boolean {
  return getEmbeddingsKey() !== null;
}
