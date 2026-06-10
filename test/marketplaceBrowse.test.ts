/**
 * marketplace.browse — the /browse catalog query (live search + cursor
 * pagination). Regressions here would leak DRAFT courses to the public
 * catalog, break search-as-you-type matching, or duplicate/drop courses
 * across pages.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

// Unique marker so assertions can't collide with seeded courses.
const MARKER = "zxqbrowse";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeCourse(
  ownerId: string,
  opts: {
    title: string;
    enrollCount?: number;
    status?: "PUBLISHED" | "DRAFT";
    authorLabel?: string;
  }
) {
  return db.course.create({
    data: {
      slug: `test-vitest-browse-${crypto.randomUUID()}`,
      title: opts.title,
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      authorLabel: opts.authorLabel ?? "Test Teacher",
      priceCents: 0,
      status: opts.status ?? "PUBLISHED",
      enrollCount: opts.enrollCount ?? 0,
    },
  });
}

describe("marketplace.browse", () => {
  it("searches published courses only, case-insensitively", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const viewer = await createTestUser({ role: "STUDENT" });
    await makeCourse(teacher.id, { title: `Algebra ${MARKER} One` });
    await makeCourse(teacher.id, {
      title: `Hidden ${MARKER} Draft`,
      status: "DRAFT",
    });

    const res = await viewer.caller.marketplace.browse({
      q: MARKER.toUpperCase(),
      limit: 48,
    });
    const titles = res.courses.map((c) => c.title);
    expect(titles).toContain(`Algebra ${MARKER} One`);
    expect(titles).not.toContain(`Hidden ${MARKER} Draft`);
  });

  it("matches by teacher (authorLabel) too", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const viewer = await createTestUser({ role: "STUDENT" });
    await makeCourse(teacher.id, {
      title: `Plain Title ${crypto.randomUUID()}`,
      authorLabel: `Prof ${MARKER} Rao`,
    });

    const res = await viewer.caller.marketplace.browse({
      q: `prof ${MARKER}`,
      limit: 48,
    });
    expect(res.courses.length).toBeGreaterThanOrEqual(1);
    expect(res.courses[0].authorLabel).toContain(MARKER);
  });

  it("paginates with a cursor — no overlap, full coverage, stable total", async () => {
    const marker = `${MARKER}pg`;
    const teacher = await createTestUser({ role: "TEACHER" });
    const viewer = await createTestUser({ role: "STUDENT" });
    // Distinct enrollCounts pin the (enrollCount desc) order.
    await makeCourse(teacher.id, { title: `A ${marker}`, enrollCount: 3 });
    await makeCourse(teacher.id, { title: `B ${marker}`, enrollCount: 2 });
    await makeCourse(teacher.id, { title: `C ${marker}`, enrollCount: 1 });

    const page1 = await viewer.caller.marketplace.browse({
      q: marker,
      limit: 2,
    });
    expect(page1.courses).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await viewer.caller.marketplace.browse({
      q: marker,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.courses).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(page2.total).toBe(3);

    const ids = [...page1.courses, ...page2.courses].map((c) => c.id);
    expect(new Set(ids).size).toBe(3); // no dupes across pages
  });

  it("composes chip filters with the search text", async () => {
    const marker = `${MARKER}flt`;
    const teacher = await createTestUser({ role: "TEACHER" });
    const viewer = await createTestUser({ role: "STUDENT" });
    const mathFree = await makeCourse(teacher.id, {
      title: `Math Free ${marker}`,
    });
    await db.course.create({
      data: {
        slug: `test-vitest-browse-${crypto.randomUUID()}`,
        title: `Math Paid ${marker}`,
        description: "Vitest fixture course.",
        subject: "math",
        grade: "6",
        authorId: teacher.id,
        authorLabel: "Test Teacher",
        priceCents: 49900,
        status: "PUBLISHED",
      },
    });
    await db.course.create({
      data: {
        slug: `test-vitest-browse-${crypto.randomUUID()}`,
        title: `Science Free ${marker}`,
        description: "Vitest fixture course.",
        subject: "science",
        grade: "6",
        authorId: teacher.id,
        authorLabel: "Test Teacher",
        priceCents: 0,
        status: "PUBLISHED",
      },
    });

    const res = await viewer.caller.marketplace.browse({
      q: marker,
      subject: "math",
      price: "free",
      limit: 48,
    });
    expect(res.courses.map((c) => c.id)).toEqual([mathFree.id]);
    expect(res.total).toBe(1);
  });

  it("length bucket post-filters a candidate pool (single page, no cursor)", async () => {
    const marker = `${MARKER}len`;
    const teacher = await createTestUser({ role: "TEACHER" });
    const viewer = await createTestUser({ role: "STUDENT" });
    const short = await makeCourse(teacher.id, {
      title: `Short ${marker}`,
      enrollCount: 2,
    });
    const medium = await makeCourse(teacher.id, {
      title: `Medium ${marker}`,
      enrollCount: 1,
    });
    const makeLessons = async (courseId: string, n: number) => {
      const unit = await db.unit.create({
        data: { courseId, order: 1, title: "U" },
      });
      for (let i = 1; i <= n; i++) {
        await db.lesson.create({
          data: {
            unitId: unit.id,
            order: i,
            title: `L${i}`,
            slug: `test-vitest-bl-${crypto.randomUUID()}`,
          },
        });
      }
    };
    await makeLessons(short.id, 2); // "short" bucket: 1–4 lessons
    await makeLessons(medium.id, 6); // "medium" bucket: 5–9 lessons

    const shortRes = await viewer.caller.marketplace.browse({
      q: marker,
      length: "short",
      limit: 48,
    });
    expect(shortRes.courses.map((c) => c.id)).toEqual([short.id]);
    expect(shortRes.nextCursor).toBeNull();

    const mediumRes = await viewer.caller.marketplace.browse({
      q: marker,
      length: "medium",
      limit: 48,
    });
    expect(mediumRes.courses.map((c) => c.id)).toEqual([medium.id]);
  });
});
