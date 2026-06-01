/**
 * Smoke: self-serve account settings (the /settings page backs onto this
 * router). Covers profile edits, password change with bcrypt verification,
 * the teacher-only headline/bio gate, and the email/privacy preference
 * toggles — including the COPPA-consent timestamp mapping the tutor route
 * and email senders read.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("account.updateProfile", () => {
  it("updates first + display name for any role", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    await student.caller.account.updateProfile({
      firstName: "Jordan",
      name: "Jordan Riley",
    });
    const row = await db.user.findUnique({
      where: { id: student.id },
      select: { firstName: true, name: true },
    });
    expect(row?.firstName).toBe("Jordan");
    expect(row?.name).toBe("Jordan Riley");
  });

  it("persists headline + bio for a TEACHER", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await teacher.caller.account.updateProfile({
      headline: "Middle-school math, made visual",
      bio: "Ten years in the classroom.",
    });
    const row = await db.user.findUnique({
      where: { id: teacher.id },
      select: { headline: true, bio: true },
    });
    expect(row?.headline).toBe("Middle-school math, made visual");
    expect(row?.bio).toBe("Ten years in the classroom.");
  });

  it("ignores headline/bio from a non-teacher (storefront is teacher-only)", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    await student.caller.account.updateProfile({
      firstName: "Sam",
      headline: "should be ignored",
      bio: "also ignored",
    });
    const row = await db.user.findUnique({
      where: { id: student.id },
      select: { firstName: true, headline: true, bio: true },
    });
    expect(row?.firstName).toBe("Sam");
    expect(row?.headline).toBeNull();
    expect(row?.bio).toBeNull();
  });

  it("normalises a cleared field to NULL, not empty string", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await teacher.caller.account.updateProfile({ headline: "temporary" });
    await teacher.caller.account.updateProfile({ headline: "" });
    const row = await db.user.findUnique({
      where: { id: teacher.id },
      select: { headline: true },
    });
    expect(row?.headline).toBeNull();
  });
});

describe("account.changePassword", () => {
  it("changes the password when the current one is correct", async () => {
    const user = await createTestUser({ password: "demo1234" });
    const res = await user.caller.account.changePassword({
      currentPassword: "demo1234",
      newPassword: "fresh-secret-9",
    });
    expect(res.ok).toBe(true);

    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    expect(row?.passwordHash).toBeTruthy();
    // The new password verifies; the old one no longer does.
    expect(await bcrypt.compare("fresh-secret-9", row!.passwordHash!)).toBe(
      true
    );
    expect(await bcrypt.compare("demo1234", row!.passwordHash!)).toBe(false);
  });

  it("rejects an incorrect current password", async () => {
    const user = await createTestUser({ password: "demo1234" });
    await expect(
      user.caller.account.changePassword({
        currentPassword: "wrong-password",
        newPassword: "fresh-secret-9",
      })
    ).rejects.toThrow(/incorrect/i);
  });

  it("rejects reusing the same password", async () => {
    const user = await createTestUser({ password: "demo1234" });
    await expect(
      user.caller.account.changePassword({
        currentPassword: "demo1234",
        newPassword: "demo1234",
      })
    ).rejects.toThrow(/different/i);
  });

  it("refuses for a passwordless (SSO/dev-login) account", async () => {
    const user = await createTestUser({ password: null });
    await expect(
      user.caller.account.changePassword({
        currentPassword: "anything",
        newPassword: "fresh-secret-9",
      })
    ).rejects.toThrow(/without a password/i);
  });
});

describe("account.updatePreferences", () => {
  it("toggles email + tutor-log opt-outs", async () => {
    const user = await createTestUser({ role: "STUDENT" });
    await user.caller.account.updatePreferences({
      emailOptOut: true,
      tutorLogOptOut: true,
    });
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { emailOptOut: true, tutorLogOptOut: true },
    });
    expect(row?.emailOptOut).toBe(true);
    expect(row?.tutorLogOptOut).toBe(true);
  });

  it("maps coppaConsent true→timestamp, false→null", async () => {
    const user = await createTestUser({ role: "STUDENT" });

    await user.caller.account.updatePreferences({ coppaConsent: true });
    let row = await db.user.findUnique({
      where: { id: user.id },
      select: { coppaConsentAt: true },
    });
    expect(row?.coppaConsentAt).toBeInstanceOf(Date);

    await user.caller.account.updatePreferences({ coppaConsent: false });
    row = await db.user.findUnique({
      where: { id: user.id },
      select: { coppaConsentAt: true },
    });
    expect(row?.coppaConsentAt).toBeNull();
  });
});

describe("account.me", () => {
  it("returns hasPassword and never leaks the hash", async () => {
    const withPw = await createTestUser({ password: "demo1234" });
    const me = await withPw.caller.account.me();
    expect(me.hasPassword).toBe(true);
    expect("passwordHash" in me).toBe(false);

    const noPw = await createTestUser({ password: null });
    const me2 = await noPw.caller.account.me();
    expect(me2.hasPassword).toBe(false);
  });
});
