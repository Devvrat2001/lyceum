/**
 * Account deletion + data export (REQUIREMENTS R43 — DPDP/COPPA erasure
 * & portability). exportData returns the user's own bundle; deleteAccount
 * anonymises PII + tombstones the identity while retaining de-identified
 * domain rows, and refuses teachers whose content/sales others depend on.
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

describe("account.exportData", () => {
  it("returns the signed-in user's own data bundle", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    await db.xPEvent.create({
      data: { userId: student.id, points: 20, source: "test_export" },
    });
    await db.notification.create({
      data: { userId: student.id, kind: "test", title: "Hello" },
    });

    const bundle = await student.caller.account.exportData();
    expect(bundle.profile.id).toBe(student.id);
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundle.xpEvents.some((x) => x.source === "test_export")).toBe(true);
    expect(bundle.notifications.some((n) => n.title === "Hello")).toBe(true);
  });
});

describe("account.deleteAccount", () => {
  it("anonymises a student's PII, blocks sign-in, and keeps de-identified rows", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const before = await db.user.findUniqueOrThrow({
      where: { id: student.id },
    });
    // A domain row that must survive (de-identified) after erasure.
    await db.xPEvent.create({
      data: { userId: student.id, points: 10, source: "test_keep" },
    });

    const res = await student.caller.account.deleteAccount({ confirm: "DELETE" });
    expect(res.ok).toBe(true);

    const after = await db.user.findUniqueOrThrow({
      where: { id: student.id },
    });
    expect(after.deletedAt).not.toBeNull();
    expect(after.email).not.toBe(before.email);
    expect(after.email).toContain("deleted+");
    expect(after.name).toBeNull();
    expect(after.firstName).toBeNull();
    expect(after.passwordHash).toBeNull();

    // The XP row is retained (analytics/ledger integrity), just orphaned
    // of identity.
    const kept = await db.xPEvent.count({
      where: { userId: student.id, source: "test_keep" },
    });
    expect(kept).toBe(1);

    // Tombstoned email won't be caught by the prefix cleanup — remove by id.
    await db.user.delete({ where: { id: student.id } });
  });

  it("refuses deletion for a teacher who authored a course", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await db.course.create({
      data: {
        slug: `test-vitest-del-${crypto.randomUUID()}`,
        title: "Owned Course",
        description: ".",
        subject: "math",
        grade: "6",
        authorId: teacher.id,
        priceCents: 0,
        status: "PUBLISHED",
      },
    });

    await expect(
      teacher.caller.account.deleteAccount({ confirm: "DELETE" })
    ).rejects.toThrow(/PRECONDITION_FAILED|contact support/i);

    // Still live — nothing was anonymised.
    const row = await db.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(row.deletedAt).toBeNull();
  });
});
