import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { awardCorrectAttempt } from "../services/awardForAttempt";

const XP_PER_CORRECT = 20;
const XP_HINT_PENALTY = 5;

/** Minimum XP awarded for a correct answer (after hint penalties). */
const XP_FLOOR = 5;

function xpForCorrect(hintsUsed: number): number {
  return Math.max(XP_FLOOR, XP_PER_CORRECT - hintsUsed * XP_HINT_PENALTY);
}

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
   * Submit a Question-based attempt. Awards XP server-side; bumps
   * streak / awards milestone bonuses + badges via the shared
   * `awardCorrectAttempt` helper.
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
      const correct = answers.some(
        (a) => a.key === input.chosenKey && a.correct
      );
      const points = correct ? xpForCorrect(input.hintsUsed) : 0;

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

      const award =
        points > 0
          ? await awardCorrectAttempt(
              ctx.db,
              ctx.user.id,
              points,
              "quiz_correct",
              q.id
            )
          : null;

      return {
        correct,
        points,
        bonusPoints: award?.bonusPoints ?? 0,
        correctKey: answers.find((a) => a.correct)?.key ?? null,
        streak: award?.streak ?? null,
        badgeAwarded: award?.badgeAwarded ?? null,
      };
    }),

  /**
   * Submit a Block-based MCQ attempt. Block.settings.options is a
   * positional array (no per-option `key`), so we identify the choice
   * by index. Same XP/streak/badge pipeline as `attempt`.
   */
  attemptBlock: protectedProcedure
    .input(
      z.object({
        blockId: z.string(),
        chosenIndex: z.number().int().min(0).max(9),
        hintsUsed: z.number().int().min(0).max(3).default(0),
        timeMs: z.number().int().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "MCQ") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not an MCQ",
        });
      }

      const settings = (block.settings ?? {}) as Record<string, unknown>;
      const rawOptions = Array.isArray(settings.options) ? settings.options : [];
      const options = rawOptions.filter(
        (o): o is { text: string; correct: boolean } =>
          o !== null &&
          typeof o === "object" &&
          typeof (o as { text?: unknown }).text === "string" &&
          typeof (o as { correct?: unknown }).correct === "boolean"
      );

      if (options.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not yet a valid MCQ (needs ≥2 options)",
        });
      }
      if (input.chosenIndex >= options.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chosen option out of range",
        });
      }

      const chosen = options[input.chosenIndex];
      const correct = chosen.correct;
      const correctIndex = options.findIndex((o) => o.correct);
      const points = correct ? xpForCorrect(input.hintsUsed) : 0;

      await ctx.db.attempt.create({
        data: {
          userId: ctx.user.id,
          lessonId: block.lessonId,
          blockId: block.id,
          // We store the index as a string so the existing `chosenKey`
          // column can hold either lettered keys (Question MCQs) or
          // numeric indices (Block MCQs) without a schema change.
          chosenKey: String(input.chosenIndex),
          correct,
          hintsUsed: input.hintsUsed,
          timeMs: input.timeMs,
        },
      });

      const award =
        points > 0
          ? await awardCorrectAttempt(
              ctx.db,
              ctx.user.id,
              points,
              "block_mcq_correct",
              block.id
            )
          : null;

      return {
        correct,
        points,
        bonusPoints: award?.bonusPoints ?? 0,
        correctIndex,
        streak: award?.streak ?? null,
        badgeAwarded: award?.badgeAwarded ?? null,
      };
    }),
});
