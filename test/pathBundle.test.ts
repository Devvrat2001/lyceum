/**
 * path.create / path.remove — the teacher bundle authoring flow.
 * Regressions here would let a teacher bundle courses they don't own,
 * publish a dishonest "Save N%" label, or delete another teacher's
 * (or a platform-curated) bundle.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

// Bundle titles are "Test Vitest …" so their slugs land under this
// prefix and the cleanup below can never touch seeded paths.
const TEST_PATH_SLUG_PREFIX = "test-vitest";

async function cleanupTestPaths() {
  await db.path.deleteMany({
    where: { slug: { startsWith: TEST_PATH_SLUG_PREFIX } },
  });
}

beforeAll(async () => {
  await cleanupTestPaths();
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestPaths();
  await cleanupTestUsers();
});

async function makeCourse(
  ownerId: string,
  priceCents: number,
  status: "PUBLISHED" | "DRAFT" = "PUBLISHED"
) {
  return db.course.create({
    data: {
      slug: `test-vitest-bundle-${crypto.randomUUID()}`,
      title: "Bundleable Course",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      authorLabel: "Test Teacher",
      priceCents,
      status,
    },
  });
}

describe("path.create", () => {
  it("creates a bundle from own published courses with an honest saveLabel", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const a = await makeCourse(teacher.id, 1000);
    const b = await makeCourse(teacher.id, 1000);

    const path = await teacher.caller.path.create({
      title: "Test Vitest Algebra Pack",
      priceCents: 1500,
      courseIds: [a.id, b.id],
    });

    expect(path.slug.startsWith(TEST_PATH_SLUG_PREFIX)).toBe(true);
    expect(path.saveLabel).toBe("Save 25%"); // 1500 vs 2000
    expect(path.subtitle).toBe("2 courses"); // default when omitted
    expect(path.courses.map((c) => c.courseId)).toEqual([a.id, b.id]);
    expect(path.courses.map((c) => c.order)).toEqual([1, 2]);

    const mine = await teacher.caller.path.myPaths();
    expect(mine.some((p) => p.id === path.id)).toBe(true);
  });

  it("omits saveLabel when the bundle isn't cheaper (or courses are free)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const a = await makeCourse(teacher.id, 0);
    const b = await makeCourse(teacher.id, 0);
    const path = await teacher.caller.path.create({
      title: "Test Vitest Free Pack",
      priceCents: 0,
      courseIds: [a.id, b.id],
    });
    expect(path.saveLabel).toBeNull();
  });

  it("rejects courses the teacher doesn't own", async () => {
    const teacherA = await createTestUser({ role: "TEACHER" });
    const teacherB = await createTestUser({ role: "TEACHER" });
    const own = await makeCourse(teacherA.id, 1000);
    const foreign = await makeCourse(teacherB.id, 1000);

    await expect(
      teacherA.caller.path.create({
        title: "Test Vitest Sneaky Pack",
        priceCents: 0,
        courseIds: [own.id, foreign.id],
      })
    ).rejects.toThrow(/own published/i);
  });

  it("rejects unpublished courses", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const live = await makeCourse(teacher.id, 1000);
    const draft = await makeCourse(teacher.id, 1000, "DRAFT");

    await expect(
      teacher.caller.path.create({
        title: "Test Vitest Draft Pack",
        priceCents: 0,
        courseIds: [live.id, draft.id],
      })
    ).rejects.toThrow(/own published/i);
  });

  it("rejects duplicate ids that collapse below 2 distinct courses", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const a = await makeCourse(teacher.id, 1000);
    await expect(
      teacher.caller.path.create({
        title: "Test Vitest Dupe Pack",
        priceCents: 0,
        courseIds: [a.id, a.id],
      })
    ).rejects.toThrow(/distinct/i);
  });
});

describe("path.remove", () => {
  it("deletes own bundles; rejects someone else's", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const other = await createTestUser({ role: "TEACHER" });
    const a = await makeCourse(owner.id, 0);
    const b = await makeCourse(owner.id, 0);
    const path = await owner.caller.path.create({
      title: "Test Vitest Removable Pack",
      priceCents: 0,
      courseIds: [a.id, b.id],
    });

    await expect(
      other.caller.path.remove({ pathId: path.id })
    ).rejects.toThrow(/own bundles/i);

    await owner.caller.path.remove({ pathId: path.id });
    const gone = await db.path.findUnique({ where: { id: path.id } });
    expect(gone).toBeNull();
  });
});
