/**
 * Smoke: `lesson.attemptBlock` for MCQ. Covers the engagement-loop
 * core — writes an Attempt row + an XPEvent + bumps the streak when
 * the answer is correct. Drag-match and branching go through their
 * own mutations and would warrant their own tests if they regressed.
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

type McqOption = { text: string; correct: boolean };

/**
 * Pick any MCQ block from the seeded data. The shape is read fresh
 * each test because tests are independent (no shared block id).
 */
async function findMcqBlock() {
  const block = await db.block.findFirst({
    where: { type: "MCQ" },
  });
  if (!block) {
    throw new Error("No MCQ block in DB — run `npm run db:seed`.");
  }
  const settings = (block.settings ?? {}) as { options?: unknown };
  const rawOptions = Array.isArray(settings.options) ? settings.options : [];
  const options = rawOptions.filter(
    (o): o is McqOption =>
      o !== null &&
      typeof o === "object" &&
      typeof (o as { text?: unknown }).text === "string" &&
      typeof (o as { correct?: unknown }).correct === "boolean"
  );
  if (options.length < 2) {
    throw new Error(
      `MCQ block ${block.id} has <2 valid options — reseed the fixtures.`
    );
  }
  const correctIndex = options.findIndex((o) => o.correct);
  const wrongIndex = options.findIndex((o) => !o.correct);
  if (correctIndex < 0 || wrongIndex < 0) {
    throw new Error(
      `MCQ block ${block.id} missing a correct or wrong option.`
    );
  }
  return { block, options, correctIndex, wrongIndex };
}

describe("lesson.attemptBlock (MCQ)", () => {
  it("correct answer writes Attempt + XPEvent + bumps streak", async () => {
    const { block, correctIndex } = await findMcqBlock();
    const student = await createTestUser({ role: "STUDENT" });

    const result = await student.caller.lesson.attemptBlock({
      blockId: block.id,
      chosenIndex: correctIndex,
      hintsUsed: 0,
      timeMs: 1234,
    });
    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThan(0);
    expect(result.correctIndex).toBe(correctIndex);
    expect(result.streak?.current).toBeGreaterThanOrEqual(1);

    const attempt = await db.attempt.findFirst({
      where: { userId: student.id, blockId: block.id },
    });
    expect(attempt?.correct).toBe(true);
    expect(attempt?.chosenKey).toBe(String(correctIndex));
    expect(attempt?.timeMs).toBe(1234);
    // MCQ keeps the legacy single-number chosenKey (no subIndex prefix).
    expect(attempt?.chosenKey).not.toContain(":");

    const xpEvent = await db.xPEvent.findFirst({
      where: { userId: student.id, source: "block_mcq_correct" },
    });
    expect(xpEvent?.points).toBe(result.points);
    expect(xpEvent?.refId).toBe(block.id);

    const streak = await db.streak.findUnique({
      where: { userId: student.id },
    });
    expect(streak?.current).toBeGreaterThanOrEqual(1);
  });

  it("wrong answer records Attempt but awards 0 XP and no streak bump", async () => {
    const { block, wrongIndex } = await findMcqBlock();
    const student = await createTestUser({ role: "STUDENT" });

    const result = await student.caller.lesson.attemptBlock({
      blockId: block.id,
      chosenIndex: wrongIndex,
    });
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
    // streak only bumps on correct (returns null when no award fired).
    expect(result.streak).toBeNull();

    const attempt = await db.attempt.findFirst({
      where: { userId: student.id, blockId: block.id },
    });
    expect(attempt?.correct).toBe(false);

    const xpCount = await db.xPEvent.count({
      where: { userId: student.id },
    });
    expect(xpCount).toBe(0);
  });

  it("hintsUsed reduces points awarded for a correct answer", async () => {
    const { block, correctIndex } = await findMcqBlock();
    const cleanStudent = await createTestUser({ role: "STUDENT" });
    const hintedStudent = await createTestUser({ role: "STUDENT" });

    const clean = await cleanStudent.caller.lesson.attemptBlock({
      blockId: block.id,
      chosenIndex: correctIndex,
      hintsUsed: 0,
    });
    const hinted = await hintedStudent.caller.lesson.attemptBlock({
      blockId: block.id,
      chosenIndex: correctIndex,
      hintsUsed: 3,
    });
    expect(hinted.points).toBeLessThan(clean.points);
    expect(hinted.points).toBeGreaterThan(0); // still awards something
  });

  it("rejects an out-of-range chosenIndex", async () => {
    const { block, options } = await findMcqBlock();
    const student = await createTestUser({ role: "STUDENT" });
    await expect(
      student.caller.lesson.attemptBlock({
        blockId: block.id,
        chosenIndex: options.length, // off-by-one past the last option
      })
    ).rejects.toThrow(/out of range/);
  });
});
