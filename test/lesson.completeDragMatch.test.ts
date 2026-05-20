/**
 * Smoke: `lesson.completeDragMatch`. Covers the three-tier XP scoring
 * (100% → full, ≥70% → half, <70% → 0) and the chosenKey encoding
 * (`"drag:N/M"`). Fixture-builds a DRAG_MATCH block via the Tier 4.4
 * `drag-5pair` template so we don't depend on seeded data.
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

async function freshDragMatchBlock(teacherId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "DragMatch Fixture",
      description: "Vitest fixture.",
      subject: "Math",
      grade: "6",
      authorId: teacherId,
      authorLabel: "Test",
      priceCents: 0,
      status: "DRAFT",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, title: "U1", order: 1 },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      slug: `test-lesson-${crypto.randomUUID()}`,
      title: "L1",
      order: 1,
    },
  });
  // Hand-roll a 5-pair DRAG_MATCH so the test owns the canonical
  // pairing rather than depending on the template's literal copy.
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      type: "DRAG_MATCH",
      order: 1,
      settings: {
        pairs: [
          { left: "L1", right: "R1" },
          { left: "L2", right: "R2" },
          { left: "L3", right: "R3" },
          { left: "L4", right: "R4" },
          { left: "L5", right: "R5" },
        ],
      },
    },
  });
  return { block };
}

/** All-correct placement: slot i gets right-item i. */
const PERFECT = [0, 1, 2, 3, 4];

describe("lesson.completeDragMatch", () => {
  it("100% correct → full XP + chosenKey 'drag:5/5'", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshDragMatchBlock(teacher.id);

    const result = await student.caller.lesson.completeDragMatch({
      blockId: block.id,
      placements: PERFECT,
      timeMs: 5000,
    });
    expect(result.correct).toBe(true);
    expect(result.correctCount).toBe(5);
    expect(result.totalPairs).toBe(5);
    expect(result.points).toBeGreaterThan(0);

    const attempt = await db.attempt.findFirst({
      where: { userId: student.id, blockId: block.id },
    });
    expect(attempt?.correct).toBe(true);
    expect(attempt?.chosenKey).toBe("drag:5/5");

    const xpEvent = await db.xPEvent.findFirst({
      where: { userId: student.id, source: "block_drag_match_complete" },
    });
    expect(xpEvent?.points).toBe(result.points);
  });

  it("≥70% (4/5) → half XP, still records correct=false", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshDragMatchBlock(teacher.id);

    // 4 right, 1 wrong (swap last two)
    const result = await student.caller.lesson.completeDragMatch({
      blockId: block.id,
      placements: [0, 1, 2, 4, 3],
    });
    expect(result.correct).toBe(false);
    expect(result.correctCount).toBe(3); // swapping 4↔3 breaks both
    // 3/5 = 60% < 70%, so points = 0
    expect(result.points).toBe(0);

    // But the Attempt row still exists for analytics.
    const attempt = await db.attempt.findFirst({
      where: { userId: student.id, blockId: block.id },
    });
    expect(attempt?.chosenKey).toBe("drag:3/5");
  });

  it("partial 4/5 awards half XP and records the score", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshDragMatchBlock(teacher.id);

    // Leave the last slot null (1 miss) → 4/5 = 80% ≥ 70%
    const result = await student.caller.lesson.completeDragMatch({
      blockId: block.id,
      placements: [0, 1, 2, 3, null],
    });
    expect(result.correctCount).toBe(4);
    expect(result.totalPairs).toBe(5);
    expect(result.correct).toBe(false);
    expect(result.points).toBeGreaterThan(0); // half-XP tier

    const xp = await db.xPEvent.findFirst({
      where: { userId: student.id, source: "block_drag_match_complete" },
    });
    expect(xp?.points).toBe(result.points);
  });

  it("rejects placements with the wrong length", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshDragMatchBlock(teacher.id);

    await expect(
      student.caller.lesson.completeDragMatch({
        blockId: block.id,
        placements: [0, 1, 2], // only 3 — should be 5
      })
    ).rejects.toThrow(/Placements length/);
  });

  it("rejects when the targeted block isn't a DRAG_MATCH", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await db.course.create({
      data: {
        slug: `test-vitest-course-${crypto.randomUUID()}`,
        title: "Wrong-type fixture",
        description: ".",
        subject: "Math",
        grade: "6",
        authorId: teacher.id,
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
    const mcq = await db.block.create({
      data: {
        lessonId: lesson.id,
        type: "MCQ",
        order: 1,
        settings: {
          stem: "?",
          options: [{ text: "a", correct: true }, { text: "b", correct: false }],
        },
      },
    });
    await expect(
      student.caller.lesson.completeDragMatch({
        blockId: mcq.id,
        placements: [0, 1],
      })
    ).rejects.toThrow(/not a DRAG_MATCH/);
  });
});
