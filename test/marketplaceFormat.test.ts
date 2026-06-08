/**
 * Format-bucket guard behind the marketplace "Format" filter. `Course.format`
 * is a plain column, so the slug IS the stored value — the router only needs
 * to guard a raw URL value before folding `{ format: slug }` into the `where`.
 * Pure + dependency-free.
 */
import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_FORMAT_BUCKETS,
  isMarketplaceFormat,
} from "@/lib/marketplace";

/** Mirror of the router's predicate (`format === slug`), exercised here. */
function meetsFormat(courseFormat: string, slug: string | undefined): boolean {
  if (!isMarketplaceFormat(slug)) return true; // junk / missing → no filter
  return courseFormat === slug;
}

describe("isMarketplaceFormat", () => {
  it("accepts every published bucket value", () => {
    for (const b of MARKETPLACE_FORMAT_BUCKETS) {
      expect(isMarketplaceFormat(b.value)).toBe(true);
    }
  });

  it("rejects unknown / missing values", () => {
    expect(isMarketplaceFormat(undefined)).toBe(false);
    expect(isMarketplaceFormat("")).toBe(false);
    expect(isMarketplaceFormat("hybrid")).toBe(false);
    expect(isMarketplaceFormat("Self-paced")).toBe(false); // label, not slug
  });
});

describe("format predicate", () => {
  it("matches only the selected format", () => {
    expect(meetsFormat("self_paced", "self_paced")).toBe(true);
    expect(meetsFormat("live", "self_paced")).toBe(false);
    expect(meetsFormat("cohort", "cohort")).toBe(true);
  });

  it("passes everything through for a junk / missing slug", () => {
    expect(meetsFormat("live", undefined)).toBe(true);
    expect(meetsFormat("self_paced", "hybrid")).toBe(true);
  });
});
