/**
 * Free-response teacher review (REQUIREMENTS R33). Teacher lists the
 * AI-graded submissions across their courses and overrides scores;
 * authz keeps a teacher out of another teacher's submissions.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

vi.mock("@/lib/ai/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/llm")>()),
  isLlmEnabled: () => false,
}));

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeBlock(teacherId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-frr-${crypto.randomUUID()}`,
      title: "FRR Fixture",
      description: ".",
      subject: "ela",
      grade: "6",
      authorId: teacherId,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, order: 1, title: "U1" },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      order: 1,
      title: "Essay",
      slug: `test-vitest-frr-l-${crypto.randomUUID()}`,
    },
  });
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      order: 1,
      type: "FREE_RESPONSE",
      settings: { prompt: "Explain photosynthesis.", rubric: "light water co2" },
    },
  });
  return { course, lesson, block };
}

describe("teacher.freeResponseSubmissions + overrideFreeResponse", () => {
  it("lists own submissions, overrides the score, and computes finalScore", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await makeBlock(teacher.id);

    await student.caller.lesson.gradeFreeResponse({
      blockId: block.id,
      answer:
        "Plants use light, water and co2 to make food through photosynthesis.",
    });

    const before = await teacher.caller.teacher.freeResponseSubmissions({});
    const mine = before.filter((r) => r.lessonTitle === "Essay");
    expect(mine).toHaveLength(1);
    const sub = mine[0];
    expect(sub.answer).toContain("photosynthesis");
    expect(sub.finalScore).toBe(sub.aiScore);
    expect(sub.reviewed).toBe(false);

    await teacher.caller.teacher.overrideFreeResponse({
      attemptId: sub.id,
      score: 95,
    });
    const after = await teacher.caller.teacher.freeResponseSubmissions({});
    const updated = after.find((r) => r.id === sub.id)!;
    expect(updated.scoreOverride).toBe(95);
    expect(updated.finalScore).toBe(95);
    expect(updated.reviewed).toBe(true);

    // Clearing the override falls back to the AI score.
    await teacher.caller.teacher.overrideFreeResponse({
      attemptId: sub.id,
      score: null,
    });
    const cleared = (
      await teacher.caller.teacher.freeResponseSubmissions({})
    ).find((r) => r.id === sub.id)!;
    expect(cleared.scoreOverride).toBeNull();
    expect(cleared.finalScore).toBe(cleared.aiScore);
  });

  it("a teacher can't see or override another teacher's submissions", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await makeBlock(owner.id);
    await student.caller.lesson.gradeFreeResponse({
      blockId: block.id,
      answer: "A long enough answer about light water and co2 for the plant.",
    });

    const intruderList =
      await intruder.caller.teacher.freeResponseSubmissions({});
    // The owner's submission id isn't in the intruder's list.
    const ownerList = await owner.caller.teacher.freeResponseSubmissions({});
    const sub = ownerList.find((r) => r.lessonTitle === "Essay")!;
    expect(
      intruderList.find((r) => r.id === sub.id)
    ).toBeUndefined();

    await expect(
      intruder.caller.teacher.overrideFreeResponse({
        attemptId: sub.id,
        score: 10,
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
