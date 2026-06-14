import type { PrismaClient } from "@prisma/client";

/**
 * Free-response XP, in one place so the submit award and the teacher
 * override (REQUIREMENTS R39) can never drift apart.
 *
 * Free-response has no hint mechanic, so a pass is a flat award —
 * `FREE_RESPONSE_XP` mirrors `xpForCorrect(0)` (= 20) in the lesson
 * router. `FREE_RESPONSE_PASS` is the 0-100 score at or above which the
 * answer counts as correct (and earns the XP).
 */
export const FREE_RESPONSE_XP = 20;
export const FREE_RESPONSE_PASS = 60;

/**
 * XPEvent.source values that carry free-response XP for a single
 * attempt: the original submit award and any later override delta.
 * Reconciliation sums across both so it's idempotent.
 */
const FR_AWARD_SOURCE = "block_free_response_correct";
const FR_OVERRIDE_SOURCE = "free_response_override";
const FR_SOURCES = [FR_AWARD_SOURCE, FR_OVERRIDE_SOURCE];

/**
 * Reconcile a student's free-response XP to the *authoritative* final
 * grade after a teacher override (R39).
 *
 * The submit path awards `FREE_RESPONSE_XP` iff the AI grade ≥
 * `FREE_RESPONSE_PASS`. When a teacher overrides that grade the ledger
 * must follow the human grade: an over-scored essay shouldn't keep XP
 * it didn't earn, and an under-scored one should get credit. We express
 * that as a single delta XPEvent (which may be negative) keyed to the
 * attempt, so the net free-response XP for the attempt always equals
 * the target.
 *
 * Keyed to the *attempt*, not the block: a block can be re-attempted,
 * so `block.id` isn't unique per submission. The submit award therefore
 * also stamps `refId = attempt.id`.
 *
 * Idempotent — re-runs (multiple overrides, or clearing the override
 * back to the AI grade) compute the delta from the current ledger and
 * never double-count.
 *
 * Deliberately does NOT touch streaks or badges: a student who
 * practiced still practiced that day, and a badge once earned isn't
 * clawed back by a later regrade. Only the points tied to this attempt
 * move.
 *
 * @returns the delta written (0 if already reconciled), so callers can
 *          decide whether to notify the student.
 */
export async function reconcileFreeResponseXp(
  db: PrismaClient,
  params: { attemptId: string; userId: string; finalScore: number }
): Promise<number> {
  const target =
    params.finalScore >= FREE_RESPONSE_PASS ? FREE_RESPONSE_XP : 0;

  const agg = await db.xPEvent.aggregate({
    where: {
      userId: params.userId,
      refId: params.attemptId,
      source: { in: FR_SOURCES },
    },
    _sum: { points: true },
  });
  const current = agg._sum.points ?? 0;
  const delta = target - current;
  if (delta === 0) return 0;

  await db.xPEvent.create({
    data: {
      userId: params.userId,
      points: delta,
      source: FR_OVERRIDE_SOURCE,
      refId: params.attemptId,
    },
  });
  return delta;
}
