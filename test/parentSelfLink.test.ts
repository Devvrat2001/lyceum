/**
 * Parent self-service linking (REQUIREMENTS R26). Student generates a
 * family code (VerificationToken, `parentlink:` namespace); a signed-in
 * PARENT redeems it once to create the ParentChild row. Codes are
 * single-use, expire in 7 days, and regenerating replaces the old one.
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

describe("parent self-service linking", () => {
  it("student generates a code; parent redeems it once", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const parent = await createTestUser({ role: "PARENT" });

    const { code, expiresAt } =
      await student.caller.student.generateParentCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const res = await parent.caller.parent.linkWithCode({ code });
    expect(res.ok).toBe(true);

    const link = await db.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: parent.id, childId: student.id },
      },
    });
    expect(link).not.toBeNull();

    // Single-use: the same code can't be redeemed again (even though
    // the link itself is idempotent).
    const parent2 = await createTestUser({ role: "PARENT" });
    await expect(
      parent2.caller.parent.linkWithCode({ code })
    ).rejects.toThrow(/isn't valid/i);
  });

  it("normalizes messy input (lowercase, spaces, dashes)", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const parent = await createTestUser({ role: "PARENT" });
    const { code } = await student.caller.student.generateParentCode();

    const messy = ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `;
    const res = await parent.caller.parent.linkWithCode({ code: messy });
    expect(res.ok).toBe(true);
  });

  it("rejects junk and expired codes", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const parent = await createTestUser({ role: "PARENT" });

    await expect(
      parent.caller.parent.linkWithCode({ code: "NOPE99" })
    ).rejects.toThrow(/isn't valid/i);

    // Hand-write an expired token in the parentlink namespace.
    await db.verificationToken.create({
      data: {
        identifier: `parentlink:${student.id}`,
        token: "EXPIRD",
        expires: new Date(Date.now() - 60_000),
      },
    });
    await expect(
      parent.caller.parent.linkWithCode({ code: "EXPIRD" })
    ).rejects.toThrow(/expired/i);
    // Expired row is cleaned up on rejection.
    expect(
      await db.verificationToken.findFirst({
        where: { identifier: `parentlink:${student.id}` },
      })
    ).toBeNull();
  });

  it("regenerating replaces the previous code", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const parent = await createTestUser({ role: "PARENT" });

    const first = await student.caller.student.generateParentCode();
    const second = await student.caller.student.generateParentCode();
    expect(second.code).not.toBe(first.code);

    await expect(
      parent.caller.parent.linkWithCode({ code: first.code })
    ).rejects.toThrow(/isn't valid/i);
    const res = await parent.caller.parent.linkWithCode({
      code: second.code,
    });
    expect(res.ok).toBe(true);
  });

  it("enforces the role gates both ways", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const parent = await createTestUser({ role: "PARENT" });

    await expect(
      parent.caller.student.generateParentCode()
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      student.caller.parent.linkWithCode({ code: "ABCDEF" })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
