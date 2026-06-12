/**
 * Curriculum-board facet (REQUIREMENTS R21): `Course.board` filters the
 * /browse catalog, junk URL values degrade to "no filter", and the
 * teacher-side updateCourse validates the slug.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { anonCaller, cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

/** Unique marker so browse({q}) only sees this test's fixtures. */
const MARK = `tvboard${crypto.randomUUID().slice(0, 8)}`;

async function makeCourse(authorId: string, board: string | null) {
  return db.course.create({
    data: {
      slug: `test-vitest-board-${crypto.randomUUID()}`,
      title: `${MARK} ${board ?? "untagged"} course`,
      description: ".",
      subject: "math",
      grade: "6",
      board,
      authorId,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
}

describe("marketplace.browse board facet", () => {
  it("filters to the requested board; junk values degrade to no filter", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const cbse = await makeCourse(t.id, "cbse");
    const icse = await makeCourse(t.id, "icse");
    const untagged = await makeCourse(t.id, null);

    const all = await anonCaller().marketplace.browse({ q: MARK });
    expect(all.courses.map((c) => c.id).sort()).toEqual(
      [cbse.id, icse.id, untagged.id].sort()
    );

    const onlyCbse = await anonCaller().marketplace.browse({
      q: MARK,
      board: "cbse",
    });
    expect(onlyCbse.courses.map((c) => c.id)).toEqual([cbse.id]);
    expect(onlyCbse.courses[0].board).toBe("cbse");

    // Stale/junk URL value → treated as "no filter", never zero results.
    const junk = await anonCaller().marketplace.browse({
      q: MARK,
      board: "hogwarts",
    });
    expect(junk.courses).toHaveLength(3);
  });
});

describe("teacher.updateCourse board", () => {
  it("sets, clears, and rejects unknown boards", async () => {
    const t = await createTestUser({ role: "TEACHER" });
    const course = await makeCourse(t.id, null);

    await t.caller.teacher.updateCourse({ courseId: course.id, board: "ib" });
    expect(
      (await db.course.findUniqueOrThrow({ where: { id: course.id } })).board
    ).toBe("ib");

    // Empty string clears back to untagged.
    await t.caller.teacher.updateCourse({ courseId: course.id, board: "" });
    expect(
      (await db.course.findUniqueOrThrow({ where: { id: course.id } })).board
    ).toBeNull();

    await expect(
      t.caller.teacher.updateCourse({ courseId: course.id, board: "hogwarts" })
    ).rejects.toThrow(/unknown board/i);
  });
});
