import "server-only";
import Mux from "@mux/mux-node";
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
};

/**
 * Create a Mux direct upload. `passthrough` carries our blockId so a
 * future webhook can correlate the finished asset back to the block.
 * Returns the one-time URL the browser PUTs the file to.
 */
export async function createDirectUpload(
  blockId: string,
  corsOrigin: string
): Promise<{ uploadId: string; uploadUrl: string }> {
  const upload = await getMux().video.uploads.create({
    cors_origin: corsOrigin || "*",
    new_asset_settings: {
      playback_policies: ["public"],
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
  };
}
