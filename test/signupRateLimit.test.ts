/**
 * Account-creation throttle (REQUIREMENTS R51). Per-hashed-IP cap on
 * signups via the AuditLog counter, with a hard skip when there's no IP
 * scope (so the test suite's many signups are never throttled). Also
 * checks that a real signup writes the `auth.signup` row the counter reads.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isSignupThrottled } from "@/lib/signupRateLimit";
import { anonCaller, cleanupTestUsers } from "./helpers";

async function wipe() {
  await db.auditLog.deleteMany({ where: { kind: "auth.signup" } });
}
beforeAll(async () => {
  await cleanupTestUsers();
  await wipe();
});
afterAll(async () => {
  await cleanupTestUsers();
  await wipe();
});

describe("isSignupThrottled (R51)", () => {
  it("skips entirely when there's no IP scope", async () => {
    expect(await isSignupThrottled(null)).toBe(false);
    expect(await isSignupThrottled(undefined)).toBe(false);
  });

  it("throttles a hashed-IP only once it crosses the per-IP cap", async () => {
    const key = `test-vitest-ip-${crypto.randomUUID()}`;
    for (let i = 0; i < 19; i++) {
      await db.auditLog.create({
        data: { kind: "auth.signup", payload: { anonKey: key } },
      });
    }
    expect(await isSignupThrottled(key)).toBe(false); // 19 < 20
    await db.auditLog.create({
      data: { kind: "auth.signup", payload: { anonKey: key } },
    });
    expect(await isSignupThrottled(key)).toBe(true); // 20 >= 20
  });
});

describe("auth.signup audit row (R51 counter source)", () => {
  it("a real signup writes an auth.signup row tied to the user", async () => {
    const email = `test-vitest-su-${crypto.randomUUID()}@x.test`;
    await anonCaller().auth.signup({
      email,
      password: "password123",
      role: "STUDENT",
    });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const row = await db.auditLog.findFirst({
      where: { kind: "auth.signup", actorId: user.id },
    });
    expect(row).not.toBeNull();
  });
});
