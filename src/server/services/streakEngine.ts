import type { PrismaClient } from "@prisma/client";

/**
 * Streak engine.
 *
 * Bump on every meaningful "did something today" event (correct attempt,
 * lesson completion, etc.). Idempotent — calling twice in the same day
 * doesn't double-count.
 *
 * Returns the new streak record + whether a milestone was just hit.
 */
export async function bumpStreak(
  db: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<{
  current: number;
  longest: number;
  milestoneHit: number | null; // 7 / 14 / 30 / 60 / 100 if just crossed
}> {
  // Day boundary at user's local midnight is a Phase-2 problem;
  // for now treat UTC date as the canonical "day".
  const today = startOfDayUTC(now);

  const existing = await db.streak.findUnique({ where: { userId } });

  if (!existing) {
    const created = await db.streak.create({
      data: { userId, current: 1, longest: 1, lastDay: today },
    });
    return { current: created.current, longest: created.longest, milestoneHit: 1 };
  }

  const last = existing.lastDay ? startOfDayUTC(existing.lastDay) : null;
  const dayDiff = last
    ? Math.round((today.getTime() - last.getTime()) / 86_400_000)
    : Infinity;

  let current = existing.current;
  if (dayDiff === 0) {
    // Already counted today.
    return {
      current: existing.current,
      longest: existing.longest,
      milestoneHit: null,
    };
  } else if (dayDiff === 1) {
    current = existing.current + 1;
  } else {
    // Missed at least a full day → reset.
    current = 1;
  }
  const longest = Math.max(existing.longest, current);

  await db.streak.update({
    where: { userId },
    data: { current, longest, lastDay: today },
  });

  const MILESTONES = [7, 14, 30, 60, 100];
  const milestoneHit = MILESTONES.find((m) => m === current) ?? null;

  return { current, longest, milestoneHit };
}

function startOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}
