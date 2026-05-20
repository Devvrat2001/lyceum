/**
 * Pure-function smoke for the adaptive AI_QUIZ regeneration helper
 * (Tier 4.3). No DB, no tRPC — just the math: take prior questions +
 * raw attempts, return per-question weak-spot stats above the noise
 * floor. Regression here = the regenerate path silently stops adapting.
 */
import { describe, expect, it } from "vitest";
import {
  computeWeakSpots,
  WEAK_SPOT_MIN_SAMPLE_SIZE,
  WEAK_SPOT_THRESHOLD,
} from "@/lib/ai/prompts/questionGenerator";

const Q = [
  { stem: "Q0: easy" },
  { stem: "Q1: medium" },
  { stem: "Q2: hard" },
];

/** Build n attempt rows on subIdx, with `correctCount` of them correct. */
function attemptsFor(
  subIdx: number,
  total: number,
  correctCount: number
): Array<{ chosenKey: string | null; correct: boolean }> {
  return Array.from({ length: total }, (_, i) => ({
    chosenKey: `${subIdx}:${i % 4}`,
    correct: i < correctCount,
  }));
}

describe("computeWeakSpots", () => {
  it("returns [] when no questions have any attempts", () => {
    expect(computeWeakSpots(Q, [])).toEqual([]);
  });

  it("returns [] when every question is above the threshold", () => {
    const attempts = [
      ...attemptsFor(0, 10, 9), // 90% correct
      ...attemptsFor(1, 5, 4), // 80% correct
      ...attemptsFor(2, 4, 3), // 75% correct
    ];
    expect(computeWeakSpots(Q, attempts)).toEqual([]);
  });

  it("flags a question whose pctCorrect is below the threshold", () => {
    const attempts = [
      ...attemptsFor(0, 8, 7), // 87% — strong
      ...attemptsFor(1, 8, 3), // 37% — weak
    ];
    const out = computeWeakSpots(Q, attempts);
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe("Q1: medium");
    expect(out[0].sampleSize).toBe(8);
    expect(out[0].pctCorrect).toBeCloseTo(3 / 8);
  });

  it("ignores questions below MIN_SAMPLE_SIZE (noise floor)", () => {
    // 1/2 = 50% which is below threshold, but n=2 is below noise floor.
    const attempts = attemptsFor(0, WEAK_SPOT_MIN_SAMPLE_SIZE - 1, 0);
    expect(computeWeakSpots(Q, attempts)).toEqual([]);
  });

  it("respects WEAK_SPOT_THRESHOLD boundary (>= is strong, < is weak)", () => {
    // Build attempts that land exactly on the threshold.
    const total = 10;
    const correctAtBoundary = Math.round(WEAK_SPOT_THRESHOLD * total);
    const atBoundary = attemptsFor(0, total, correctAtBoundary);
    const oneBelow = attemptsFor(1, total, correctAtBoundary - 1);
    const out = computeWeakSpots(Q, [...atBoundary, ...oneBelow]);
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe(Q[1].stem);
  });

  it("skips null chosenKey rows (legacy Question-based attempts)", () => {
    const attempts = [
      { chosenKey: null, correct: false },
      { chosenKey: null, correct: false },
      ...attemptsFor(0, 3, 0), // 0% correct, n=3 — clearly weak
    ];
    const out = computeWeakSpots(Q, attempts);
    expect(out).toHaveLength(1);
    expect(out[0].sampleSize).toBe(3);
  });

  it("skips malformed chosenKey rows (no colon)", () => {
    const attempts = [
      { chosenKey: "A", correct: false }, // legacy lettered key
      { chosenKey: "0", correct: false }, // legacy single-number key
      { chosenKey: "drag:3/5", correct: false }, // DRAG_MATCH encoding
      // These all parse to subIdx 0, 0, "drag" — only "drag:..." matches
      // the colon test but parseInt("drag") = NaN so the row is skipped.
      ...attemptsFor(1, 4, 0), // genuine subIdx 1, all wrong
    ];
    const out = computeWeakSpots(Q, attempts);
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe(Q[1].stem);
  });

  it("preserves question order in the output", () => {
    const attempts = [
      ...attemptsFor(0, 5, 1), // weak
      ...attemptsFor(2, 5, 1), // weak
      // skip 1 — no attempts
    ];
    const out = computeWeakSpots(Q, attempts);
    expect(out.map((w) => w.stem)).toEqual([Q[0].stem, Q[2].stem]);
  });
});
