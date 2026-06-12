/**
 * Signup consent gate (REQUIREMENTS R11): age band + consent stamp +
 * parent-email capture for under-13s. The UI requires everything; the
 * API's one hard rule is "under13 needs a parent email".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { anonCaller, cleanupTestUsers } from "./helpers";

const freshEmail = () =>
  `test-vitest-consent-${crypto.randomUUID()}@example.test`;

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("auth.signup consent gate", () => {
  it("rejects an under-13 signup without a parent email", async () => {
    await expect(
      anonCaller().auth.signup({
        email: freshEmail(),
        password: "longenough1",
        ageBand: "under13",
        consent: true,
      })
    ).rejects.toThrow(/parent or guardian email/i);
  });

  it("stamps coppaConsentAt and stores band + parent email", async () => {
    const email = freshEmail();
    const res = await anonCaller().auth.signup({
      email,
      password: "longenough1",
      firstName: "Kid",
      ageBand: "under13",
      parentEmail: "Parent@Example.Test",
      consent: true,
    });
    const row = await db.user.findUniqueOrThrow({
      where: { id: res.id },
      select: { ageBand: true, parentEmail: true, coppaConsentAt: true },
    });
    expect(row.ageBand).toBe("under13");
    expect(row.parentEmail).toBe("parent@example.test");
    expect(row.coppaConsentAt).not.toBeNull();
  });

  it("legacy calls without the new fields still work (no stamp)", async () => {
    const email = freshEmail();
    const res = await anonCaller().auth.signup({
      email,
      password: "longenough1",
    });
    const row = await db.user.findUniqueOrThrow({
      where: { id: res.id },
      select: { ageBand: true, coppaConsentAt: true },
    });
    expect(row.ageBand).toBeNull();
    expect(row.coppaConsentAt).toBeNull();
  });
});
