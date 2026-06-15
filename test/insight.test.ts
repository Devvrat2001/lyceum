/**
 * Insight router caller coverage (REQUIREMENTS R53 tail). The insight
 * *engine* is tested (insightEngine.test) but the router that fronts the
 * cache + authz wasn't. Covers the cache-read path (returns 3 fresh rows /
 * null when stale-or-forced), the teacher-only authz on `forTeacher`, and
 * the `health` count — all without an AI call (the regenerate* mutations
 * hit the engine and are covered there).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

const seededScopes: string[] = [];

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  if (seededScopes.length > 0) {
    await db.insight.deleteMany({ where: { scope: { in: seededScopes } } });
  }
  await cleanupTestUsers();
});

async function seedTeacherInsights(teacherId: string) {
  const scope = `TEACHER:${teacherId}`;
  seededScopes.push(scope);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  for (let i = 0; i < 3; i++) {
    await db.insight.create({
      data: {
        audience: "teacher",
        scope,
        kind: "PATTERN",
        body: `Insight ${i} for the teacher.`,
        cta: i === 0 ? "Suggest fix" : null,
        payload: { mode: "demo" },
        expiresAt,
      },
    });
  }
}

describe("insight.forTeacher", () => {
  it("returns the 3 fresh cached insights, and null when forced", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await seedTeacherInsights(teacher.id);

    const cached = await teacher.caller.insight.forTeacher({});
    expect(cached).not.toBeNull();
    expect(cached!.fromCache).toBe(true);
    expect(cached!.insights).toHaveLength(3);
    expect(cached!.insights.some((i) => i.cta === "Suggest fix")).toBe(true);

    // forceRefresh always misses the cache so the client re-generates.
    expect(
      await teacher.caller.insight.forTeacher({ forceRefresh: true })
    ).toBeNull();
  });

  it("returns null when the teacher has no fresh cache", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    expect(await teacher.caller.insight.forTeacher({})).toBeNull();
  });

  it("is teacher-only — a student can't read teacher insights", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    await expect(student.caller.insight.forTeacher({})).rejects.toThrow(
      /UNAUTHORIZED|FORBIDDEN/
    );
  });
});

describe("insight.health", () => {
  it("counts the active (unexpired) insights", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await seedTeacherInsights(teacher.id);
    const { activeCount } = await teacher.caller.insight.health();
    expect(activeCount).toBeGreaterThanOrEqual(3);
  });
});
