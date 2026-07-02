/**
 * R59 (partial) — the Attempt "exactly one of" CHECK constraint (migration
 * 20260702101056_attempt_question_xor_check) must reject violating rows
 * (both-null AND both-set) while allowing the valid one-set shape.
 *
 * The constraint isn't in schema.prisma (Prisma has no CHECK DSL), so if a
 * future `migrate` ever drops it this flips green→red. All non-constraint
 * columns get valid values/FKs so the ONLY possible failure is the CHECK.
 *
 * The sibling Order (courseId XOR pathId) constraint is DEFERRED — see
 * KNOWN_ISSUES "Order pathId drop" / REQUIREMENTS R59.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createTestUser, cleanupTestUsers } from "./helpers";

afterAll(async () => {
  await cleanupTestUsers();
  await db.$disconnect();
});

describe("R59 CHECK constraints — Attempt exactly-one-of invariant", () => {
  it("Attempt: rejects both-null and both-set, allows one-set", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await db.course.create({
      data: {
        slug: `test-vitest-${randomUUID()}`,
        title: "R59 course",
        description: "d",
        subject: "math",
        grade: "6",
        authorId: teacher.id,
      },
    });
    const unit = await db.unit.create({
      data: { courseId: course.id, order: 0, title: "U" },
    });
    const lesson = await db.lesson.create({
      data: { unitId: unit.id, order: 0, title: "L" },
    });
    const block = await db.block.create({
      data: { lessonId: lesson.id, order: 0, type: "MCQ", settings: {} },
    });
    const question = await db.question.create({
      data: { lessonId: lesson.id, order: 0, stem: "q", answers: [] },
    });

    const base = { userId: student.id, lessonId: lesson.id, correct: false, timeMs: 100 };

    await expect(
      db.attempt.create({ data: { ...base, questionId: null, blockId: null } })
    ).rejects.toThrow("attempt_question_xor_block");

    await expect(
      db.attempt.create({ data: { ...base, questionId: question.id, blockId: block.id } })
    ).rejects.toThrow("attempt_question_xor_block");

    const ok = await db.attempt.create({ data: { ...base, blockId: block.id } });
    expect(ok.id).toBeTruthy();
  });
});
