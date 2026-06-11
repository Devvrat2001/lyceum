/**
 * ensureEnrollment — the shared create-and-count service behind every
 * enrollment path (free enroll, add-to-library, paid confirm/webhook,
 * path enroll, teacher invite, lesson complete). Regressions here either
 * strand Course.enrollCount at its seeded value again ("0 students" on
 * real courses — the prod bug this fixed) or double-count repeat enrolls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  ensureEnrollment,
  removeEnrollment,
} from "@/server/services/enrollment";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeCourse(ownerId: string, priceCents = 0) {
  return db.course.create({
    data: {
      slug: `test-vitest-enrollcount-${crypto.randomUUID()}`,
      title: "Countable Course",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      authorLabel: "Test Teacher",
      priceCents,
      status: "PUBLISHED",
    },
  });
}

async function enrollCountOf(courseId: string) {
  const c = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { enrollCount: true },
  });
  return c.enrollCount;
}

describe("ensureEnrollment", () => {
  it("creates the row and increments enrollCount exactly once", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);

    const first = await ensureEnrollment(db, student.id, course.id, {
      lastActivityAt: new Date(),
    });
    expect(first.created).toBe(true);
    expect(await enrollCountOf(course.id)).toBe(1);

    // Repeat enroll: no new row, no double count.
    const again = await ensureEnrollment(db, student.id, course.id, {
      lastActivityAt: new Date(),
    });
    expect(again.created).toBe(false);
    expect(await enrollCountOf(course.id)).toBe(1);

    const rows = await db.enrollment.findMany({
      where: { courseId: course.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("counts distinct students", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const a = await createTestUser({ role: "STUDENT" });
    const b = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);

    await ensureEnrollment(db, a.id, course.id);
    await ensureEnrollment(db, b.id, course.id);
    expect(await enrollCountOf(course.id)).toBe(2);
  });

  it("applies extras to an existing row without touching the counter", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);

    await ensureEnrollment(db, student.id, course.id);
    await ensureEnrollment(db, student.id, course.id, {
      progressPct: 40,
      completed: false,
    });

    const row = await db.enrollment.findUniqueOrThrow({
      where: {
        userId_courseId: { userId: student.id, courseId: course.id },
      },
      select: { progressPct: true },
    });
    expect(row.progressPct).toBe(40);
    expect(await enrollCountOf(course.id)).toBe(1);
  });

  it("free course.enroll through the router increments the counter", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id, 0);

    await student.caller.course.enroll({ courseId: course.id });
    expect(await enrollCountOf(course.id)).toBe(1);

    // Idempotent through the public surface too.
    await student.caller.course.enroll({ courseId: course.id });
    expect(await enrollCountOf(course.id)).toBe(1);
  });

  it("marketplace.teachers reflects real signups (the '0 students' prod bug)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id, 0);

    await student.caller.course.enroll({ courseId: course.id });

    const teachers = await student.caller.marketplace.teachers({ limit: 24 });
    const mine = teachers.find((t) => t.id === teacher.id);
    expect(mine).toBeTruthy();
    expect(mine!.studentsCount).toBeGreaterThanOrEqual(1);
  });
});

describe("removeEnrollment", () => {
  it("deletes the row and decrements the counter; repeat removal is a no-op", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);

    await ensureEnrollment(db, student.id, course.id);
    expect(await enrollCountOf(course.id)).toBe(1);

    const first = await removeEnrollment(db, student.id, course.id);
    expect(first.removed).toBe(true);
    expect(await enrollCountOf(course.id)).toBe(0);

    const again = await removeEnrollment(db, student.id, course.id);
    expect(again.removed).toBe(false);
    expect(await enrollCountOf(course.id)).toBe(0);
  });

  it("never drives the counter below zero, even against drifted data", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);

    // Simulate historical drift: a row exists but the counter reads 0.
    await ensureEnrollment(db, student.id, course.id);
    await db.course.update({
      where: { id: course.id },
      data: { enrollCount: 0 },
    });

    const res = await removeEnrollment(db, student.id, course.id);
    expect(res.removed).toBe(true);
    expect(await enrollCountOf(course.id)).toBe(0);
  });
});
