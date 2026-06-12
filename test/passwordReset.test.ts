/**
 * Password reset + email verification (REQUIREMENTS R10). The link
 * itself only travels by email, so the tests read tokens straight from
 * the VerificationToken table — what matters is: no enumeration in the
 * response, token round-trip sets a working bcrypt hash, expiry/garbage
 * reject, and verifyEmail stamps emailVerified.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { anonCaller, cleanupTestUsers, createTestUser } from "./helpers";

async function wipeAudit() {
  // The request mutation rate-limits on these audit rows; clear between
  // runs so repeated suites don't trip the per-minute bucket.
  await db.auditLog.deleteMany({
    where: { kind: "auth.password_reset_request" },
  });
}

beforeAll(async () => {
  await cleanupTestUsers();
  await wipeAudit();
});
afterAll(async () => {
  await cleanupTestUsers();
  await wipeAudit();
});

describe("auth.requestPasswordReset", () => {
  it("creates a token for an existing user; unknown emails get the same ok", async () => {
    const user = await createTestUser({ role: "STUDENT" });
    const caller = anonCaller();

    const res = await caller.auth.requestPasswordReset({
      email: user.email,
    });
    expect(res.ok).toBe(true);
    const tokens = await db.verificationToken.findMany({
      where: { identifier: `pwreset:${user.email}` },
    });
    expect(tokens).toHaveLength(1);

    // Unknown address: identical response, no row — the response can't
    // be used to probe which emails have accounts.
    const ghostEmail = `test-vitest-ghost-${crypto.randomUUID()}@example.test`;
    const res2 = await caller.auth.requestPasswordReset({
      email: ghostEmail,
    });
    expect(res2.ok).toBe(true);
    expect(
      await db.verificationToken.findMany({
        where: { identifier: `pwreset:${ghostEmail}` },
      })
    ).toHaveLength(0);
  });
});

describe("auth.resetPassword", () => {
  it("valid token sets the new password (and marks the email verified)", async () => {
    const user = await createTestUser({ role: "STUDENT" });
    const caller = anonCaller();
    await caller.auth.requestPasswordReset({ email: user.email });
    const tokenRow = await db.verificationToken.findFirstOrThrow({
      where: { identifier: `pwreset:${user.email}` },
    });

    const res = await caller.auth.resetPassword({
      email: user.email,
      token: tokenRow.token,
      password: "brand-new-secret-1",
    });
    expect(res.ok).toBe(true);

    const fresh = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, emailVerified: true },
    });
    expect(
      await bcrypt.compare("brand-new-secret-1", fresh.passwordHash ?? "")
    ).toBe(true);
    expect(fresh.emailVerified).not.toBeNull();

    // Token is single-use: the same link can't be replayed.
    await expect(
      caller.auth.resetPassword({
        email: user.email,
        token: tokenRow.token,
        password: "another-secret-2",
      })
    ).rejects.toThrow(/invalid or has expired/i);
  });

  it("expired and garbage tokens reject without touching the account", async () => {
    const user = await createTestUser({ role: "STUDENT" });
    const caller = anonCaller();
    await db.verificationToken.create({
      data: {
        identifier: `pwreset:${user.email}`,
        token: "deadbeefdeadbeefdeadbeef",
        expires: new Date(Date.now() - 60_000),
      },
    });

    await expect(
      caller.auth.resetPassword({
        email: user.email,
        token: "deadbeefdeadbeefdeadbeef",
        password: "should-not-land-1",
      })
    ).rejects.toThrow(/invalid or has expired/i);
    await expect(
      caller.auth.resetPassword({
        email: user.email,
        token: "totally-wrong-token-xxxx",
        password: "should-not-land-2",
      })
    ).rejects.toThrow(/invalid or has expired/i);
  });
});

describe("auth.verifyEmail", () => {
  it("stamps emailVerified from a valid token, once", async () => {
    const user = await createTestUser({ role: "STUDENT" });
    const caller = anonCaller();
    await db.verificationToken.create({
      data: {
        identifier: `verify:${user.email}`,
        token: "verifytokenverifytoken01",
        expires: new Date(Date.now() + 3600_000),
      },
    });

    const res = await caller.auth.verifyEmail({
      email: user.email,
      token: "verifytokenverifytoken01",
    });
    expect(res.ok).toBe(true);
    const fresh = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerified: true },
    });
    expect(fresh.emailVerified).not.toBeNull();

    await expect(
      caller.auth.verifyEmail({
        email: user.email,
        token: "verifytokenverifytoken01",
      })
    ).rejects.toThrow(/invalid or has expired/i);
  });
});
