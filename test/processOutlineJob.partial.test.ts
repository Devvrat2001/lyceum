/**
 * `validatePartialOutline` — the S1-2 hardening. The AI course generator
 * reads a persisted `partial` Outline blob at the start of every chunk
 * run; a drifted or half-written blob used to crash deep at
 * `partial.units[unitIdx]`. Now it's validated structurally and fails the
 * job cleanly.
 *
 * Critically, the validation is LENIENT on purpose: the partial holds
 * sub-120-char placeholder readings between chunks, so reusing the strict
 * OutlineSchema would reject a perfectly valid in-flight blob. These tests
 * pin that contract: real in-flight shapes pass, malformed ones fail.
 */
import { describe, expect, it } from "vitest";
import { validatePartialOutline } from "@/lib/jobs/processOutlineJob";

// The exact placeholder advanceAfterSkeleton writes (110 chars — below
// OutlineSchema's readingContent.min(120), which is the whole point).
const PLACEHOLDER =
  "(reading not yet generated — the next chunk will replace this with a real 80-180 word reading for this lesson)";

function validPartial() {
  return {
    title: "Algebra · Grade 6",
    tagline: "A friendly intro to variables.",
    description: "Two units of gentle algebra.",
    units: [
      {
        shortLabel: "Unit 1",
        title: "Foundations",
        subtitle: "Start with the basics.",
        durationLabel: "1.5 hr",
        lessons: [
          { title: "Warm up", summary: "Meet variables.", readingContent: PLACEHOLDER },
          { title: "Practice", summary: "Use them.", readingContent: PLACEHOLDER },
        ],
      },
    ],
  };
}

describe("validatePartialOutline", () => {
  it("accepts a skeleton-shaped partial with sub-120 placeholder readings", () => {
    expect(PLACEHOLDER.length).toBeLessThan(120); // the real in-flight state
    const out = validatePartialOutline(validPartial());
    expect(out).not.toBeNull();
    expect(out?.units[0].lessons[0].readingContent).toBe(PLACEHOLDER);
  });

  it("returns the ORIGINAL object so accumulated blocks survive", () => {
    const base = validPartial();
    const withBlocks = {
      ...base,
      units: base.units.map((u, i) =>
        i === 0
          ? {
              ...u,
              lessons: u.lessons.map((l, j) =>
                j === 0
                  ? { ...l, blocks: [{ type: "READING", body: "real content" }] }
                  : l
              ),
            }
          : u
      ),
    };
    const out = validatePartialOutline(withBlocks);
    // Identity: we return the input untouched (not a stripped Zod copy),
    // so already-filled `blocks` are preserved across chunks.
    expect(out).toBe(withBlocks);
  });

  it("rejects null / undefined", () => {
    expect(validatePartialOutline(null)).toBeNull();
    expect(validatePartialOutline(undefined)).toBeNull();
  });

  it("rejects a blob missing units", () => {
    expect(
      validatePartialOutline({ title: "x", tagline: "y", description: "z" })
    ).toBeNull();
  });

  it("rejects units that isn't an array", () => {
    expect(
      validatePartialOutline({
        title: "x",
        tagline: "y",
        description: "z",
        units: "nope",
      })
    ).toBeNull();
  });

  it("rejects an empty units array", () => {
    expect(
      validatePartialOutline({
        title: "x",
        tagline: "y",
        description: "z",
        units: [],
      })
    ).toBeNull();
  });

  it("rejects a unit missing its lessons array", () => {
    expect(
      validatePartialOutline({
        title: "x",
        tagline: "y",
        description: "z",
        units: [
          { shortLabel: "U1", title: "T", subtitle: "S", durationLabel: "1 hr" },
        ],
      })
    ).toBeNull();
  });
});
