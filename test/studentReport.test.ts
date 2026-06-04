/**
 * Student progress report — data gatherer + PDF renderer (the "parent report"
 * behind /api/student/report). Render assertions confirm @react-pdf emits
 * valid PDF bytes; the gatherer test pins `now` to assert the this-week window
 * splits lifetime totals from weekly momentum.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  gatherStudentReportData,
  type StudentReportData,
} from "@/server/services/studentReport";
import { renderStudentReportPdf } from "@/lib/reports/StudentReportPdf";
import { cleanupTestUsers, createTestUser } from "./helpers";

const NOW = new Date("2026-06-04T12:00:00.000Z");
const IN_WINDOW = new Date("2026-06-03T12:00:00.000Z");
const OUT_OF_WINDOW = new Date("2026-05-01T12:00:00.000Z");

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

function pdfMagic(buf: Buffer): string {
  return buf.subarray(0, 5).toString("latin1");
}

const SAMPLE: StudentReportData = {
  studentName: "Jordan Riley",
  generatedAt: new Date("2026-06-04T00:00:00.000Z"),
  xp: 850,
  level: 3,
  streak: 4,
  badges: 2,
  lessonsCompleted: 9,
  lessonsThisWeek: 3,
  xpThisWeek: 300,
  courses: [
    { title: "Fractions", progressPct: 60, completed: false },
    { title: "Decimals", progressPct: 100, completed: true },
  ],
};

describe("renderStudentReportPdf", () => {
  it("emits valid PDF bytes for a populated report", async () => {
    const buf = await renderStudentReportPdf(SAMPLE);
    expect(buf.length).toBeGreaterThan(500);
    expect(pdfMagic(buf)).toBe("%PDF-");
  });

  it("renders cleanly with no courses", async () => {
    const buf = await renderStudentReportPdf({ ...SAMPLE, courses: [] });
    expect(pdfMagic(buf)).toBe("%PDF-");
  });
});

describe("gatherStudentReportData", () => {
  it("splits lifetime totals from the this-week window", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });

    const course = await db.course.create({
      data: {
        slug: `test-vitest-course-${crypto.randomUUID()}`,
        title: "Fractions",
        description: "d",
        subject: "Math",
        grade: "6",
        authorId: teacher.id,
        authorLabel: "T",
        priceCents: 0,
        status: "PUBLISHED",
      },
    });
    const unit = await db.unit.create({
      data: { courseId: course.id, title: "U", order: 1 },
    });
    const lesson = await db.lesson.create({
      data: {
        unitId: unit.id,
        slug: `test-lesson-${crypto.randomUUID()}`,
        title: "L",
        order: 1,
      },
    });

    await db.enrollment.create({
      data: { userId: student.id, courseId: course.id, progressPct: 60 },
    });
    await db.lessonProgress.create({
      data: { userId: student.id, lessonId: lesson.id, completedAt: IN_WINDOW },
    });
    await db.xPEvent.createMany({
      data: [
        { userId: student.id, points: 800, source: "test", createdAt: IN_WINDOW },
        { userId: student.id, points: 50, source: "test", createdAt: OUT_OF_WINDOW },
      ] as Prisma.XPEventCreateManyInput[],
    });
    await db.streak.create({
      data: { userId: student.id, current: 4, longest: 4, lastDay: IN_WINDOW },
    });

    const data = await gatherStudentReportData(db, student.id, NOW);

    expect(data.xp).toBe(850); // lifetime: both events
    expect(data.xpThisWeek).toBe(800); // window: in-window only
    expect(data.level).toBe(3); // 1 + floor(850 / 350)
    expect(data.streak).toBe(4);
    expect(data.lessonsCompleted).toBe(1);
    expect(data.lessonsThisWeek).toBe(1);
    expect(data.courses).toEqual([
      { title: "Fractions", progressPct: 60, completed: false },
    ]);

    // And the snapshot renders to a valid PDF end-to-end.
    const buf = await renderStudentReportPdf(data);
    expect(pdfMagic(buf)).toBe("%PDF-");
  });
});
