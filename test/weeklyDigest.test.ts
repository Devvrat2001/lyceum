/**
 * `buildWeeklyDigests` — audience selection + per-student weekly aggregation
 * behind the Resend-gated weekly digest cron (`/api/cron/weekly-digest`).
 *
 * Isolation: every test pins `now` to mid-2002 and stamps all activity rows
 * near it, so the trailing-7-day window can only ever catch this test's own
 * rows — seeded/demo data lives in 2026, far outside the window. We assert on
 * specific userIds (never total length), since the dev DB is shared.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendWeeklyDigest } from "@/lib/email";
import { buildWeeklyDigests } from "@/server/services/weeklyDigest";
import { cleanupTestUsers, createTestUser } from "./helpers";

const NOW = new Date("2002-06-10T12:00:00.000Z");
const IN_WINDOW = new Date("2002-06-08T12:00:00.000Z"); // 2 days before NOW
const OUT_OF_WINDOW = new Date("2002-05-01T12:00:00.000Z"); // > 7 days before

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

/** A PUBLISHED course + unit owned by `ownerId`, for hanging lessons off. */
async function makeCourse(ownerId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "C",
      description: "d",
      subject: "Math",
      grade: "6",
      authorId: ownerId,
      authorLabel: "T",
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, title: "U", order: 1 },
  });
  return { course, unit };
}

async function addLessonWithBlock(unitId: string, order: number) {
  const lesson = await db.lesson.create({
    data: {
      unitId,
      slug: `test-lesson-${crypto.randomUUID()}`,
      title: "L",
      order,
    },
  });
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      order: 1,
      type: "READING",
      settings: {} as Prisma.InputJsonValue,
    },
  });
  return { lesson, block };
}

describe("buildWeeklyDigests", () => {
  it("includes an active opted-in student with correct weekly aggregates", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { unit } = await makeCourse(teacher.id);
    const a = await addLessonWithBlock(unit.id, 1);
    const b = await addLessonWithBlock(unit.id, 2);

    // 2 lessons completed in-window
    await db.lessonProgress.createMany({
      data: [
        { userId: student.id, lessonId: a.lesson.id, completedAt: IN_WINDOW },
        { userId: student.id, lessonId: b.lesson.id, completedAt: IN_WINDOW },
      ],
    });
    // 3 attempts in-window, 2 correct
    await db.attempt.createMany({
      data: [
        { userId: student.id, lessonId: a.lesson.id, blockId: a.block.id, correct: true, timeMs: 1000, createdAt: IN_WINDOW },
        { userId: student.id, lessonId: a.lesson.id, blockId: a.block.id, correct: true, timeMs: 1000, createdAt: IN_WINDOW },
        { userId: student.id, lessonId: b.lesson.id, blockId: b.block.id, correct: false, timeMs: 1000, createdAt: IN_WINDOW },
      ],
    });
    // 50 XP in-window
    await db.xPEvent.create({
      data: { userId: student.id, points: 50, source: "test", createdAt: IN_WINDOW },
    });
    await db.streak.create({
      data: { userId: student.id, current: 5, longest: 5, lastDay: IN_WINDOW },
    });

    const digests = await buildWeeklyDigests(db, NOW);
    const mine = digests.find((d) => d.userId === student.id);
    expect(mine).toBeDefined();
    expect(mine).toMatchObject({
      lessonsCompleted: 2,
      questionsAnswered: 3,
      questionsCorrect: 2,
      xpEarned: 50,
      streak: 5,
      email: student.email,
    });
  });

  it("excludes a student who opted out of email", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    await db.user.update({
      where: { id: student.id },
      data: { emailOptOut: true },
    });
    const { unit } = await makeCourse(teacher.id);
    const a = await addLessonWithBlock(unit.id, 1);
    // Real activity in-window — opt-out must still suppress the digest.
    await db.lessonProgress.create({
      data: { userId: student.id, lessonId: a.lesson.id, completedAt: IN_WINDOW },
    });

    const digests = await buildWeeklyDigests(db, NOW);
    expect(digests.find((d) => d.userId === student.id)).toBeUndefined();
  });

  it("excludes a student with no activity this week", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const digests = await buildWeeklyDigests(db, NOW);
    expect(digests.find((d) => d.userId === student.id)).toBeUndefined();
  });

  it("ignores activity older than the 7-day window", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    // XP earned, but a month ago — outside the trailing window.
    await db.xPEvent.create({
      data: { userId: student.id, points: 99, source: "test", createdAt: OUT_OF_WINDOW },
    });
    const digests = await buildWeeklyDigests(db, NOW);
    expect(digests.find((d) => d.userId === student.id)).toBeUndefined();
  });

  it("does not send a learner digest to a teacher", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    // Even with XP in-window, a non-STUDENT is never a digest candidate.
    await db.xPEvent.create({
      data: { userId: teacher.id, points: 40, source: "test", createdAt: IN_WINDOW },
    });
    const digests = await buildWeeklyDigests(db, NOW);
    expect(digests.find((d) => d.userId === teacher.id)).toBeUndefined();
  });
});

describe("sendWeeklyDigest — dormant without a key", () => {
  it("is a no-op (returns false) when RESEND_API_KEY is unset", async () => {
    const delivered = await sendWeeklyDigest({
      to: "nobody@example.test",
      firstName: "Test",
      lessonsCompleted: 1,
      questionsAnswered: 0,
      questionsCorrect: 0,
      xpEarned: 10,
      streak: 1,
      dashboardUrl: "http://localhost:3000/student",
    });
    expect(delivered).toBe(false);
  });
});
