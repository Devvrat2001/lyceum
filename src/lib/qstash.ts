import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { env } from "@/lib/env";

/**
 * Upstash QStash wrapper. QStash is a serverless message queue we use
 * to break the AI course-outline generation into chunks that each fit
 * inside Vercel's per-function timeout. The flow:
 *
 *   1. `generator.startOutlineJob` creates a GenerationJob row and
 *      publishes the first message to QStash (chunk 0).
 *   2. QStash POSTs to `/api/jobs/process-outline` with the jobId.
 *   3. The webhook runs one chunk (~15-45s), updates the job state,
 *      and re-publishes for the next chunk if more work remains.
 *   4. Client polls `generator.getJob` every 2s and renders progress.
 *
 * When QSTASH_TOKEN isn't set (local dev, demo deployments) the
 * generator router falls back to running the work inline — the same
 * pattern, just without queueing — so the feature stays usable.
 */

let _client: Client | null = null;
let _receiver: Receiver | null = null;

export function getQStash(): Client | null {
  if (!env.QSTASH_TOKEN) return null;
  if (!_client) _client = new Client({ token: env.QSTASH_TOKEN });
  return _client;
}

/**
 * Verifies incoming QStash POSTs are actually from QStash (HMAC over
 * the request body using the current + next signing keys, with rotation
 * support). Returns null if signing keys aren't configured so callers
 * can fall back to dev-mode no-verify behavior.
 */
export function getQStashReceiver(): Receiver | null {
  if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) {
    return null;
  }
  if (!_receiver) {
    _receiver = new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
  }
  return _receiver;
}

/**
 * True when we have everything needed to publish + verify async jobs.
 * Used by the generator router to decide between async (QStash) and
 * inline execution paths.
 */
export function isQStashEnabled(): boolean {
  return !!(
    env.QSTASH_TOKEN &&
    env.QSTASH_CURRENT_SIGNING_KEY &&
    env.QSTASH_NEXT_SIGNING_KEY
  );
}

/**
 * Publish a job-processing message to QStash with the given jobId.
 * QStash will POST it to {PUBLIC_BASE_URL}/api/jobs/process-outline.
 *
 * Throws if QStash isn't configured — callers should gate on
 * `isQStashEnabled()` and run inline otherwise.
 */
export async function enqueueOutlineChunk(jobId: string): Promise<void> {
  const client = getQStash();
  if (!client) {
    throw new Error("QStash not configured — set QSTASH_TOKEN");
  }
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/jobs/process-outline`;
  await client.publishJSON({
    url,
    body: { jobId },
    // Retry up to 2 more times on non-2xx (default 3 total). Anthropic
    // failures should fail loudly to the user, not retry silently.
    retries: 2,
  });
}
