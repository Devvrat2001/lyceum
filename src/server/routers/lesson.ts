import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { bumpStreak } from "../services/streakEngine";

const XP_PER_CORRECT = 20;
const XP_HINT_PENALTY = 5;
const STREAK_BONUS_XP = 25;

export const lessonRouter = router({
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const lesson = await ctx.db.lesson.findUnique({
        where: { slug: input.slug },
        include: {
          unit: {
            select: {
              order: true,
              title: true,
              course: {
                select: {
                  slug: true,
                  title: true,
                  subject: true,
                  grade: true,
                  authorLabel: true,
                },
              },
            },
          },
          questions: { orderBy: { order: "asc" } },
          steps: { orderBy: { order: "asc" } },
          blocks: {
            orderBy: { order: "asc" },
            select: { id: true, type: true, order: true, settings: true },
          },
        },
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      return lesson;
    }),

  /**
   * Submit a question attempt. Idempotent per (user, question, attempt#).
   * Awards XP server-side.
   */
  attempt: protectedProcedure
    .input(
      z.object({
        questionId: z.string(),
        chosenKey: z.string(),
        hintsUsed: z.number().int().min(0).max(3).default(0),
        timeMs: z.number().int().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const q = await ctx.db.question.findUnique({
        where: { id: input.questionId },
      });
      if (!q) throw new TRPCError({ code: "NOT_FOUND" });

      const answers = q.answers as Array<{ key: string; correct: boolean }>;
      const correct = !!answers.find(
        (a) => a.key === input.chosenKey && a.correct
      );

      const points = correct
        ? Math.max(5, XP_PER_CORRECT - input.hintsUsed * XP_HINT_PENALTY)
        : 0;

      await ctx.db.attempt.create({
        data: {
          userId: ctx.user.id,
          lessonId: q.lessonId,
          questionId: q.id,
          chosenKey: input.chosenKey,
          correct,
          hintsUsed: input.hintsUsed,
          timeMs: input.timeMs,
        },
      });

      let bonusPoints = 0;
      let streakInfo: { current: number; milestone: number | null } | null = null;
      let badgeAwarded: string | null = null;

      if (points > 0) {
        await ctx.db.xPEvent.create({
          data: {
            userId: ctx.user.id,
            points,
            source: "quiz_correct",
            refId: q.id,
          },
        });

        // Streak: bump on first correct attempt of the day; award bonus XP
        // when crossing a milestone.
        const { current, milestoneHit } = await bumpStreak(
          ctx.db,
          ctx.user.id
        );
        streakInfo = { current, milestone: milestoneHit };

        if (milestoneHit) {
          bonusPoints = STREAK_BONUS_XP;
          await ctx.db.xPEvent.create({
            data: {
              userId: ctx.user.id,
              points: bonusPoints,
              source: "streak_bonus",
              refId: `day-${milestoneHit}`,
            },
          });

          // Award the corresponding badge if it exists.
          const badgeSlug =
            milestoneHit >= 7 && milestoneHit < 14
              ? "hot-streak"
              : milestoneHit >= 14
              ? "hot-streak"
              : null;
          if (badgeSlug) {
            const badge = await ctx.db.badge.findUnique({
              where: { slug: badgeSlug },
            });
            if (badge) {
              const existed = await ctx.db.userBadge.findUnique({
                where: {
                  userId_badgeId: {
                    userId: ctx.user.id,
                    badgeId: badge.id,
                  },
                },
              });
              if (!existed) {
                await ctx.db.userBadge.create({
                  data: { userId: ctx.user.id, badgeId: badge.id },
                });
                badgeAwarded = badge.name;

                // Surface the achievement as a notification.
                await ctx.db.notification.create({
                  data: {
                    userId: ctx.user.id,
                    kind: "badge_earned",
                    title: `🔥 ${badge.name} — ${milestoneHit} days`,
                    body: `You've practiced ${milestoneHit} days in a row.`,
                  },
                });
              }
            }
          }
        }
      }

      return {
        correct,
        points,
        bonusPoints,
        correctKey: answers.find((a) => a.correct)?.key ?? null,
        streak: streakInfo,
        badgeAwarded,
      };
    }),
});
