/**
 * Denormalized-counter honesty — the rating columns every marketplace
 * surface displays must be derivable from real Review rows. This is
 * the regression guard for the "612 ratings backed by 2 rows" class of
 * seed vanity: if any code path (seed included) hand-stamps numbers
 * the rows don't support, this fails. Runs against the seeded DB in CI
 * and the shared dev DB locally.
 */
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("rating columns are honest", () => {
  it("every published course's ratingAvg/ratingCount match its Review rows", async () => {
    const courses = await db.course.findMany({
      where: {
        status: "PUBLISHED",
        // Vitest fixtures hand-set ratingAvg to drive filter tests and
        // may coexist in the DB mid-run — they're out of scope here.
        NOT: { slug: { startsWith: "test-vitest" } },
      },
      select: { id: true, slug: true, ratingAvg: true, ratingCount: true },
    });
    expect(courses.length).toBeGreaterThan(0);

    for (const c of courses) {
      const agg = await db.review.aggregate({
        where: { courseId: c.id },
        _avg: { rating: true },
        _count: true,
      });
      expect.soft(c.ratingCount, `${c.slug} ratingCount`).toBe(agg._count);
      expect
        .soft(c.ratingAvg, `${c.slug} ratingAvg`)
        .toBeCloseTo(agg._avg.rating ?? 0, 5);
    }
  });
});
