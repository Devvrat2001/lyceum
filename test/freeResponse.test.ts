/**
 * FREE_RESPONSE grading (REQUIREMENTS R24). The LLM module is mocked to
 * demo mode so the mutation runs the deterministic keyword-heuristic
 * grader — tests stay hermetic (real DB, no AI spend) while exercising
 * the full mutation: validation, Attempt persistence (freeText /
 * aiFeedback / score columns), and XP on a passing grade.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { buildDemoGrade } from "@/lib/ai/prompts/freeResponseGrader";
import { cleanupTestUsers, createTestUser } from "./helpers";

// Force the demo-grader branch even though the dev env has a real key.
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

async function makeFreeResponseBlock(
  teacherId: string,
  settings: { [key: string]: string }
) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-fr-${crypto.randomUUID()}`,
      title: "FR Fixture Course",
      description: ".",
      subject: "science",
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
      title: "Moon Phases",
      slug: `test-vitest-fr-l1-${crypto.randomUUID()}`,
    },
  });
  const block = await db.block.create({
    data: { lessonId: lesson.id, order: 1, type: "FREE_RESPONSE", settings },
  });
  return { course, lesson, block };
}

describe("buildDemoGrade heuristic", () => {
  it("scores rubric coverage high and gibberish low, always 0-100", () => {
    const rubric = "moon orbits earth, sunlit half, angle changes monthly";
    const good = buildDemoGrade({
      rubric,
      answer:
        "The moon orbits the earth and we see more or less of the sunlit half as the angle changes through the month.",
    });
    const bad = buildDemoGrade({ rubric, answer: "zzz qqq www." });
    expect(good.score).toBeGreaterThan(bad.score);
    for (const g of [good, bad]) {
      expect(g.score).toBeGreaterThanOrEqual(0);
      expect(g.score).toBeLessThanOrEqual(100);
      expect(g.feedback.toLowerCase()).toContain("demo");
    }
  });
});

describe("lesson.gradeFreeResponse", () => {
  it("grades, persists the typed Attempt columns, and awards XP on a pass", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await makeFreeResponseBlock(teacher.id, {
      prompt: "Explain why the moon has phases.",
      rubric: "moon orbits earth, sunlit half, angle changes monthly",
    });

    const answer =
      "The moon orbits the earth once a month, and as the angle changes " +
      "we see different amounts of the sunlit half — that is what makes " +
      "the phases we observe from earth every month.";
    const res = await student.caller.lesson.gradeFreeResponse({
      blockId: block.id,
      answer,
    });

    expect(res.mode).toBe("demo");
    expect(res.score).toBeGreaterThanOrEqual(60);
    expect(res.correct).toBe(true);
    expect(res.points).toBeGreaterThan(0);

    const attempt = await db.attempt.findFirstOrThrow({
      where: { blockId: block.id, userId: student.id },
    });
    expect(attempt.freeText).toBe(answer);
    expect(attempt.score).toBe(res.score);
    expect(attempt.aiFeedback).toContain("Demo grading");
    expect(attempt.correct).toBe(true);
    expect(attempt.chosenKey).toBeNull();

    // The submit award is keyed to the attempt id (R39 reconciliation
    // relies on per-attempt refs), not the block id.
    const xp = await db.xPEvent.findFirst({
      where: {
        userId: student.id,
        source: "block_free_response_correct",
        refId: attempt.id,
      },
    });
    expect(xp?.points).toBe(res.points);
  });

  it("a failing grade records the attempt but awards no XP", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await makeFreeResponseBlock(teacher.id, {
      prompt: "Explain why the moon has phases.",
      rubric:
        "umbra penumbra libration apogee perigee synodic anomalistic draconic",
    });

    const res = await student.caller.lesson.gradeFreeResponse({
      blockId: block.id,
      answer: "I am not sure about this one but maybe the clouds move away.",
    });
    expect(res.correct).toBe(false);
    expect(res.points).toBe(0);

    const xp = await db.xPEvent.findFirst({
      where: { userId: student.id, source: "block_free_response_correct" },
    });
    expect(xp).toBeNull();
  });

  it("rejects non-FREE_RESPONSE blocks and unconfigured blocks", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { lesson, block } = await makeFreeResponseBlock(teacher.id, {
      rubric: "no prompt set",
    });
    const reading = await db.block.create({
      data: {
        lessonId: lesson.id,
        order: 2,
        type: "READING",
        settings: { body: "read me" },
      },
    });

    await expect(
      student.caller.lesson.gradeFreeResponse({
        blockId: reading.id,
        answer: "A long enough answer about something in the reading.",
      })
    ).rejects.toThrow(/not a free-response/i);

    await expect(
      student.caller.lesson.gradeFreeResponse({
        blockId: block.id,
        answer: "A long enough answer for an unconfigured prompt block.",
      })
    ).rejects.toThrow(/isn't configured/i);
  });
});
