/**
 * Smoke: `lesson.videoPlaybackToken` — the access gate behind signed Mux
 * playback for paid-course videos. The actual token mint needs Mux signing
 * keys (absent in test), but the security-critical part — WHO is allowed to
 * get a token — runs entirely before any Mux call, so it's fully testable:
 * an authorized viewer falls through to a PRECONDITION_FAILED (no keys),
 * while an unauthorized one is FORBIDDEN first.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { muxStateFromEvent } from "@/lib/video/mux";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

const SIGNED_READY = {
  playbackId: "pb_1",
  status: "ready",
  policy: "signed",
};

async function videoBlockInCourse(opts: {
  ownerId: string;
  priceCents: number;
  mux: Record<string, unknown>;
  type?: "VIDEO" | "READING";
}) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "C",
      description: "d",
      subject: "Math",
      grade: "6",
      authorId: opts.ownerId,
      authorLabel: "T",
      priceCents: opts.priceCents,
      status: "PUBLISHED",
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
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      order: 1,
      type: opts.type ?? "VIDEO",
      settings: { source: "mux", mux: opts.mux } as Prisma.InputJsonValue,
    },
  });
  return { course, block };
}

describe("lesson.videoPlaybackToken", () => {
  it("returns a null token for a public video (no token needed)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await videoBlockInCourse({
      ownerId: teacher.id,
      priceCents: 0,
      mux: { playbackId: "pb_1", status: "ready", policy: "public" },
    });
    const res = await student.caller.lesson.videoPlaybackToken({
      blockId: block.id,
    });
    expect(res.token).toBeNull();
  });

  it("returns a null token while a signed video is still preparing", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await videoBlockInCourse({
      ownerId: teacher.id,
      priceCents: 1999,
      mux: { uploadId: "up_1", status: "preparing", policy: "signed" },
    });
    const res = await student.caller.lesson.videoPlaybackToken({
      blockId: block.id,
    });
    expect(res.token).toBeNull();
  });

  it("throws NOT_FOUND for a non-VIDEO block", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await videoBlockInCourse({
      ownerId: teacher.id,
      priceCents: 0,
      mux: {},
      type: "READING",
    });
    await expect(
      student.caller.lesson.videoPlaybackToken({ blockId: block.id })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("FORBIDs a signed paid-course video when the viewer isn't enrolled", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const outsider = await createTestUser({ role: "STUDENT" });
    const { block } = await videoBlockInCourse({
      ownerId: teacher.id,
      priceCents: 1999,
      mux: SIGNED_READY,
    });
    await expect(
      outsider.caller.lesson.videoPlaybackToken({ blockId: block.id })
    ).rejects.toThrow(/enroll/i);
  });

  it("lets the course owner past the access gate (no keys → PRECONDITION)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { block } = await videoBlockInCourse({
      ownerId: teacher.id,
      priceCents: 1999,
      mux: SIGNED_READY,
    });
    // Owner clears the access check; only the missing-signing-keys guard trips.
    await expect(
      teacher.caller.lesson.videoPlaybackToken({ blockId: block.id })
    ).rejects.toThrow(/configured/i);
  });

  it("lets an enrolled student past the access gate", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { course, block } = await videoBlockInCourse({
      ownerId: teacher.id,
      priceCents: 1999,
      mux: SIGNED_READY,
    });
    await db.enrollment.create({
      data: { userId: student.id, courseId: course.id },
    });
    await expect(
      student.caller.lesson.videoPlaybackToken({ blockId: block.id })
    ).rejects.toThrow(/configured/i);
  });
});

describe("muxStateFromEvent — policy preservation", () => {
  it("carries the signed policy through video.asset.ready", () => {
    const s = muxStateFromEvent(
      { uploadId: "up_1", status: "preparing", policy: "signed" },
      "video.asset.ready",
      { id: "asset_1", playback_ids: [{ id: "pb_1" }] }
    );
    expect(s?.status).toBe("ready");
    expect(s?.policy).toBe("signed");
  });
});
