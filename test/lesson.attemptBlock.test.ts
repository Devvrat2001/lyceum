/**
 * Smoke: `lesson.attemptBlock` for MCQ. Covers the engagement-loop
 * core — writes an Attempt row + an XPEvent + bumps the streak when
 * the answer is correct. Drag-match and branching go through their
 * own mutations and would warrant their own tests if they regressed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

type McqOption = { text: string; correct: boolean };

const OPTIONS: McqOption[] = [
  { text: "3", correct: false },
  { text: "4", correct: true },
  { text: "22", correct: false },
];

// Self-created MCQ fixture. The demo seed predates the block system and
// creates zero Block rows — the old `findFirst({ type: "MCQ" })` lookup
// only worked locally because dev DBs have accumulated builder/AI
// content (CI's fresh seeded DB caught this). Owned by a test-vitest
// teacher so cleanupTestUsers() cascades the whole tree away.
let mcqBlockId: string;

beforeAll(async () => {
  await cleanupTestUsers();
  const teacher = await createTestUser({ role: "TEACHER" });
  const course = await db.course.create({
    data: {
      slug: `test-vitest-attempt-${crypto.randomUUID()}`,
      title: "Attempt Fixture Course",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: teacher.id,
      authorLabel: "Test Teacher",
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
      title: "L1",
      slug: `test-vitest-attempt-${crypto.randomUUID()}`,
    },
  });
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      order: 1,
      type: "MCQ",
      settings: { stem: "2 + 2 = ?", options: OPTIONS },
    },
  });
  mcqBlockId = block.id;
});
afterAll(async () => {
  await cleanupTestUsers();
});

/** The fixture block + derived answer indices (fresh read per test). */
async function findMcqBlock() {
  const block = await db.block.findUniqueOrThrow({
    where: { id: mcqBlockId },
  });
  const options = OPTIONS;
  const correctIndex = options.findIndex((o) => o.correct);
  const wrongIndex = options.findIndex((o) => !o.correct);
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
