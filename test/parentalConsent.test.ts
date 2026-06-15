/**
 * Verifiable parental consent (REQUIREMENTS R47, COPPA — R11 v2). An
 * under-13 signup mints a consent token and stays unconfirmed
 * (`parentConsentAt` NULL) until the parent follows the emailed link;
 * `confirmParentalConsent` stamps consent and burns the token.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { anonCaller, cleanupTestUsers } from "./helpers";
import { isAwaitingParentalConsent } from "@/lib/parentalConsent";

async function cleanup() {
  await cleanupTestUsers();
  // Consent/verify tokens aren't user-cascaded — clear by identifier.
  await db.verificationToken.deleteMany({
    where: { identifier: { contains: "test-vitest" } },
  });
}
beforeAll(cleanup);
afterAll(cleanup);

describe("isAwaitingParentalConsent (pure)", () => {
  it("flags only under-13 accounts without confirmed consent", () => {
    expect(
      isAwaitingParentalConsent({ ageBand: "under13", parentConsentAt: null })
    ).toBe(true);
    expect(
      isAwaitingParentalConsent({
        ageBand: "under13",
        parentConsentAt: new Date(),
      })
    ).toBe(false);
    expect(
      isAwaitingParentalConsent({ ageBand: "13to17", parentConsentAt: null })
    ).toBe(false);
    expect(
      isAwaitingParentalConsent({ ageBand: null, parentConsentAt: null })
    ).toBe(false);
  });
});

describe("auth.confirmParentalConsent (R47)", () => {
  it("under-13 signup mints a token; consent lands only after confirm", async () => {
    const email = `test-vitest-pc-${crypto.randomUUID()}@x.test`;
    const anon = anonCaller();
    await anon.auth.signup({
      email,
      password: "password123",
      firstName: "Kiddo",
      role: "STUDENT",
      ageBand: "under13",
      parentEmail: `test-vitest-parent-${crypto.randomUUID()}@x.test`,
      consent: true,
    });

    const created = await db.user.findUniqueOrThrow({ where: { email } });
    expect(created.parentConsentAt).toBeNull();
    expect(isAwaitingParentalConsent(created)).toBe(true);

    const tok = await db.verificationToken.findFirstOrThrow({
      where: { identifier: `pconsent:${email}` },
    });

    const res = await anon.auth.confirmParentalConsent({
      email,
      token: tok.token,
    });
    expect(res.ok).toBe(true);

    const after = await db.user.findUniqueOrThrow({ where: { email } });
    expect(after.parentConsentAt).not.toBeNull();
    expect(isAwaitingParentalConsent(after)).toBe(false);
    // Token burned on use.
    expect(
      await db.verificationToken.count({
        where: { identifier: `pconsent:${email}` },
      })
    ).toBe(0);
  });

  it("rejects an invalid consent token", async () => {
    const email = `test-vitest-pc2-${crypto.randomUUID()}@x.test`;
    const anon = anonCaller();
    await anon.auth.signup({
      email,
      password: "password123",
      role: "STUDENT",
      ageBand: "under13",
      parentEmail: `test-vitest-parent2-${crypto.randomUUID()}@x.test`,
      consent: true,
    });
    await expect(
      anon.auth.confirmParentalConsent({ email, token: "0".repeat(40) })
    ).rejects.toThrow(/invalid or has expired/i);
  });
});
