import "server-only";
import Mux from "@mux/mux-node";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * Lazy Mux client for the teacher video-upload flow. Mirrors the lazy
 * Stripe wrapper: the SDK is only constructed when keys are present, and
 * `isMuxEnabled()` gates the upload UI + router procedures so the app
 * runs fine without Mux configured (the VIDEO block just falls back to
 * paste-a-URL).
 *
 * Only the *upload* side needs these secret keys. Playback is public —
 * the student player needs nothing but the playbackId — so videos keep
 * working even on a deploy that has no Mux keys (e.g. a preview env).
 */
let _client: Mux | null = null;

export function isMuxEnabled(): boolean {
  return Boolean(env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET);
}

function getMux(): Mux {
  if (!isMuxEnabled()) {
    throw new Error(
      "Mux is not configured — set MUX_TOKEN_ID and MUX_TOKEN_SECRET."
    );
  }
  if (!_client) {
    _client = new Mux({
      tokenId: env.MUX_TOKEN_ID,
      tokenSecret: env.MUX_TOKEN_SECRET,
    });
  }
  return _client;
}

export type MuxStatus = "waiting" | "preparing" | "ready" | "errored";

/** The Mux state we persist into a VIDEO block's `settings.mux`. */
export type MuxState = {
  uploadId?: string;
  assetId?: string;
  playbackId?: string;
  status?: MuxStatus;
  aspectRatio?: string;
  /** "signed" → playback needs a short-lived JWT (paid courses). Absent or
   *  "public" → the playbackId streams directly. */
  policy?: "public" | "signed";
};

/**
 * Create a Mux direct upload. `passthrough` carries our blockId so a
 * future webhook can correlate the finished asset back to the block.
 * Returns the one-time URL the browser PUTs the file to.
 */
export async function createDirectUpload(
  blockId: string,
  corsOrigin: string,
  signed: boolean = false
): Promise<{ uploadId: string; uploadUrl: string }> {
  const upload = await getMux().video.uploads.create({
    cors_origin: corsOrigin || "*",
    new_asset_settings: {
      // Signed playback (paid courses) locks streaming to a short-lived JWT;
      // public is the default and needs no token.
      playback_policies: [signed ? "signed" : "public"],
      passthrough: blockId,
    },
  });
  if (!upload.url) {
    throw new Error("Mux did not return an upload URL.");
  }
  return { uploadId: upload.id, uploadUrl: upload.url };
}

/**
 * Poll Mux for the current state of an in-flight upload/asset and fold
 * it into the previous state. Pure read — the caller persists the result.
 * Resolves the asset id from the upload first (it only exists once Mux
 * has accepted the file), then reads the asset's processing status +
 * public playbackId.
 */
export async function getMuxState(prev: MuxState): Promise<MuxState> {
  const mux = getMux();
  let assetId = prev.assetId;

  if (!assetId && prev.uploadId) {
    const upload = await mux.video.uploads.retrieve(prev.uploadId);
    if (
      upload.status === "errored" ||
      upload.status === "cancelled" ||
      upload.status === "timed_out"
    ) {
      return { ...prev, status: "errored" };
    }
    if (upload.asset_id) {
      assetId = upload.asset_id;
    } else {
      // File not fully accepted yet — still "waiting" on the asset.
      return { ...prev, status: prev.status ?? "waiting" };
    }
  }

  if (!assetId) return { ...prev };

  const asset = await mux.video.assets.retrieve(assetId);
  const status: MuxStatus =
    asset.status === "ready"
      ? "ready"
      : asset.status === "errored"
        ? "errored"
        : "preparing";

  return {
    uploadId: prev.uploadId,
    assetId,
    playbackId: asset.playback_ids?.[0]?.id ?? prev.playbackId,
    status,
    aspectRatio: asset.aspect_ratio ?? prev.aspectRatio,
    policy: prev.policy,
  };
}

// ── Webhook (instant completion) ─────────────────────────────────────────

/**
 * Whether the Mux webhook is configured. `/api/mux/webhook` refuses to
 * process anything unless this is true — we never act on an unverified body.
 * Requires the upload keys too (the webhook only fires for a project that has
 * them).
 */
export function isMuxWebhookEnabled(): boolean {
  return isMuxEnabled() && Boolean(env.MUX_WEBHOOK_SECRET);
}

/**
 * Verify a Mux webhook's signature against MUX_WEBHOOK_SECRET and return the
 * parsed event. Throws if the signature is missing/invalid (the SDK does the
 * timing-safe HMAC check). Pass the RAW request body — not a re-serialized
 * JSON object, or the signature won't match.
 */
export async function unwrapMuxWebhook(
  rawBody: string,
  headers: Headers
): Promise<{ type: string; data: Record<string, unknown> }> {
  const event = await getMux().webhooks.unwrap(
    rawBody,
    headers,
    env.MUX_WEBHOOK_SECRET
  );
  return event as unknown as { type: string; data: Record<string, unknown> };
}

/**
 * Map a Mux asset event onto the next persisted `MuxState`. Pure (no I/O) so
 * it's unit-testable. Returns null for events we don't persist (the polling
 * path covers the rest). The event's `data` is the Mux Asset object, which
 * carries our `passthrough` (the blockId).
 */
export function muxStateFromEvent(
  prev: MuxState,
  type: string,
  data: Record<string, unknown>
): MuxState | null {
  const id = typeof data.id === "string" ? data.id : undefined;
  if (type === "video.asset.ready") {
    const playbackIds = Array.isArray(data.playback_ids)
      ? (data.playback_ids as Array<{ id?: string }>)
      : [];
    const aspect =
      typeof data.aspect_ratio === "string" ? data.aspect_ratio : undefined;
    return {
      uploadId: prev.uploadId,
      assetId: id ?? prev.assetId,
      playbackId: playbackIds[0]?.id ?? prev.playbackId,
      status: "ready",
      aspectRatio: aspect ?? prev.aspectRatio,
      policy: prev.policy,
    };
  }
  if (type === "video.asset.errored") {
    return { ...prev, assetId: id ?? prev.assetId, status: "errored" };
  }
  return null;
}

/**
 * Apply a verified Mux event to the VIDEO block named by its `passthrough`.
 * Merges the new `MuxState` into the block's settings (the same shape the
 * builder polling writes). Idempotent: terminal states (ready/errored) are
 * sticky, so a retried/duplicate delivery is a no-op. Returns the resulting
 * status, or null when the block is unknown or the event isn't persisted.
 */
export async function applyMuxEventToBlock(
  db: PrismaClient,
  blockId: string,
  type: string,
  data: Record<string, unknown>
): Promise<MuxStatus | null> {
  const block = await db.block.findUnique({
    where: { id: blockId },
    select: { id: true, settings: true },
  });
  if (!block) return null;

  const prev = (block.settings ?? {}) as Record<string, unknown>;
  const prevMux = (prev.mux ?? {}) as MuxState;
  if (prevMux.status === "ready" || prevMux.status === "errored") {
    return prevMux.status; // terminal — ignore late/duplicate deliveries
  }

  const nextMux = muxStateFromEvent(prevMux, type, data);
  if (!nextMux) return null;

  const settings = { ...prev, source: "mux", mux: nextMux };
  await db.block.update({
    where: { id: block.id },
    data: { settings: settings as Prisma.InputJsonValue },
  });
  return nextMux.status ?? null;
}

// ── Signed playback (paid courses) ───────────────────────────────────────

/**
 * Whether signed playback is configured. Requires the Mux signing key pair
 * (Mux dashboard → Settings → Signing Keys) on top of the upload keys. When
 * false, new uploads stay public and no playback token is ever minted, so
 * the whole video feature keeps working without these keys.
 */
export function isMuxSignedPlaybackEnabled(): boolean {
  return isMuxEnabled() && Boolean(env.MUX_SIGNING_KEY && env.MUX_PRIVATE_KEY);
}

/**
 * Mint a short-lived signed-playback JWT for a `signed`-policy playbackId.
 * The Mux client reads the signing key pair from MUX_SIGNING_KEY /
 * MUX_PRIVATE_KEY; this token is what the player passes as `tokens.playback`.
 * Only call when `isMuxSignedPlaybackEnabled()` — it throws without the keys.
 */
export async function signMuxPlaybackToken(playbackId: string): Promise<string> {
  return getMux().jwt.signPlaybackId(playbackId, {
    type: "video",
    expiration: "6h",
  });
}
