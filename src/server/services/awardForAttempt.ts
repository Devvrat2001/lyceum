import type { PrismaClient } from "@prisma/client";
import { bumpStreak } from "./streakEngine";
import { nudgeCurrentSkill } from "./skillProgress";

const STREAK_BONUS_XP = 25;

/**
 * Award XP + run the streak/milestone/badge pipeline for a correct
 * student attempt. Shared by `lesson.attempt` (Question-based) and
 * `lesson.attemptBlock` (Block-based MCQ).
 *
 * Pure side-effect helper — caller has already written the `Attempt`
 * row and decided the answer was correct.
 *
 * @param points        Base XP to award for the correct answer.
 * @param source        Stable string for the XPEvent.source column.
 *                      e.g. "quiz_correct" or "block_mcq_correct".
 * @param refId         The id of the thing being attempted
 *                      (questionId or blockId).
 */
export async function awardCorrectAttempt(
  db: PrismaClient,
  userId: string,
  points: number,
  source: string,
  refId: string
): Promise<{
  bonusPoints: number;
  streak: { current: number; milestone: number | null };
  badgeAwarded: string | null;
}> {
  await db.xPEvent.create({
    data: { userId, points, source, refId },
  });

  // Advance the student's current skill-tree node. Best-effort: a
  // skill-progress hiccup must never break the XP/streak/badge award.
  try {
    await nudgeCurrentSkill(db, userId);
  } catch (err) {
    console.error("[skillProgress] nudge failed", err);
  }

  const { current, milestoneHit } = await bumpStreak(db, userId);
  const streak = { current, milestone: milestoneHit };

  let bonusPoints = 0;
  let badgeAwarded: string | null = null;

  if (milestoneHit) {
    bonusPoints = STREAK_BONUS_XP;
    await db.xPEvent.create({
      data: {
        userId,
        points: bonusPoints,
        source: "streak_bonus",
        refId: `day-${milestoneHit}`,
      },
    });

    // Single badge for any milestone ≥ 7. When richer milestones get
    // their own badges, branch here.
    const badgeSlug = milestoneHit >= 7 ? "hot-streak" : null;
    if (badgeSlug) {
      const badge = await db.badge.findUnique({ where: { slug: badgeSlug } });
      if (badge) {
        const existed = await db.userBadge.findUnique({
          where: { userId_badgeId: { userId, badgeId: badge.id } },
        });
        if (!existed) {
          await db.userBadge.create({
            data: { userId, badgeId: badge.id },
          });
          badgeAwarded = badge.name;

          await db.notification.create({
            data: {
              userId,
              kind: "badge_earned",
              title: `🔥 ${badge.name} — ${milestoneHit} days`,
              body: `You've practiced ${milestoneHit} days in a row.`,
            },
          });
        }
      }
    }
  }

  return { bonusPoints, streak, badgeAwarded };
}
