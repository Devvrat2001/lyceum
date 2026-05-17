import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { awardCorrectAttempt } from "../services/awardForAttempt";

/** Max poll options. Mirrors the inspector cap (2–6). */
const MAX_POLL_OPTIONS = 9;

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

  /**
   * Read the tallies for a POLL block. Public — anon visitors can see
   * the counts even when they can't vote, so the bars render
   * immediately on lesson load. `myChoice` is the current user's vote
   * index (null if not signed in or hasn't voted).
   */
  pollResults: publicProcedure
    .input(z.object({ blockId: z.string() }))
    .query(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
        select: { id: true, type: true, settings: true },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "POLL") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not a POLL",
        });
      }
      const settings = (block.settings ?? {}) as Record<string, unknown>;
      const options = Array.isArray(settings.options)
        ? (settings.options as unknown[]).filter(
            (o) => typeof o === "string"
          )
        : [];

      const tallies = new Array(options.length).fill(0) as number[];
      const groups = await ctx.db.blockVote.groupBy({
        by: ["chosenKey"],
        where: { blockId: block.id },
        _count: { chosenKey: true },
      });
      for (const g of groups) {
        const idx = parseInt(g.chosenKey, 10);
        if (Number.isFinite(idx) && idx >= 0 && idx < options.length) {
          tallies[idx] = g._count.chosenKey;
        }
      }
      const totalVotes = tallies.reduce((a, b) => a + b, 0);

      let myChoice: number | null = null;
      if (ctx.session?.user) {
        const mine = await ctx.db.blockVote.findUnique({
          where: {
            blockId_userId: {
              blockId: block.id,
              userId: ctx.session.user.id,
            },
          },
          select: { chosenKey: true },
        });
        if (mine) {
          const idx = parseInt(mine.chosenKey, 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < options.length) {
            myChoice = idx;
          }
        }
      }

      return { tallies, totalVotes, myChoice };
    }),

  /**
   * Cast / change a vote on a POLL block. Upserted so the same student
   * can change their mind. Returns the fresh tallies + their new
   * choice in the same shape as `pollResults` so the client can update
   * without a follow-up roundtrip.
   */
  votePoll: protectedProcedure
    .input(
      z.object({
        blockId: z.string(),
        chosenIndex: z.number().int().min(0).max(MAX_POLL_OPTIONS - 1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "POLL") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not a POLL",
        });
      }
      const settings = (block.settings ?? {}) as Record<string, unknown>;
      const options = Array.isArray(settings.options)
        ? (settings.options as unknown[]).filter(
            (o) => typeof o === "string"
          )
        : [];
      if (options.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Poll has no options yet",
        });
      }
      if (input.chosenIndex >= options.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chosen option out of range",
        });
      }

      const chosenKey = String(input.chosenIndex);
      await ctx.db.blockVote.upsert({
        where: {
          blockId_userId: {
            blockId: block.id,
            userId: ctx.user.id,
          },
        },
        create: {
          blockId: block.id,
          userId: ctx.user.id,
          chosenKey,
        },
        update: { chosenKey },
      });

      // Recompute tallies for the response. Same shape as pollResults.
      const tallies = new Array(options.length).fill(0) as number[];
      const groups = await ctx.db.blockVote.groupBy({
        by: ["chosenKey"],
        where: { blockId: block.id },
        _count: { chosenKey: true },
      });
      for (const g of groups) {
        const idx = parseInt(g.chosenKey, 10);
        if (Number.isFinite(idx) && idx >= 0 && idx < options.length) {
          tallies[idx] = g._count.chosenKey;
        }
      }
      const totalVotes = tallies.reduce((a, b) => a + b, 0);

      return { tallies, totalVotes, myChoice: input.chosenIndex };
    }),

  /**
   * Read the comment thread for a DISCUSSION block. Public — students
   * benefit from seeing classmates' takes even before they post their
   * own. Newest-last so the thread reads top-to-bottom like a chat.
   */
  discussionThread: publicProcedure
    .input(
      z.object({
        blockId: z.string(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
        select: { id: true, type: true },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "DISCUSSION") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not a DISCUSSION",
        });
      }
      const rows = await ctx.db.blockComment.findMany({
        where: { blockId: block.id },
        orderBy: { createdAt: "asc" },
        take: input.limit,
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, firstName: true, avatarUrl: true },
          },
        },
      });
      return {
        comments: rows.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          author: {
            id: c.user.id,
            // Prefer first name for the avatar-style row; full name only if first is missing.
            name: c.user.firstName ?? c.user.name ?? "Student",
            avatarUrl: c.user.avatarUrl,
          },
          // Surface "is this my comment?" so the UI can subtly highlight
          // the viewer's own posts without leaking other users' ids.
          isMine: ctx.session?.user?.id === c.user.id,
        })),
        total: rows.length,
      };
    }),

  /**
   * Post a comment to a DISCUSSION block. Body is trimmed + capped at
   * 2 000 chars (lesson-thread scale, not full essays). Returns the
   * fresh thread so the client can update without a refetch.
   */
  postComment: protectedProcedure
    .input(
      z.object({
        blockId: z.string(),
        body: z.string().trim().min(1).max(2_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
        select: { id: true, type: true },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "DISCUSSION") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not a DISCUSSION",
        });
      }
      await ctx.db.blockComment.create({
        data: {
          blockId: block.id,
          userId: ctx.user.id,
          body: input.body,
        },
      });
      // Return the fresh thread so the reader updates without a
      // follow-up roundtrip.
      const rows = await ctx.db.blockComment.findMany({
        where: { blockId: block.id },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, firstName: true, avatarUrl: true },
          },
        },
      });
      return {
        comments: rows.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          author: {
            id: c.user.id,
            name: c.user.firstName ?? c.user.name ?? "Student",
            avatarUrl: c.user.avatarUrl,
          },
          isMine: ctx.user.id === c.user.id,
        })),
        total: rows.length,
      };
    }),
});
