/**
 * Smoke: `auth.signup` is the only public-procedure write that creates
 * a User. If this regresses, no one can sign up.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { TEST_EMAIL_PREFIX, anonCaller, cleanupTestUsers } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("auth.signup", () => {
  it("creates a STUDENT user with a bcrypt password hash", async () => {
    const email = `${TEST_EMAIL_PREFIX}${randomUUID()}@example.test`;
    const result = await anonCaller().auth.signup({
      email,
      password: "verysecret123",
      firstName: "Brand",
      role: "STUDENT",
    });

    expect(result.email).toBe(email);
    expect(result.role).toBe("STUDENT");
    expect(result.name).toBe("Brand");

    const persisted = await db.user.findUnique({ where: { id: result.id } });
    expect(persisted?.passwordHash).toBeTruthy();
    // Stored as a hash, not the raw secret.
    expect(persisted?.passwordHash).not.toBe("verysecret123");
    // And bcrypt.compare round-trips, so the hash is actually usable
    // by the Credentials provider's `authorize` callback.
    expect(
      await bcrypt.compare("verysecret123", persisted!.passwordHash!)
    ).toBe(true);
  });

  it("rejects a duplicate email with CONFLICT", async () => {
    const email = `${TEST_EMAIL_PREFIX}${randomUUID()}@example.test`;
    await anonCaller().auth.signup({
      email,
      password: "verysecret123",
      role: "STUDENT",
    });
    await expect(
      anonCaller().auth.signup({
        email,
        password: "anotherone456",
        role: "STUDENT",
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("normalises email to lowercase", async () => {
    const upper = `${TEST_EMAIL_PREFIX}${randomUUID()}@EXAMPLE.TEST`;
    const result = await anonCaller().auth.signup({
      email: upper,
      password: "verysecret123",
    });
    expect(result.email).toBe(upper.toLowerCase());
  });

  it("rejects passwords shorter than 8 chars at the zod boundary", async () => {
    const email = `${TEST_EMAIL_PREFIX}${randomUUID()}@example.test`;
    await expect(
      anonCaller().auth.signup({ email, password: "short" })
    ).rejects.toThrow();
  });
});
