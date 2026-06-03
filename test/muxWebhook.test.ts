/**
 * Smoke: the Mux completion webhook helpers behind /api/mux/webhook
 * (Phase 6.1 follow-on). `muxStateFromEvent` maps an asset event onto the
 * persisted MuxState; `applyMuxEventToBlock` merges it into the VIDEO block
 * named by `passthrough`. The route is a thin verify + dispatch over these,
 * so testing them covers the behaviour without forging a Mux signature.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyMuxEventToBlock, muxStateFromEvent } from "@/lib/video/mux";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function videoBlock(
  mux: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  const teacher = await createTestUser({ role: "TEACHER" });
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "C",
      description: "d",
      subject: "Math",
      grade: "6",
      authorId: teacher.id,
      authorLabel: "T",
      priceCents: 0,
      status: "DRAFT",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, title: "U", order: 1 },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      slug: `test-lesson-${crypto.randomUUID()}`,
      title: "L",
      order: 1,
    },
  });
  return db.block.create({
    data: {
      lessonId: lesson.id,
      order: 1,
      type: "VIDEO",
      settings: { source: "mux", mux, ...extra } as Prisma.InputJsonValue,
    },
  });
}

describe("muxStateFromEvent", () => {
  it("maps video.asset.ready → ready with playbackId / assetId / aspectRatio", () => {
    const s = muxStateFromEvent(
      { uploadId: "up_1", status: "preparing" },
      "video.asset.ready",
      { id: "asset_1", playback_ids: [{ id: "pb_1" }], aspect_ratio: "16:9" }
    );
    expect(s).toEqual({
      uploadId: "up_1",
      assetId: "asset_1",
      playbackId: "pb_1",
      status: "ready",
      aspectRatio: "16:9",
    });
  });

  it("falls back to the prior playbackId when the event has none", () => {
    const s = muxStateFromEvent(
      { uploadId: "up_1", playbackId: "pb_old", status: "preparing" },
      "video.asset.ready",
      { id: "asset_1" }
    );
    expect(s?.status).toBe("ready");
    expect(s?.playbackId).toBe("pb_old");
  });

  it("maps video.asset.errored → errored", () => {
    const s = muxStateFromEvent(
      { uploadId: "up_1", status: "preparing" },
      "video.asset.errored",
      { id: "asset_1" }
    );
    expect(s?.status).toBe("errored");
  });

  it("returns null for events it doesn't persist", () => {
    expect(
      muxStateFromEvent({ status: "preparing" }, "video.upload.created", {})
    ).toBeNull();
  });
});

describe("applyMuxEventToBlock", () => {
  it("stamps a ready asset onto the block, preserving other settings", async () => {
    const block = await videoBlock(
      { uploadId: "up_1", status: "preparing" },
      { label: "Intro video" }
    );

    const status = await applyMuxEventToBlock(
      db,
      block.id,
      "video.asset.ready",
      {
        id: "asset_1",
        passthrough: block.id,
        playback_ids: [{ id: "pb_1" }],
        aspect_ratio: "16:9",
      }
    );
    expect(status).toBe("ready");

    const row = await db.block.findUnique({
      where: { id: block.id },
      select: { settings: true },
    });
    const s = (row?.settings ?? {}) as {
      source?: string;
      label?: string;
      mux?: Record<string, unknown>;
    };
    expect(s.source).toBe("mux");
    expect(s.label).toBe("Intro video"); // unrelated settings preserved
    expect(s.mux?.status).toBe("ready");
    expect(s.mux?.playbackId).toBe("pb_1");
    expect(s.mux?.assetId).toBe("asset_1");
    expect(s.mux?.uploadId).toBe("up_1");
  });

  it("is idempotent — a duplicate event on a terminal block is a no-op", async () => {
    const block = await videoBlock({
      uploadId: "up_1",
      assetId: "asset_1",
      playbackId: "pb_1",
      status: "ready",
    });

    const status = await applyMuxEventToBlock(
      db,
      block.id,
      "video.asset.ready",
      { id: "asset_2", passthrough: block.id, playback_ids: [{ id: "pb_2" }] }
    );
    expect(status).toBe("ready");

    const row = await db.block.findUnique({
      where: { id: block.id },
      select: { settings: true },
    });
    const s = (row?.settings ?? {}) as { mux?: Record<string, unknown> };
    expect(s.mux?.playbackId).toBe("pb_1"); // untouched
    expect(s.mux?.assetId).toBe("asset_1");
  });

  it("returns null for an unknown block", async () => {
    const status = await applyMuxEventToBlock(
      db,
      `nope-${crypto.randomUUID()}`,
      "video.asset.ready",
      { id: "x" }
    );
    expect(status).toBeNull();
  });
});
