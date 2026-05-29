import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { awardCorrectAttempt } from "../services/awardForAttempt";
import { settingsFor } from "@/lib/blocks";

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
   * Submit a Block-based MCQ-style attempt. Supports three block
   * types with the same XP / streak / badge pipeline:
   *
   *  - MCQ        — single-question block, `subIndex` absent
   *  - AI_QUIZ    — N-question deck, `subIndex` is the question
   *                 position within `settings.generated.questions`
   *  - QUIZ       — N-question deck, `subIndex` is the question
   *                 position within `settings.questions`
   *
   * Returns the chosen-by-the-server correct index so the client can
   * highlight the right answer. For multi-question blocks the
   * `chosenKey` column encodes both positions as `"subIdx:choiceIdx"`
   * (the column is also used by lettered Question MCQ Attempts; we
   * already accept the overloading).
   */
  attemptBlock: protectedProcedure
    .input(
      z.object({
        blockId: z.string(),
        chosenIndex: z.number().int().min(0).max(9),
        // Present for AI_QUIZ / QUIZ multi-question decks; absent for
        // single-question MCQ blocks.
        subIndex: z.number().int().min(0).max(19).optional(),
        hintsUsed: z.number().int().min(0).max(3).default(0),
        timeMs: z.number().int().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });

      // Resolve the answer list + source label per block type. Each
      // branch narrows `block.settings` via `settingsFor()` so the
      // per-type shape is checked at compile time (POLL/MCQ/QUIZ all
      // store an `options`-shaped field but with different element
      // types — the discriminated catalog in @/lib/blocks keeps them
      // apart).
      let answers: Array<{ correct: boolean }>;
      let source: string;

      if (block.type === "MCQ") {
        if (input.subIndex !== undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MCQ blocks don't take a subIndex",
          });
        }
        const settings = settingsFor("MCQ", block.settings);
        const rawOptions = settings.options ?? [];
        answers = rawOptions.filter(
          (o): o is { text: string; correct: boolean } =>
            o !== null &&
            typeof o === "object" &&
            typeof (o as { text?: unknown }).text === "string" &&
            typeof (o as { correct?: unknown }).correct === "boolean"
        );
        source = "block_mcq_correct";
      } else if (block.type === "AI_QUIZ" || block.type === "QUIZ") {
        if (input.subIndex === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${block.type} blocks require a subIndex`,
          });
        }
        // AI_QUIZ stores questions under settings.generated.questions;
        // QUIZ stores them at settings.questions directly.
        const questions =
          block.type === "AI_QUIZ"
            ? (settingsFor("AI_QUIZ", block.settings).generated
                ?.questions ?? [])
            : (settingsFor("QUIZ", block.settings).questions ?? []);
        const question = questions[input.subIndex] as unknown;
        if (
          !question ||
          typeof question !== "object" ||
          !Array.isArray((question as { answers?: unknown }).answers)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Question not found at subIndex",
          });
        }
        const rawAnswers = (question as { answers: unknown[] }).answers;
        answers = rawAnswers.filter(
          (a): a is { correct: boolean } =>
            a !== null &&
            typeof a === "object" &&
            typeof (a as { correct?: unknown }).correct === "boolean"
        );
        source =
          block.type === "AI_QUIZ"
            ? "block_ai_quiz_correct"
            : "block_quiz_correct";
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Block type ${block.type} is not MCQ-style`,
        });
      }

      if (answers.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Question is not yet a valid MCQ (needs ≥2 options)",
        });
      }
      if (input.chosenIndex >= answers.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chosen option out of range",
        });
      }

      const correct = answers[input.chosenIndex].correct;
      const correctIndex = answers.findIndex((a) => a.correct);
      const points = correct ? xpForCorrect(input.hintsUsed) : 0;

      // For multi-question blocks encode both positions; for MCQ keep
      // the legacy single-number string so existing analytics still
      // works.
      const chosenKey =
        input.subIndex !== undefined
          ? `${input.subIndex}:${input.chosenIndex}`
          : String(input.chosenIndex);

      await ctx.db.attempt.create({
        data: {
          userId: ctx.user.id,
          lessonId: block.lessonId,
          blockId: block.id,
          chosenKey,
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
              source,
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
   * Submit a DRAG_MATCH block's pairings. Server validates against
   * the canonical pairs in `settings.pairs` and awards XP based on
   * what fraction was correctly placed:
   *  - 100% correct → full XP
   *  - ≥70% correct → half XP (rounded up, min XP_FLOOR)
   *  - <70% correct → 0 XP (still records the Attempt for analytics)
   */
  completeDragMatch: protectedProcedure
    .input(
      z.object({
        blockId: z.string(),
        // For each slot index, the index of the right-item the student
        // dropped into it. null = slot left empty.
        placements: z.array(z.number().int().nullable()).min(2).max(8),
        timeMs: z.number().int().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "DRAG_MATCH") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not a DRAG_MATCH",
        });
      }

      const settings = settingsFor("DRAG_MATCH", block.settings);
      const rawPairs = settings.pairs ?? [];
      const pairs = rawPairs.filter(
        (p): p is { left: string; right: string } =>
          p !== null &&
          typeof p === "object" &&
          typeof (p as { left?: unknown }).left === "string" &&
          typeof (p as { right?: unknown }).right === "string"
      );
      if (pairs.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block has no pairs to match",
        });
      }
      if (input.placements.length !== pairs.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Placements length must match pair count",
        });
      }

      // A placement is correct when the rightIdx dropped into slot i
      // points at a right-string matching pairs[i].right. (Identical
      // right-strings across pairs count as interchangeable.)
      let correctCount = 0;
      for (let i = 0; i < pairs.length; i++) {
        const rightIdx = input.placements[i];
        if (
          rightIdx !== null &&
          rightIdx >= 0 &&
          rightIdx < pairs.length &&
          pairs[rightIdx].right === pairs[i].right
        ) {
          correctCount += 1;
        }
      }

      const pct = correctCount / pairs.length;
      const correct = pct === 1;
      const points =
        pct === 1
          ? XP_PER_CORRECT
          : pct >= 0.7
            ? Math.max(XP_FLOOR, Math.ceil(XP_PER_CORRECT / 2))
            : 0;

      await ctx.db.attempt.create({
        data: {
          userId: ctx.user.id,
          lessonId: block.lessonId,
          blockId: block.id,
          // Encoded as "drag:correctCount/total" so analytics can read
          // the score back without re-validating against settings.
          chosenKey: `drag:${correctCount}/${pairs.length}`,
          correct,
          hintsUsed: 0,
          timeMs: input.timeMs,
        },
      });

      const award =
        points > 0
          ? await awardCorrectAttempt(
              ctx.db,
              ctx.user.id,
              points,
              "block_drag_match_complete",
              block.id
            )
          : null;

      return {
        correct,
        correctCount,
        totalPairs: pairs.length,
        points,
        bonusPoints: award?.bonusPoints ?? 0,
        streak: award?.streak ?? null,
        badgeAwarded: award?.badgeAwarded ?? null,
      };
    }),

  /**
   * Submit a BRANCHING block's completion when the student reaches
   * any terminal node. Server validates the node exists and has zero
   * choices. Always counts as `correct: true` (in CYOA, completion
   * IS the achievement). Awards full XP; no idempotency check in v1 —
   * student can earn XP per terminal reached if there are multiple
   * paths, which matches the exploratory intent.
   */
  completeBranching: protectedProcedure
    .input(
      z.object({
        blockId: z.string(),
        terminalNodeId: z.string(),
        timeMs: z.number().int().nonnegative().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "BRANCHING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not a BRANCHING",
        });
      }

      const settings = settingsFor("BRANCHING", block.settings);
      const rawNodes = settings.nodes ?? [];
      // BranchingNode is already typed via SettingsFor<"BRANCHING">, so
      // no defensive shape predicate needed here — array elements are
      // known to have {id, choices, ...}. If the JSON on disk is
      // malformed we surface that as a NOT_FOUND below.
      const node = rawNodes.find((n) => n.id === input.terminalNodeId);
      if (!node) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Terminal node not found",
        });
      }
      if (!Array.isArray(node.choices) || node.choices.length !== 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Node is not terminal",
        });
      }

      const points = XP_PER_CORRECT;

      await ctx.db.attempt.create({
        data: {
          userId: ctx.user.id,
          lessonId: block.lessonId,
          blockId: block.id,
          chosenKey: `branch:${input.terminalNodeId}`,
          correct: true,
          hintsUsed: 0,
          timeMs: input.timeMs,
        },
      });

      const award = await awardCorrectAttempt(
        ctx.db,
        ctx.user.id,
        points,
        "block_branching_complete",
        block.id
      );

      return {
        correct: true,
        points,
        bonusPoints: award.bonusPoints,
        terminalNodeId: input.terminalNodeId,
        streak: award.streak,
        badgeAwarded: award.badgeAwarded,
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
      const settings = settingsFor("POLL", block.settings);
      const options = (settings.options ?? []).filter(
        (o): o is string => typeof o === "string"
      );

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
      const settings = settingsFor("POLL", block.settings);
      const options = (settings.options ?? []).filter(
        (o): o is string => typeof o === "string"
      );
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

  /**
   * Mark a lesson complete for the signed-in student.
   *
   * Idempotent: re-completing the same lesson is a no-op on the
   * checkpoint (LessonProgress is uniqued by (userId, lessonId)) but
   * still recomputes Enrollment.progressPct + bumps lastActivityAt so
   * the dashboard's "continue learning" sort updates.
   *
   * Returns the next lesson's slug (within the same course, sorted by
   * unit-then-lesson order) so the client can navigate the student
   * forward. When the course is fully complete, returns no next slug
   * and the caller falls back to the course page.
   */
  markComplete: protectedProcedure
    .input(z.object({ lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Pull the lesson + its sibling lessons (for next-up + total count)
      // in a single query — avoids a follow-up round-trip to compute
      // the new progress percentage.
      const lesson = await ctx.db.lesson.findUnique({
        where: { id: input.lessonId },
        select: {
          id: true,
          unit: {
            select: {
              courseId: true,
              course: {
                select: {
                  slug: true,
                  units: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      order: true,
                      lessons: {
                        orderBy: { order: "asc" },
                        select: { id: true, slug: true, order: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      const courseId = lesson.unit.courseId;
      const courseSlug = lesson.unit.course.slug;

      // Idempotent completion checkpoint.
      await ctx.db.lessonProgress.upsert({
        where: {
          userId_lessonId: {
            userId: ctx.user.id,
            lessonId: input.lessonId,
          },
        },
        create: { userId: ctx.user.id, lessonId: input.lessonId },
        update: {},
      });

      // Recompute progressPct from real LessonProgress rows in this
      // course — never trust the existing enrollment.progressPct,
      // since lessons can be added/removed from the course after the
      // student enrolled.
      const orderedLessons = lesson.unit.course.units.flatMap(
        (u) => u.lessons
      );
      const totalLessons = orderedLessons.length;
      const completedRows = await ctx.db.lessonProgress.findMany({
        where: {
          userId: ctx.user.id,
          lesson: { unit: { courseId } },
        },
        select: { lessonId: true },
      });
      const completedCount = new Set(completedRows.map((r) => r.lessonId))
        .size;
      const progressPct =
        totalLessons > 0
          ? Math.min(
              100,
              Math.round((completedCount / totalLessons) * 100)
            )
          : 0;
      const isCourseComplete =
        totalLessons > 0 && completedCount >= totalLessons;

      // Upsert so a student who hits Complete on a free-preview lesson
      // (without enrolling first) still gets an Enrollment row.
      await ctx.db.enrollment.upsert({
        where: {
          userId_courseId: { userId: ctx.user.id, courseId },
        },
        create: {
          userId: ctx.user.id,
          courseId,
          progressPct,
          completed: isCourseComplete,
          lastActivityAt: new Date(),
        },
        update: {
          progressPct,
          completed: isCourseComplete,
          lastActivityAt: new Date(),
        },
      });

      // Find the next *playable* lesson in unit-then-lesson order. The
      // query already ordered by `unit.order` then `lesson.order`, so
      // the flat list is in playback sequence. We skip any lesson
      // without a slug: the student-facing reader route is
      // `/student/lesson/[slug]`, so a slug-less lesson has nowhere to
      // navigate to — stopping on one would dead-end the student (or,
      // as the client used to do, bounce them back to the course page
      // mid-course as if the quiz had kicked them out).
      const currentIdx = orderedLessons.findIndex(
        (l) => l.id === input.lessonId
      );
      const nextLesson =
        currentIdx >= 0
          ? (orderedLessons
              .slice(currentIdx + 1)
              .find((l) => l.slug != null && l.slug !== "") ?? null)
          : null;

      return {
        ok: true as const,
        progressPct,
        completed: isCourseComplete,
        nextLessonSlug: nextLesson?.slug ?? null,
        courseSlug,
      };
    }),
});
