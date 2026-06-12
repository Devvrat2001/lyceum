/**
 * marketplace.recommendedFor (REQUIREMENTS R13): signed-in students
 * with enrollments get picks from their own subjects/grades that they
 * don't already own; everyone else gets honest top-rated fallback with
 * `personalized: false`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ensureEnrollment } from "@/server/services/enrollment";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

// A subject token no seed/demo course uses, so matching is deterministic
// against whatever else lives in the dev DB.
const SUBJECT = `tvsubj${crypto.randomUUID().slice(0, 8)}`;

async function makeCourse(ownerId: string, title: string) {
  return db.course.create({
    data: {
      slug: `test-vitest-recs-${crypto.randomUUID()}`,
      title,
      description: ".",
      subject: SUBJECT,
      grade: "11", // demo seeds are grade 6 — keep the grade axis quiet too
      authorId: ownerId,
      priceCents: 0,
      status: "PUBLISHED",
      ratingAvg: 5,
      ratingCount: 1,
    },
  });
}

describe("marketplace.recommendedFor", () => {
  it("personalizes for an enrolled student: same subject, not owned", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const owned = await makeCourse(teacher.id, "Owned Fixture");
    const sibling = await makeCourse(teacher.id, "Sibling Fixture");
    await ensureEnrollment(db, student.id, owned.id);

    const res = await student.caller.marketplace.recommendedFor();
    expect(res.personalized).toBe(true);
    const slugs = res.items.map((i) => i.slug);
    expect(slugs).toContain(sibling.slug);
    expect(slugs).not.toContain(owned.slug);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.length).toBeLessThanOrEqual(3);
  });

  it("a student with no enrollments gets the honest top-rated fallback", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    const res = await student.caller.marketplace.recommendedFor();
    expect(res.personalized).toBe(false);
    expect(res.items.length).toBeGreaterThan(0);
  });
});
