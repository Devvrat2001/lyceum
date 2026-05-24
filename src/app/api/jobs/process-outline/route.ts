import { NextResponse } from "next/server";
import { getQStashReceiver } from "@/lib/qstash";
import { processOutlineChunk } from "@/lib/jobs/processOutlineJob";

// 60s is the Hobby Vercel ceiling. Each chunk is designed to fit
// comfortably under that — skeleton ~15s, per-unit readings ~20-25s.
export const maxDuration = 60;
// Don't cache — every request runs the work.
export const dynamic = "force-dynamic";

/**
 * QStash webhook target. QStash POSTs `{ jobId }` here; we run one
 * chunk of the job and re-enqueue ourselves if there's more to do.
 *
 * Signature verification is mandatory whenever QStash signing keys
 * are configured — anyone with the public URL could otherwise burn
 * AI tokens by spamming this endpoint with arbitrary jobIds.
 *
 * Return shape is just `{ ok: true, done }` so QStash logs are
 * readable. QStash retries on non-2xx (up to 2 more times per our
 * `enqueueOutlineChunk` config).
 */
export async function POST(req: Request) {
  const bodyText = await req.text();
  const signature = req.headers.get("upstash-signature");

  // Verify signature when configured. If signing keys aren't set,
  // refuse to process — running unverified jobs in production would
  // be a free AI-token-burning endpoint for anyone with the URL.
  const receiver = getQStashReceiver();
  if (!receiver) {
    return NextResponse.json(
      { ok: false, error: "QStash signing keys not configured" },
      { status: 500 }
    );
  }
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "Missing upstash-signature header" },
      { status: 401 }
    );
  }
  try {
    await receiver.verify({ body: bodyText, signature });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/jobs/process-outline] signature verify failed", msg);
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body is not valid JSON" },
      { status: 400 }
    );
  }
  const jobId =
    typeof body === "object" && body !== null && "jobId" in body
      ? String((body as { jobId: unknown }).jobId)
      : "";
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Missing jobId in body" },
      { status: 400 }
    );
  }

  // processOutlineChunk re-enqueues itself for the next chunk if
  // there's more work — we just run one chunk here, log result, and
  // hand back to QStash.
  const result = await processOutlineChunk(jobId);
  return NextResponse.json({ ok: true, done: result.done });
}
