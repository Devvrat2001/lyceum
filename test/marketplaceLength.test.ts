/**
 * Length-bucket → lesson-count range mapping behind the marketplace
 * "Length" filter. Pure + dependency-free; the router applies the range as
 * an aggregate post-filter over a candidate pool.
 */
import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_LENGTH_BUCKETS,
  lengthRangeFor,
} from "@/lib/marketplace";

/** Mirror of the router's predicate, exercised directly here. */
function inBucket(lessonCount: number, slug: string | undefined): boolean {
  const r = lengthRangeFor(slug);
  if (!r) return true; // no filter → everything passes
  return lessonCount >= r.min && lessonCount <= r.max;
}

describe("lengthRangeFor", () => {
  it("maps each bucket slug to an inclusive range", () => {
    expect(lengthRangeFor("short")).toEqual({ min: 1, max: 4 });
    expect(lengthRangeFor("medium")).toEqual({ min: 5, max: 9 });
    expect(lengthRangeFor("long")?.min).toBe(10);
  });

  it("returns null for unknown / missing slugs (no filtering)", () => {
    expect(lengthRangeFor(undefined)).toBeNull();
    expect(lengthRangeFor("")).toBeNull();
    expect(lengthRangeFor("medium-ish")).toBeNull();
  });

  it("every published bucket value resolves to a range", () => {
    for (const b of MARKETPLACE_LENGTH_BUCKETS) {
      expect(lengthRangeFor(b.value)).not.toBeNull();
    }
  });
});

describe("bucket boundaries", () => {
  it("classifies counts at the edges correctly", () => {
    expect(inBucket(4, "short")).toBe(true);
    expect(inBucket(5, "short")).toBe(false);
    expect(inBucket(5, "medium")).toBe(true);
    expect(inBucket(9, "medium")).toBe(true);
    expect(inBucket(10, "medium")).toBe(false);
    expect(inBucket(10, "long")).toBe(true);
    expect(inBucket(250, "long")).toBe(true);
  });

  it("passes everything through when no bucket is selected", () => {
    expect(inBucket(0, undefined)).toBe(true);
    expect(inBucket(99, undefined)).toBe(true);
  });
});
