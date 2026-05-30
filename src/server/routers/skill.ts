import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { CLAUDE_MODEL, getClaude, isClaudeEnabled } from "@/lib/ai/claude";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";
import {
  computeSkillStates,
  MASTERY_THRESHOLD,
} from "../services/skillProgress";

export const skillRouter = router({
  /**
   * Skill graph for the signed-in user.
   * Computes per-node state from Mastery levels + prerequisite edges.
   *
   * State rules (Phase 1):
   *  - done       : user.mastery >= 0.8
   *  - now        : 0 < user.mastery < 0.8 (started but not mastered)
   *  - unlocked   : all prerequisites are "done" but user hasn't started
   *  - locked     : at least one prerequisite is not "done"
   */
  tree: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const [skills, edges, mastery] = await Promise.all([
        ctx.db.skill.findMany({
          orderBy: [{ col: "asc" }, { row: "asc" }],
        }),
        ctx.db.skillEdge.findMany(),
        ctx.db.mastery.findMany({ where: { userId: ctx.user.id } }),
      ]);

      const masteryById = new Map(
        mastery.map((m) => [m.skillId, m.level] as const)
      );
      const { stateOf, currentId: current } = computeSkillStates(
        skills,
        edges,
        masteryById
      );
      const masteredCount = skills.filter(
        (s) => stateOf(s.id) === "done"
      ).length;

      const xpTotal =
        (
          await ctx.db.xPEvent.aggregate({
            where: { userId: ctx.user.id },
            _sum: { points: true },
          })
        )._sum.points ?? 0;
      const streak = await ctx.db.streak.findUnique({
        where: { userId: ctx.user.id },
      });

      return {
        nodes: skills.map((s) => ({
          id: s.id,
          slug: s.slug,
          title: s.title,
          col: s.col,
          row: s.row,
          isBoss: s.isBoss,
          state: stateOf(s.id),
          current: s.id === current,
          masteryPct: Math.round((masteryById.get(s.id) ?? 0) * 100),
        })),
        edges: edges.map((e) => ({ fromId: e.fromId, toId: e.toId })),
        stats: {
          mastered: masteredCount,
          total: skills.length,
          level: Math.max(1, 1 + Math.floor(xpTotal / 350)),
          streak: streak?.current ?? 0,
          progressToNextPct: Math.round(((xpTotal % 350) / 350) * 100),
        },
      };
    }),

  /**
   * "Why this path?" — natural-language explanation of why the skill
   * tree's current "up next" choice makes sense for this student.
   */
  whyThisPath: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const t0 = Date.now();
      const [skills, mastery, recentAttempts] = await Promise.all([
        ctx.db.skill.findMany({
          orderBy: [{ col: "asc" }, { row: "asc" }],
        }),
        ctx.db.mastery.findMany({ where: { userId: ctx.user.id } }),
        ctx.db.attempt.findMany({
          where: { userId: ctx.user.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            lesson: { select: { title: true } },
          },
        }),
      ]);

      const masteredCount = mastery.filter(
        (m) => m.level >= MASTERY_THRESHOLD
      ).length;
      const inProgress = mastery.filter(
        (m) => m.level > 0 && m.level < MASTERY_THRESHOLD
      );
      const correctRate =
        recentAttempts.length === 0
          ? null
          : Math.round(
              (recentAttempts.filter((a) => a.correct).length /
                recentAttempts.length) *
                100
            );

      const inProgressTitles = inProgress
        .map((m) => skills.find((s) => s.id === m.skillId)?.title)
        .filter(Boolean)
        .slice(0, 3);

      if (isClaudeEnabled()) {
        const client = getClaude()!;
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 350,
          system:
            "You are the Lyceum AI tutor. In 2-3 plain-English sentences, explain to a K-12 student why their personalized skill path is sequenced the way it is. Friendly, no jargon, no markdown. Reference what they've mastered + what they're working on.",
          messages: [
            {
              role: "user",
              content: `Skills mastered: ${masteredCount} of ${skills.length}.\nIn progress right now: ${inProgressTitles.join(", ") || "(none yet)"}.\nRecent quiz accuracy (last ${recentAttempts.length} attempts): ${correctRate ?? "no data"}%.\n\nWrite a short paragraph explaining why the path is laid out this way for them.`,
            },
          ],
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim();
        await audit({
          actorId: ctx.user.id,
          kind: "ai.why_path",
          payload: {
            masteredCount,
            inProgressCount: inProgress.length,
            correctRate,
            mode: "claude",
            elapsedMs: Date.now() - t0,
          },
        });
        return { explanation: text, elapsedMs: Date.now() - t0 };
      }

      // Demo fallback.
      const lines = [
        `You've mastered ${masteredCount} of ${skills.length} skills so far — strong start.`,
        inProgressTitles.length
          ? `Right now we're focused on ${inProgressTitles.join(" and ")} because those are partly there but haven't clicked all the way yet.`
          : "We've staged the next skill on what your earlier lessons set you up for.",
        correctRate !== null && correctRate >= 70
          ? "Your recent quiz accuracy has been solid, so the path keeps the pace up rather than backtracking."
          : "Your recent quizzes show a few gaps, so the path slows down before the trickier skills.",
      ];
      await audit({
        actorId: ctx.user.id,
        kind: "ai.why_path",
        payload: {
          masteredCount,
          inProgressCount: inProgress.length,
          correctRate,
          mode: "demo",
          elapsedMs: Date.now() - t0,
        },
      });
      return { explanation: lines.join(" "), elapsedMs: Date.now() - t0 };
    }),
});
