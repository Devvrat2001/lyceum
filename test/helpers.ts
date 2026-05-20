/**
 * Shared test scaffolding.
 *
 * Strategy: each test creates its own ephemeral User rows with an
 * email prefix of `test-vitest-`. Cleanup is a single
 * `deleteMany({startsWith})` — `onDelete: Cascade` carries away every
 * Enrollment / Order / Attempt / XPEvent / Streak / Notification /
 * ParentChild row those users touched. No transactions, no schema
 * surgery; the tradeoff is that we share the dev DB with whoever's
 * clicking in the browser, which we accept because the prefix keeps
 * the blast radius surgical.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { appRouter } from "@/server/routers/_app";
import type { Context } from "@/server/context";
import type { Session } from "next-auth";

export const TEST_EMAIL_PREFIX = "test-vitest-";

export type TestRole = "STUDENT" | "TEACHER" | "ADMIN" | "PARENT";

export type TestUser = {
  id: string;
  email: string;
  role: TestRole;
  caller: ReturnType<typeof makeCaller>;
};

/**
 * Create a fresh User + return a tRPC caller bound to a faked session
 * for them. The user is real — bcrypt'd password, real row — so
 * routers that read `ctx.user.id` get a row that exists in the DB.
 */
export async function createTestUser(opts?: {
  role?: TestRole;
  password?: string | null;
  institutionId?: string | null;
}): Promise<TestUser> {
  const role: TestRole = opts?.role ?? "STUDENT";
  const email = `${TEST_EMAIL_PREFIX}${randomUUID()}@example.test`;
  const passwordHash =
    opts?.password === null
      ? null
      : await bcrypt.hash(opts?.password ?? "demo1234", 12);
  const row = await db.user.create({
    data: {
      email,
      passwordHash,
      name: `Test ${role.toLowerCase()}`,
      firstName: "Test",
      role,
      institutionId: opts?.institutionId ?? null,
    },
    select: { id: true, email: true, role: true },
  });
  return {
    id: row.id,
    email: row.email,
    role: row.role as TestRole,
    caller: makeCaller(row),
  };
}

/** Caller bound to no session — for publicProcedure paths like signup. */
export function anonCaller() {
  const ctx: Context = { db, session: null };
  return appRouter.createCaller(ctx);
}

function makeCaller(user: { id: string; email: string; role: string }) {
  // Auth.js Session shape is mostly opaque to our routers — they read
  // ctx.session.user.{id,role,email}. We mint a stub with the same
  // surface; protectedProcedure just checks session?.user exists.
  const session = {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: null,
      image: null,
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as unknown as Session;
  const ctx: Context = { db, session };
  return appRouter.createCaller(ctx);
}

/**
 * Delete every test-vitest-* user. Cascade rules remove everything
 * downstream — *except* Course.author, which has no `onDelete: Cascade`
 * (deleting a teacher mid-flight in prod is intentionally hard). Wipe
 * the test teachers' courses first; then the user delete succeeds.
 * Safe to call repeatedly.
 */
export async function cleanupTestUsers() {
  await db.course.deleteMany({
    where: { author: { email: { startsWith: TEST_EMAIL_PREFIX } } },
  });
  await db.user.deleteMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
  });
}
