/**
 * Credentials login throttling (REQUIREMENTS R46). Exercises the
 * AuditLog-backed brute-force counter directly: per-email lockout after
 * the threshold, a per-IP bucket that catches enumeration sweeps, and the
 * "unknown" IP escape hatch (no request scope → IP bucket skipped).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isLoginThrottled, recordLoginFailure } from "@/lib/loginRateLimit";

async function wipe() {
  await db.auditLog.deleteMany({ where: { kind: "auth.login_failed" } });
}
beforeAll(wipe);
afterAll(wipe);

describe("login throttle (R46)", () => {
  it("locks an email only after it crosses the failure threshold", async () => {
    const email = `test-vitest-thr-${crypto.randomUUID()}@x.test`;
    const ip = "unknown"; // isolates the email bucket (IP bucket skipped)

    for (let i = 0; i < 7; i++) await recordLoginFailure({ email, ip });
    expect(await isLoginThrottled({ email, ip })).toBe(false); // 7 < 8

    await recordLoginFailure({ email, ip });
    expect(await isLoginThrottled({ email, ip })).toBe(true); // 8 >= 8
  });

  it("blocks a whole IP across many emails (enumeration sweep)", async () => {
    const ip = `10.0.0.${crypto.randomUUID()}`;
    for (let i = 0; i < 30; i++) {
      await recordLoginFailure({
        email: `sweep-${i}-${crypto.randomUUID()}@x.test`,
        ip,
      });
    }
    // A brand-new email from the same IP is already throttled.
    expect(
      await isLoginThrottled({
        email: `fresh-${crypto.randomUUID()}@x.test`,
        ip,
      })
    ).toBe(true);
  });

  it("never throttles a clean email on an unknown IP", async () => {
    expect(
      await isLoginThrottled({
        email: `clean-${crypto.randomUUID()}@x.test`,
        ip: "unknown",
      })
    ).toBe(false);
  });
});
