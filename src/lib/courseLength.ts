/**
 * Estimated time-to-complete for a course, derived from its curriculum.
 *
 * Buyers want a "how long is this?" signal on the course page, but
 * `Lesson.durationMin` is teacher-entered and usually left blank — so the
 * detail header showed nothing for most courses. This fills the gap: use the
 * teacher's per-lesson minutes where set, and fall back to a flat per-lesson
 * estimate otherwise, so *every* course gets a sensible number.
 *
 * `exact` reports whether every lesson carried a real duration (no fallback
 * used) — the UI shows a "~" only when the figure is partly estimated.
 *
 * Pure + dependency-free so it's unit-testable and usable from server
 * components (the course detail page) without a query change.
 */

/** Fallback minutes for a lesson with no teacher-set `durationMin`. */
export const DEFAULT_LESSON_MINUTES = 8;

type LessonLike = { durationMin?: number | null };
type UnitLike = { lessons: LessonLike[] };

export function estimateCourseMinutes(units: UnitLike[]): {
  minutes: number;
  exact: boolean;
} {
  let minutes = 0;
  let exact = true;
  for (const unit of units) {
    for (const lesson of unit.lessons) {
      if (typeof lesson.durationMin === "number" && lesson.durationMin > 0) {
        minutes += lesson.durationMin;
      } else {
        minutes += DEFAULT_LESSON_MINUTES;
        exact = false;
      }
    }
  }
  return { minutes, exact };
}

/** Human label: "—" (zero), "45 min", "1 hr", "3h 20m". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h}h ${m}m`;
}
