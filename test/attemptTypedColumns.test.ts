/**
 * Attempt.chosenIndex / subIndex (REQUIREMENTS R16, KNOWN_ISSUES S2-3):
 * the typed mirrors of chosenKey's overloaded string encodings. Every
 * choice-shaped attempt write must populate them so analytics never
 * string-parses chosenKey again. (The migration backfills history; this
 * covers the write side.)
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

async function makeLesson(ownerId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-typedcols-${crypto.randomUUID()}`,
      title: "Typed Columns Fixture",
      description: ".",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, order: 1, title: "U1" },
  });
  return db.lesson.create({
    data: {
      unitId: unit.id,
      order: 1,
      title: "L1",
      slug: `test-vitest-typedcols-l-${crypto.randomUUID()}`,
    },
  });
}

const MCQ_OPTIONS = [
  { text: "wrong", correct: false },
  { text: "right", correct: true },
  { text: "also wrong", correct: false },
];

describe("attempt typed columns", () => {
  it("MCQ block attempt writes chosenIndex (subIndex null)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const lesson = await makeLesson(teacher.id);
    const block = await db.block.create({
      data: {
        lessonId: lesson.id,
        order: 1,
        type: "MCQ",
        settings: { stem: "Pick right", options: MCQ_OPTIONS },
      },
    });

    await student.caller.lesson.attemptBlock({
      blockId: block.id,
      chosenIndex: 1,
    });
    const row = await db.attempt.findFirstOrThrow({
      where: { userId: student.id, blockId: block.id },
    });
    expect(row.chosenIndex).toBe(1);
    expect(row.subIndex).toBeNull();
    expect(row.chosenKey).toBe("1");
  });

  it("QUIZ deck attempt writes both subIndex and chosenIndex", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const lesson = await makeLesson(teacher.id);
    const block = await db.block.create({
      data: {
        lessonId: lesson.id,
        order: 1,
        type: "QUIZ",
        settings: {
          questions: [
            { stem: "Q1", answers: MCQ_OPTIONS },
            { stem: "Q2", answers: MCQ_OPTIONS },
          ],
        },
      },
    });

    await student.caller.lesson.attemptBlock({
      blockId: block.id,
      subIndex: 1,
      chosenIndex: 2,
    });
    const row = await db.attempt.findFirstOrThrow({
      where: { userId: student.id, blockId: block.id },
    });
    expect(row.subIndex).toBe(1);
    expect(row.chosenIndex).toBe(2);
    expect(row.chosenKey).toBe("1:2");
  });

  it("legacy Question attempt maps the lettered key to an index", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const lesson = await makeLesson(teacher.id);
    const question = await db.question.create({
      data: {
        lessonId: lesson.id,
        order: 1,
        stem: "Lettered",
        answers: [
          { key: "A", text: "no", correct: false },
          { key: "B", text: "yes", correct: true },
        ],
      },
    });

    await student.caller.lesson.attempt({
      questionId: question.id,
      chosenKey: "B",
    });
    const row = await db.attempt.findFirstOrThrow({
      where: { userId: student.id, questionId: question.id },
    });
    expect(row.chosenIndex).toBe(1);
    expect(row.chosenKey).toBe("B");
  });
});
