/**
 * Assignments (REQUIREMENTS R12): teacher posts "do this lesson by the
 * due date", enrolled students see it on the dashboard, completing the
 * target lesson flips it to done and awards the bonus XP exactly once.
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

async function makeCourseWithLesson(ownerId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-assign-${crypto.randomUUID()}`,
      title: "Assignable Course",
      description: ".",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, order: 1, title: "Unit 1" },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      order: 1,
      title: "Target Lesson",
      slug: `test-vitest-assign-l-${crypto.randomUUID()}`,
    },
  });
  return { course, lesson };
}

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000);

describe("assignment.create / delete", () => {
  it("teacher posts to their own lesson; a foreign teacher is rejected", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const other = await createTestUser({ role: "TEACHER" });
    const { lesson } = await makeCourseWithLesson(owner.id);

    const res = await owner.caller.assignment.create({
      lessonId: lesson.id,
      title: "Finish the target lesson",
      dueAt: tomorrow(),
      xp: 25,
    });
    expect(res.ok).toBe(true);
    expect(res.assignment.xp).toBe(25);

    await expect(
      other.caller.assignment.create({
        lessonId: lesson.id,
        title: "Not my course",
        dueAt: tomorrow(),
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("rejects a past due date", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const { lesson } = await makeCourseWithLesson(owner.id);
    await expect(
      owner.caller.assignment.create({
        lessonId: lesson.id,
        title: "Time traveler",
        dueAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      })
    ).rejects.toThrow(/past/i);
  });

  it("owner deletes; a foreign teacher cannot", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const other = await createTestUser({ role: "TEACHER" });
    const { lesson } = await makeCourseWithLesson(owner.id);
    const { assignment } = await owner.caller.assignment.create({
      lessonId: lesson.id,
      title: "Deletable",
      dueAt: tomorrow(),
    });

    await expect(
      other.caller.assignment.delete({ assignmentId: assignment.id })
    ).rejects.toThrow(/FORBIDDEN/);

    const res = await owner.caller.assignment.delete({
      assignmentId: assignment.id,
    });
    expect(res.ok).toBe(true);
    expect(
      await db.assignment.findUnique({ where: { id: assignment.id } })
    ).toBeNull();
  });
});

describe("assignment → student dashboard + XP", () => {
  it("enrolled student sees it; completing the lesson flips done + awards XP once", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { course, lesson } = await makeCourseWithLesson(teacher.id);
    await ensureEnrollment(db, student.id, course.id);

    const { assignment } = await teacher.caller.assignment.create({
      lessonId: lesson.id,
      title: "Dashboard-visible work",
      dueAt: tomorrow(),
      xp: 30,
    });

    const dash1 = await student.caller.student.dashboard();
    const item1 = dash1?.assignments.find(
      (a) => a.t === "Dashboard-visible work"
    );
    expect(item1).toBeTruthy();
    expect(item1!.done).toBe(false);
    expect(item1!.xp).toBe(30);

    // Complete the target lesson → bonus XP awarded exactly once.
    const first = await student.caller.lesson.markComplete({
      lessonId: lesson.id,
    });
    expect(first.assignmentXp).toBe(30);
    const again = await student.caller.lesson.markComplete({
      lessonId: lesson.id,
    });
    expect(again.assignmentXp).toBe(0);

    const events = await db.xPEvent.findMany({
      where: {
        userId: student.id,
        source: "assignment_complete",
        refId: assignment.id,
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].points).toBe(30);

    const dash2 = await student.caller.student.dashboard();
    const item2 = dash2?.assignments.find(
      (a) => a.t === "Dashboard-visible work"
    );
    expect(item2?.done).toBe(true);

    // Teacher's list shows the live completion count.
    const list = await teacher.caller.assignment.listMine();
    const mine = list.find((a) => a.id === assignment.id);
    expect(mine?.completed).toBe(1);
  });

  it("a non-enrolled student does NOT see the assignment", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const outsider = await createTestUser({ role: "STUDENT" });
    const { lesson } = await makeCourseWithLesson(teacher.id);
    await teacher.caller.assignment.create({
      lessonId: lesson.id,
      title: "Invisible to outsiders",
      dueAt: tomorrow(),
    });

    const dash = await outsider.caller.student.dashboard();
    expect(
      dash?.assignments.find((a) => a.t === "Invisible to outsiders")
    ).toBeUndefined();
  });
});
