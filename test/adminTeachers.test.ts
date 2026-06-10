/**
 * admin.teachers + admin.setTeacherVisibility — the teacher triage
 * panel. Regressions here would leak the panel to non-admins, lose the
 * email column that disambiguates same-display-name accounts, or let a
 * hidden teacher keep showing on the public marketplace rail.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { anonCaller, cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeCourse(
  authorId: string,
  opts?: { enrollCount?: number; status?: "PUBLISHED" | "DRAFT" }
) {
  return db.course.create({
    data: {
      slug: `test-vitest-adminteachers-${crypto.randomUUID()}`,
      title: "Admin Teachers Fixture",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId,
      authorLabel: "Test Teacher",
      priceCents: 0,
      status: opts?.status ?? "PUBLISHED",
      enrollCount: opts?.enrollCount ?? 0,
    },
  });
}

describe("admin.teachers", () => {
  it("lists teachers with email, course/student counts, and payout state", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const teacher = await createTestUser({ role: "TEACHER" });
    await makeCourse(teacher.id, { enrollCount: 5 });
    await makeCourse(teacher.id, { enrollCount: 2 });
    // Draft counts toward totalCourses but not students/published.
    await makeCourse(teacher.id, { enrollCount: 99, status: "DRAFT" });
    await admin.caller.payment.linkRazorpayAccount({
      teacherId: teacher.id,
      accountId: "acc_TestVitestPanel1",
    });

    const rows = await admin.caller.admin.teachers();
    const row = rows.find((r) => r.id === teacher.id);
    expect(row).toBeDefined();
    expect(row!.email).toBe(teacher.email);
    expect(row!.publishedCourses).toBe(2);
    expect(row!.totalCourses).toBe(3);
    expect(row!.studentsCount).toBe(7);
    expect(row!.hiddenFromMarketplace).toBe(false);
    expect(row!.payout).toEqual({
      externalId: "acc_TestVitestPanel1",
      status: "activated",
    });
  });

  it("is admin-only", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await expect(teacher.caller.admin.teachers()).rejects.toThrow();
  });
});

describe("admin.setTeacherVisibility", () => {
  it("hide removes the teacher from the marketplace rail; unhide restores", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const teacher = await createTestUser({ role: "TEACHER" });
    await makeCourse(teacher.id, { enrollCount: 1 });

    const railIds = async () =>
      (await anonCaller().marketplace.teachers({ limit: 24 })).map((t) => t.id);

    expect(await railIds()).toContain(teacher.id);

    await admin.caller.admin.setTeacherVisibility({
      teacherId: teacher.id,
      hidden: true,
    });
    expect(await railIds()).not.toContain(teacher.id);

    await admin.caller.admin.setTeacherVisibility({
      teacherId: teacher.id,
      hidden: false,
    });
    expect(await railIds()).toContain(teacher.id);
  });

  it("rejects non-teacher targets and non-admin callers", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const student = await createTestUser({ role: "STUDENT" });
    const teacher = await createTestUser({ role: "TEACHER" });

    await expect(
      admin.caller.admin.setTeacherVisibility({
        teacherId: student.id,
        hidden: true,
      })
    ).rejects.toThrow(/teacher/i);

    await expect(
      student.caller.admin.setTeacherVisibility({
        teacherId: teacher.id,
        hidden: true,
      })
    ).rejects.toThrow();
  });
});
