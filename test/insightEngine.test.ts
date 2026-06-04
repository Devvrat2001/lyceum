/**
 * `insightEngine` — the shared generation core behind the on-demand insight
 * mutations and the nightly `/api/cron/ai-insights` warmer.
 *
 * No LLM key is present in the test env, so `isLlmEnabled()` is false and the
 * engine takes its deterministic demo path — the store/scope/TTL behavior is
 * fully assertable without any network call.
 *
 * Cleanup note: `Insight` has no FK to its scope (the scope is a plain string),
 * so cleanupTestUsers can't cascade these rows away. We track every scope +
 * institution we create and delete them explicitly.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  generateAdminInsights,
  generateTeacherInsights,
} from "@/server/services/insightEngine";
import { cleanupTestUsers, createTestUser } from "./helpers";

// The local env may carry a real LLM key (so isLlmEnabled() is true), which
// would make non-empty scopes fire actual network calls. Force the engine's
// deterministic demo path — these tests assert storage/scope/TTL, not model
// output — while keeping every other real export intact.
vi.mock("@/lib/ai/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/llm")>();
  return { ...actual, isLlmEnabled: () => false };
});

const TEACHER_KINDS = new Set(["PATTERN", "OPPORTUNITY", "AT_RISK"]);
const ADMIN_KINDS = new Set(["STRENGTH", "WATCH", "TEACHER"]);

const createdScopes: string[] = [];
const createdInstitutionIds: string[] = [];

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  if (createdScopes.length > 0) {
    await db.insight.deleteMany({ where: { scope: { in: createdScopes } } });
  }
  await cleanupTestUsers();
  if (createdInstitutionIds.length > 0) {
    await db.institution.deleteMany({
      where: { id: { in: createdInstitutionIds } },
    });
  }
});

async function courseFor(teacherId: string) {
  return db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "Fractions",
      description: "d",
      subject: "Math",
      grade: "6",
      authorId: teacherId,
      authorLabel: "T",
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
}

describe("generateTeacherInsights", () => {
  it("stores exactly 3 teacher-scoped insights (demo mode) with a 24h TTL", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const scope = `TEACHER:${teacher.id}`;
    createdScopes.push(scope);

    const course = await courseFor(teacher.id);
    await db.enrollment.create({
      data: { userId: student.id, courseId: course.id, progressPct: 40 },
    });

    const before = Date.now();
    const res = await generateTeacherInsights(db, {
      teacherId: teacher.id,
      teacherName: "Ms. Test",
      isAdmin: false,
    });

    expect(res.mode).toBe("demo");
    expect(res.stats.courseCount).toBe(1);
    expect(res.items).toHaveLength(3);

    const rows = await db.insight.findMany({ where: { scope } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.audience).toBe("teacher");
      expect(TEACHER_KINDS.has(r.kind)).toBe(true);
      // ~24h ahead — comfortably inside (now, now + 25h).
      expect(r.expiresAt.getTime()).toBeGreaterThan(before);
      expect(r.expiresAt.getTime()).toBeLessThan(before + 25 * 3600 * 1000);
    }
  });

  it("replaces prior rows on regeneration (stays at 3, never accumulates)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const scope = `TEACHER:${teacher.id}`;
    createdScopes.push(scope);
    await courseFor(teacher.id);

    await generateTeacherInsights(db, {
      teacherId: teacher.id,
      teacherName: "T",
      isAdmin: false,
    });
    await generateTeacherInsights(db, {
      teacherId: teacher.id,
      teacherName: "T",
      isAdmin: false,
    });

    const rows = await db.insight.findMany({ where: { scope } });
    expect(rows).toHaveLength(3);
  });
});

describe("generateAdminInsights", () => {
  it("stores exactly 3 admin-scoped insights for an institution with students", async () => {
    const institution = await db.institution.create({
      data: { slug: `test-vitest-inst-${crypto.randomUUID()}`, name: "Cedar" },
    });
    createdInstitutionIds.push(institution.id);
    const scope = `ADMIN:${institution.id}`;
    createdScopes.push(scope);

    await createTestUser({ role: "STUDENT", institutionId: institution.id });

    const res = await generateAdminInsights(db, {
      institutionId: institution.id,
    });

    expect(res.mode).toBe("demo");
    expect(res.stats.studentCount).toBeGreaterThanOrEqual(1);
    expect(res.items).toHaveLength(3);

    const rows = await db.insight.findMany({ where: { scope } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.audience).toBe("admin");
      expect(ADMIN_KINDS.has(r.kind)).toBe(true);
    }
  });
});
