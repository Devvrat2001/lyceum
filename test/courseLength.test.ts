/**
 * Pure estimator behind the course-detail "estimated time to complete"
 * badge — no DB, no network. Covers the teacher-set / fallback / mixed
 * paths and the `exact` flag the UI uses to decide whether to prefix "~".
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LESSON_MINUTES,
  estimateCourseMinutes,
  formatDuration,
} from "@/lib/courseLength";

describe("estimateCourseMinutes", () => {
  it("sums teacher-set durations and reports exact", () => {
    const res = estimateCourseMinutes([
      { lessons: [{ durationMin: 10 }, { durationMin: 20 }] },
      { lessons: [{ durationMin: 15 }] },
    ]);
    expect(res).toEqual({ minutes: 45, exact: true });
  });

  it("falls back to the per-lesson default when a duration is missing", () => {
    const res = estimateCourseMinutes([
      { lessons: [{ durationMin: 30 }, { durationMin: null }, {}] },
    ]);
    expect(res.minutes).toBe(30 + DEFAULT_LESSON_MINUTES * 2);
    expect(res.exact).toBe(false);
  });

  it("treats zero / negative durations as unset (fallback)", () => {
    const res = estimateCourseMinutes([
      { lessons: [{ durationMin: 0 }, { durationMin: -5 }] },
    ]);
    expect(res.minutes).toBe(DEFAULT_LESSON_MINUTES * 2);
    expect(res.exact).toBe(false);
  });

  it("estimates purely from lesson count when nothing is set", () => {
    const res = estimateCourseMinutes([
      { lessons: [{}, {}, {}] },
      { lessons: [{}] },
    ]);
    expect(res).toEqual({ minutes: DEFAULT_LESSON_MINUTES * 4, exact: false });
  });

  it("is zero/exact for a course with no lessons", () => {
    expect(estimateCourseMinutes([])).toEqual({ minutes: 0, exact: true });
    expect(estimateCourseMinutes([{ lessons: [] }])).toEqual({
      minutes: 0,
      exact: true,
    });
  });
});

describe("formatDuration", () => {
  it("formats minutes, hours, and mixed", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(200)).toBe("3h 20m");
  });

  it("renders the dash for non-positive input", () => {
    expect(formatDuration(-10)).toBe("—");
  });
});
