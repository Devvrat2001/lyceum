/**
 * Rating-bucket → minimum `ratingAvg` mapping behind the marketplace
 * "Rating" filter. Pure + dependency-free; the router folds the floor it
 * returns straight into the Prisma `where` as a `{ ratingAvg: { gte } }`
 * clause (no candidate pool — rating is a plain column, unlike length).
 */
import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_RATING_BUCKETS,
  ratingMinFor,
} from "@/lib/marketplace";

/** Mirror of the router's predicate (`ratingAvg >= floor`), exercised here. */
function meetsThreshold(ratingAvg: number, slug: string | undefined): boolean {
  const min = ratingMinFor(slug);
  if (min === null) return true; // no filter → everything passes
  return ratingAvg >= min;
}

describe("ratingMinFor", () => {
  it("maps each bucket slug to its ratingAvg floor", () => {
    expect(ratingMinFor("45plus")).toBe(4.5);
    expect(ratingMinFor("40plus")).toBe(4);
    expect(ratingMinFor("35plus")).toBe(3.5);
    expect(ratingMinFor("30plus")).toBe(3);
  });

  it("returns null for unknown / missing slugs (no filtering)", () => {
    expect(ratingMinFor(undefined)).toBeNull();
    expect(ratingMinFor("")).toBeNull();
    expect(ratingMinFor("4.5")).toBeNull(); // dotted form is not a slug
    expect(ratingMinFor("50plus")).toBeNull(); // 5★ bucket doesn't exist
  });

  it("every published bucket value resolves to a floor", () => {
    for (const b of MARKETPLACE_RATING_BUCKETS) {
      expect(ratingMinFor(b.value)).not.toBeNull();
    }
  });
});

describe("threshold boundaries", () => {
  it("includes courses at exactly the floor and excludes those just under", () => {
    expect(meetsThreshold(4.5, "45plus")).toBe(true);
    expect(meetsThreshold(4.49, "45plus")).toBe(false);
    expect(meetsThreshold(4, "40plus")).toBe(true);
    expect(meetsThreshold(3.99, "40plus")).toBe(false);
    expect(meetsThreshold(5, "30plus")).toBe(true);
  });

  it("drops unrated courses (ratingAvg 0) from every threshold", () => {
    for (const b of MARKETPLACE_RATING_BUCKETS) {
      expect(meetsThreshold(0, b.value)).toBe(false);
    }
  });

  it("passes everything through when no bucket is selected", () => {
    expect(meetsThreshold(0, undefined)).toBe(true);
    expect(meetsThreshold(2.1, undefined)).toBe(true);
  });
});
