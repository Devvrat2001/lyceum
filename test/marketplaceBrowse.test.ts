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
});
