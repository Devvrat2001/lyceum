/**
 * "Today's plan" (REQUIREMENTS R13): the deterministic dashboard plan —
 * continue-next-lesson, due assignments, done-today rows. Built inside
 * student.dashboard from real progress; no AI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ensureEnrollment } from "@/server/services/enrollment";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeCourseWithLessons(ownerId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-plan-${crypto.randomUUID()}`,
      title: "Plan Fixture Course",
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
  const l1 = await db.lesson.create({
    data: {
      unitId: unit.id,
      order: 1,
      title: "Plan Lesson One",
      slug: `test-vitest-plan-l1-${crypto.randomUUID()}`,
      durationMin: 7,
    },
  });
  const l2 = await db.lesson.create({
    data: {
      unitId: unit.id,
      order: 2,
      title: "Plan Lesson Two",
      slug: `test-vitest-plan-l2-${crypto.randomUUID()}`,
    },
  });
  return { course, l1, l2 };
}

describe("student.dashboard todaysPlan", () => {
  it("starts at the first lesson, then advances + crosses off after completion", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { course, l1, l2 } = await makeCourseWithLessons(teacher.id);
    await ensureEnrollment(db, student.id, course.id, {
      lastActivityAt: new Date(),
    });

    const dash1 = await student.caller.student.dashboard();
    const continue1 = dash1?.todaysPlan.find((p) => p.tag === "CONTINUE");
    expect(continue1?.title).toBe("Plan Lesson One");
    expect(continue1?.state).toBe("now");
    expect(continue1?.href).toContain("/student/lesson/");

    await student.caller.lesson.markComplete({ lessonId: l1.id });

    const dash2 = await student.caller.student.dashboard();
    const doneRow = dash2?.todaysPlan.find((p) => p.tag === "DONE");
    expect(doneRow?.title).toBe("Plan Lesson One");
    expect(doneRow?.state).toBe("done");
    const continue2 = dash2?.todaysPlan.find((p) => p.tag === "CONTINUE");
    expect(continue2?.title).toBe("Plan Lesson Two");
    expect(continue2?.state).toBe("now");
    void l2;
  });

  it("due assignments outrank the continue item", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { course, l2 } = await makeCourseWithLessons(teacher.id);
    await ensureEnrollment(db, student.id, course.id, {
      lastActivityAt: new Date(),
    });
    await teacher.caller.assignment.create({
      lessonId: l2.id,
      title: "Plan Assignment",
      dueAt: new Date(Date.now() + 24 * 3600 * 1000),
      xp: 15,
    });

    const dash = await student.caller.student.dashboard();
    const tags = dash?.todaysPlan.map((p) => p.tag) ?? [];
    expect(tags.indexOf("ASSIGNMENT")).toBeGreaterThanOrEqual(0);
    expect(tags.indexOf("ASSIGNMENT")).toBeLessThan(tags.indexOf("CONTINUE"));
    const assignmentRow = dash?.todaysPlan.find(
      (p) => p.tag === "ASSIGNMENT"
    );
    expect(assignmentRow?.state).toBe("now");
  });
});
