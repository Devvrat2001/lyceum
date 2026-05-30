import type { PrismaClient } from "@prisma/client";

/** Mastery at/above this level counts a skill as "done". */
export const MASTERY_THRESHOLD = 0.8;

/**
 * Mastery gained on each correct attempt, applied to the student's
 * *current* path skill. Tuned so a fresh skill masters in ~8 correct
 * answers (0 → 0.8) and an in-progress one advances visibly each time.
 * Adjust to retune pacing.
 */
export const MASTERY_STEP_PER_CORRECT = 0.1;

export type NodeState = "done" | "now" | "unlocked" | "locked";

type SkillLike = { id: string };
type EdgeLike = { fromId: string; toId: string };

/**
 * Compute each skill's state from mastery levels + prerequisite edges,
 * and pick the "current" node — the highest-progress skill that isn't
 * done yet and whose prerequisites are all met.
 *
 * Pure + shared: both the `skill.tree` query and the progression engine
 * call this so they always agree on what "current" means (the engine
 * advances exactly the node the tree highlights as "Up next").
 *
 * State rules:
 *  - done     : mastery >= MASTERY_THRESHOLD
 *  - now      : 0 < mastery < MASTERY_THRESHOLD (started, not mastered)
 *  - unlocked : not started, but every prerequisite is done
 *  - locked   : at least one prerequisite is not done
 */
export function computeSkillStates(
  skills: SkillLike[],
  edges: EdgeLike[],
  masteryById: Map<string, number>
): { stateOf: (skillId: string) => NodeState; currentId: string | null } {
  const prereqsByTo = new Map<string, string[]>();
  for (const e of edges) {
    const list = prereqsByTo.get(e.toId) ?? [];
    list.push(e.fromId);
    prereqsByTo.set(e.toId, list);
  }

  const stateOf = (skillId: string): NodeState => {
    const level = masteryById.get(skillId) ?? 0;
    if (level >= MASTERY_THRESHOLD) return "done";
    if (level > 0) return "now";
    const prereqs = prereqsByTo.get(skillId) ?? [];
    const allPrereqsDone = prereqs.every(
      (pid) => (masteryById.get(pid) ?? 0) >= MASTERY_THRESHOLD
    );
    if (prereqs.length === 0 || allPrereqsDone) return "unlocked";
    return "locked";
  };

  const candidates = skills.filter((s) => {
    const st = stateOf(s.id);
    return st === "now" || st === "unlocked";
  });
  const currentId =
    candidates.sort(
      (a, b) => (masteryById.get(b.id) ?? 0) - (masteryById.get(a.id) ?? 0)
    )[0]?.id ?? null;

  return { stateOf, currentId };
}

/**
 * Advance the student's current path skill by `step` (clamped to 1.0)
 * after a correct attempt. This is what turns the skill tree from a
 * static visualization into a real progression: as a student answers
 * questions correctly, their next-up skill climbs toward mastery, and
 * once it crosses the threshold the following skill unlocks.
 *
 * Attribution note: with no Skill↔content mapping in the schema yet,
 * "current" (the next path node) is the best proxy for which skill a
 * correct answer should advance. A real per-lesson skill mapping is
 * future work; until then progress accrues to the path's next skill.
 *
 * Returns the affected skill, or null when there's nothing to advance
 * (no skills seeded, all mastered, or current already maxed). Callers
 * treat this as best-effort so a hiccup never breaks XP/streak.
 */
export async function nudgeCurrentSkill(
  db: PrismaClient,
  userId: string,
  step: number = MASTERY_STEP_PER_CORRECT
): Promise<{
  skillId: string;
  title: string;
  newLevel: number;
  newlyMastered: boolean;
} | null> {
  const [skills, edges, mastery] = await Promise.all([
    db.skill.findMany({ select: { id: true, title: true } }),
    db.skillEdge.findMany({ select: { fromId: true, toId: true } }),
    db.mastery.findMany({
      where: { userId },
      select: { skillId: true, level: true },
    }),
  ]);
  if (skills.length === 0) return null;

  const masteryById = new Map(
    mastery.map((m) => [m.skillId, m.level] as const)
  );
  const { currentId } = computeSkillStates(skills, edges, masteryById);
  if (!currentId) return null;

  const current = skills.find((s) => s.id === currentId)!;
  const prev = masteryById.get(currentId) ?? 0;
  if (prev >= 1) return null;

  // Round to avoid float drift accumulating across many small steps.
  const newLevel = Math.min(1, Math.round((prev + step) * 1000) / 1000);

  await db.mastery.upsert({
    where: { userId_skillId: { userId, skillId: currentId } },
    update: { level: newLevel },
    create: { userId, skillId: currentId, level: newLevel },
  });

  const newlyMastered =
    prev < MASTERY_THRESHOLD && newLevel >= MASTERY_THRESHOLD;
  if (newlyMastered) {
    await db.notification.create({
      data: {
        userId,
        kind: "skill_mastered",
        title: `Skill mastered — ${current.title}`,
        body: `You reached mastery on ${current.title}. The next skill on your path is unlocked.`,
      },
    });
  }

  return { skillId: currentId, title: current.title, newLevel, newlyMastered };
}
