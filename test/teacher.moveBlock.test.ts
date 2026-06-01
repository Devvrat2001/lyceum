/**
 * Smoke: `teacher.moveBlock` — move a block to another lesson in the same
 * course (Tier 4.2 / 6.6). The builder's "Move to lesson" control rides on
 * this; a regression would silently drop blocks or reparent them under the
 * wrong owner's lesson.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

/** Course → Unit → N lessons, owned by `teacherId`. Cascade-deletes with
 *  the course when cleanupTestUsers runs. */
async function freshCourse(teacherId: string, lessonCount = 2) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "Test Course",
      description: "Vitest fixture course.",
      subject: "Math",
      grade: "6",
      authorId: teacherId,
      authorLabel: "Test Teacher",
      priceCents: 0,
      status: "DRAFT",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, title: "Unit 1", order: 1 },
  });
  const lessons = [];
  for (let i = 0; i < lessonCount; i++) {
    lessons.push(
      await db.lesson.create({
        data: {
          unitId: unit.id,
          slug: `test-lesson-${crypto.randomUUID()}`,
          title: `Lesson ${i + 1}`,
          order: i + 1,
        },
      })
    );
  }
  return { course, unit, lessons };
}

function mkBlock(lessonId: string, order: number) {
  return db.block.create({
    data: { lessonId, order, type: "READING", settings: {} },
  });
}

describe("teacher.moveBlock", () => {
  it("moves a block to another lesson and appends at order max+1", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const { lessons } = await freshCourse(t.id);
    const [a, b] = lessons;
    const blk = await mkBlock(a.id, 1);
    await mkBlock(b.id, 5); // target already has a block at sparse order 5

    const res = await t.caller.teacher.moveBlock({
      blockId: blk.id,
      toLessonId: b.id,
    });
    expect(res.moved).toBe(true);
    expect(res.toLessonId).toBe(b.id);
    expect(res.order).toBe(6);

    const moved = await db.block.findUnique({
      where: { id: blk.id },
      select: { lessonId: true, order: true },
    });
    expect(moved?.lessonId).toBe(b.id);
    expect(moved?.order).toBe(6);

    // Source lesson no longer holds it.
    const aBlocks = await db.block.findMany({ where: { lessonId: a.id } });
    expect(aBlocks).toHaveLength(0);
  });

  it("treats a same-lesson move as a no-op", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const { lessons } = await freshCourse(t.id);
    const blk = await mkBlock(lessons[0].id, 1);

    const res = await t.caller.teacher.moveBlock({
      blockId: blk.id,
      toLessonId: lessons[0].id,
    });
    expect(res.moved).toBe(false);

    const after = await db.block.findUnique({
      where: { id: blk.id },
      select: { lessonId: true, order: true },
    });
    expect(after?.lessonId).toBe(lessons[0].id);
    expect(after?.order).toBe(1);
  });

  it("rejects moving another teacher's block (FORBIDDEN)", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const { lessons } = await freshCourse(owner.id);
    const blk = await mkBlock(lessons[0].id, 1);

    await expect(
      intruder.caller.teacher.moveBlock({
        blockId: blk.id,
        toLessonId: lessons[1].id,
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("rejects moving to a lesson in a different course", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const c1 = await freshCourse(t.id);
    const c2 = await freshCourse(t.id);
    const blk = await mkBlock(c1.lessons[0].id, 1);

    await expect(
      t.caller.teacher.moveBlock({
        blockId: blk.id,
        toLessonId: c2.lessons[0].id,
      })
    ).rejects.toThrow(/same course/i);
  });

  it("rejects when the target lesson doesn't exist (NOT_FOUND)", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const { lessons } = await freshCourse(t.id);
    const blk = await mkBlock(lessons[0].id, 1);

    await expect(
      t.caller.teacher.moveBlock({
        blockId: blk.id,
        toLessonId: `does-not-exist-${crypto.randomUUID()}`,
      })
    ).rejects.toThrow(/not found/i);
  });

  it("lets an ADMIN move any teacher's block", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const admin = await createTestUser({ role: "ADMIN" });
    const { lessons } = await freshCourse(owner.id);
    const blk = await mkBlock(lessons[0].id, 1);

    const res = await admin.caller.teacher.moveBlock({
      blockId: blk.id,
      toLessonId: lessons[1].id,
    });
    expect(res.moved).toBe(true);

    const moved = await db.block.findUnique({
      where: { id: blk.id },
      select: { lessonId: true },
    });
    expect(moved?.lessonId).toBe(lessons[1].id);
  });
});
