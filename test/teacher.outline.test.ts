/**
 * Smoke: manual course-outline authoring — `teacher.createCourse`,
 * `updateUnit`, `deleteUnit`, `deleteLesson`. These back the
 * default ("blank canvas") course-creation flow and the builder's
 * unit/lesson rename + delete controls. Regressions here would let a
 * teacher nuke another teacher's units, leak sparse `order` into the
 * outline rail, or fail to cascade-clean deleted lessons/blocks.
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

/** Course → N units, each with one lesson + one block. Cascade-deletes
 *  with the course when cleanupTestUsers runs. */
async function courseWithUnits(teacherId: string, unitCount = 3) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "Test Course",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: teacherId,
      authorLabel: "Test Teacher",
      priceCents: 0,
      status: "DRAFT",
    },
  });
  const units = [];
  for (let i = 0; i < unitCount; i++) {
    const unit = await db.unit.create({
      data: { courseId: course.id, title: `Unit ${i + 1}`, order: i + 1 },
    });
    const lesson = await db.lesson.create({
      data: {
        unitId: unit.id,
        slug: `test-lesson-${crypto.randomUUID()}`,
        title: `Lesson ${i + 1}`,
        order: 1,
      },
    });
    const block = await db.block.create({
      data: { lessonId: lesson.id, order: 1, type: "READING", settings: {} },
    });
    units.push({ ...unit, lesson, block });
  }
  return { course, units };
}

describe("teacher.createCourse", () => {
  it("creates an empty DRAFT course owned by the caller", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const title = `Vitest Algebra ${crypto.randomUUID()}`;
    const res = await t.caller.teacher.createCourse({
      title,
      subject: "Math · Algebra",
      grade: "Grade 6",
      tagline: "A friendly start",
      priceCents: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.slug).toMatch(/^vitest-algebra-/);

    const course = await db.course.findUnique({
      where: { id: res.courseId },
      include: { units: true },
    });
    expect(course?.authorId).toBe(t.id);
    expect(course?.status).toBe("DRAFT");
    expect(course?.subject).toBe("math"); // normalized to first token
    expect(course?.grade).toBe("6"); // digits only
    expect(course?.tagline).toBe("A friendly start");
    expect(course?.units).toHaveLength(0); // blank canvas
  });

  it("disambiguates a duplicate title with a -N slug suffix", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const title = `Vitest Dup ${crypto.randomUUID()}`;
    const a = await t.caller.teacher.createCourse({
      title,
      subject: "Science",
      grade: "7",
    });
    const b = await t.caller.teacher.createCourse({
      title,
      subject: "Science",
      grade: "7",
    });
    expect(b.slug).toBe(`${a.slug}-2`);
  });

  it("rejects a non-teacher (STUDENT)", async () => {
    const s = await createTestUser({ role: "STUDENT" });
    await expect(
      s.caller.teacher.createCourse({
        title: "Should Not Work",
        subject: "Math",
        grade: "6",
      })
    ).rejects.toThrow();
  });
});

describe("teacher.updateUnit", () => {
  it("renames a unit and sets its subtitle", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const { units } = await courseWithUnits(t.id, 1);
    const res = await t.caller.teacher.updateUnit({
      unitId: units[0].id,
      title: "Linear Equations",
      subtitle: "Solve for x",
    });
    expect(res.changed).toBe(true);

    const unit = await db.unit.findUnique({ where: { id: units[0].id } });
    expect(unit?.title).toBe("Linear Equations");
    expect(unit?.subtitle).toBe("Solve for x");
  });

  it("rejects an empty title", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const { units } = await courseWithUnits(t.id, 1);
    await expect(
      t.caller.teacher.updateUnit({ unitId: units[0].id, title: "   " })
    ).rejects.toThrow(/empty/i);
  });

  it("rejects renaming another teacher's unit (FORBIDDEN)", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const { units } = await courseWithUnits(owner.id, 1);
    await expect(
      intruder.caller.teacher.updateUnit({
        unitId: units[0].id,
        title: "Hijacked",
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("lets an ADMIN rename any teacher's unit", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const admin = await createTestUser({ role: "ADMIN" });
    const { units } = await courseWithUnits(owner.id, 1);
    const res = await admin.caller.teacher.updateUnit({
      unitId: units[0].id,
      title: "Admin Renamed",
    });
    expect(res.changed).toBe(true);
  });
});

describe("teacher.deleteUnit", () => {
  it("deletes a unit, cascades its lessons/blocks, and renumbers survivors", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const { course, units } = await courseWithUnits(t.id, 3);

    await t.caller.teacher.deleteUnit({ unitId: units[1].id });

    const remaining = await db.unit.findMany({
      where: { courseId: course.id },
      orderBy: { order: "asc" },
    });
    expect(remaining.map((u) => u.id)).toEqual([units[0].id, units[2].id]);
    expect(remaining.map((u) => u.order)).toEqual([1, 2]); // contiguous

    // Cascade: the deleted unit's lesson + block are gone.
    expect(
      await db.lesson.findUnique({ where: { id: units[1].lesson.id } })
    ).toBeNull();
    expect(
      await db.block.findUnique({ where: { id: units[1].block.id } })
    ).toBeNull();
  });

  it("rejects deleting another teacher's unit (FORBIDDEN)", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const { units } = await courseWithUnits(owner.id, 2);
    await expect(
      intruder.caller.teacher.deleteUnit({ unitId: units[0].id })
    ).rejects.toThrow(/FORBIDDEN/);
    // Still there.
    expect(
      await db.unit.findUnique({ where: { id: units[0].id } })
    ).not.toBeNull();
  });
});

describe("teacher.deleteLesson", () => {
  it("deletes a lesson, cascades its blocks, and renumbers survivors", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const course = await db.course.create({
      data: {
        slug: `test-vitest-course-${crypto.randomUUID()}`,
        title: "Test Course",
        description: "fixture",
        subject: "math",
        grade: "6",
        authorId: t.id,
        authorLabel: "Test Teacher",
        priceCents: 0,
        status: "DRAFT",
      },
    });
    const unit = await db.unit.create({
      data: { courseId: course.id, title: "Unit 1", order: 1 },
    });
    const lessons = [];
    for (let i = 0; i < 3; i++) {
      const lesson = await db.lesson.create({
        data: {
          unitId: unit.id,
          slug: `test-lesson-${crypto.randomUUID()}`,
          title: `Lesson ${i + 1}`,
          order: i + 1,
        },
      });
      const block = await db.block.create({
        data: { lessonId: lesson.id, order: 1, type: "READING", settings: {} },
      });
      lessons.push({ ...lesson, block });
    }

    await t.caller.teacher.deleteLesson({ lessonId: lessons[1].id });

    const rest = await db.lesson.findMany({
      where: { unitId: unit.id },
      orderBy: { order: "asc" },
    });
    expect(rest.map((l) => l.id)).toEqual([lessons[0].id, lessons[2].id]);
    expect(rest.map((l) => l.order)).toEqual([1, 2]); // contiguous

    // Cascade: the deleted lesson's block is gone.
    expect(
      await db.block.findUnique({ where: { id: lessons[1].block.id } })
    ).toBeNull();
  });

  it("rejects deleting another teacher's lesson (FORBIDDEN)", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const { units } = await courseWithUnits(owner.id, 1);
    await expect(
      intruder.caller.teacher.deleteLesson({ lessonId: units[0].lesson.id })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
