import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  applyMuxEventToBlock,
  isMuxWebhookEnabled,
  unwrapMuxWebhook,
} from "@/lib/video/mux";

/**
 * Mux SDK signature verification uses Node's crypto — Edge would throw, the
 * same way the Prisma adapter does.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mux completion webhook. Mux POSTs asset-lifecycle events here; on
 * `video.asset.ready` we stamp the playbackId + ready status onto the VIDEO
 * block (correlated by `passthrough` = blockId) so the upload finishes
 * instantly — the builder's client-side polling is the fallback for when a
 * teacher closes the tab mid-transcode.
 *
 * Configure in the Mux dashboard (Settings → Webhooks) pointing at
 * `{PUBLIC_BASE_URL}/api/mux/webhook`, and set `MUX_WEBHOOK_SECRET`. Without
 * the secret the route refuses — we never act on an unverified body.
 */
export async function POST(req: Request) {
  if (!isMuxWebhookEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Mux webhook not configured" },
      { status: 503 }
    );
  }

  // Verify against the RAW body — the SDK HMACs the exact bytes Mux signed.
  const raw = await req.text();
  let event: { type: string; data: Record<string, unknown> };
  try {
    event = await unwrapMuxWebhook(raw, req.headers);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 400 }
    );
  }

  const data = (event.data ?? {}) as Record<string, unknown>;
  const blockId =
    typeof data.passthrough === "string" ? data.passthrough : null;
  if (!blockId) {
    // Events without our passthrough (or non-VIDEO assets) — ack + ignore.
    return NextResponse.json({ ok: true, ignored: "no passthrough" });
  }

  const status = await applyMuxEventToBlock(db, blockId, event.type, data);
  return NextResponse.json({ ok: true, type: event.type, status });
}
