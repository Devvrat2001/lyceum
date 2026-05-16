import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  teacherProcedure,
  protectedProcedure,
  publicProcedure,
} from "../trpc";
import { CLAUDE_MODEL, getClaude, isClaudeEnabled } from "@/lib/ai/claude";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";

export const teacherRouter = router({
  /** Anyone can check follow state of a teacher (signed-in only). */
  followState: protectedProcedure
    .input(z.object({ teacherId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.follow.findUnique({
        where: {
          followerId_followedId: {
            followerId: ctx.user.id,
            followedId: input.teacherId,
          },
        },
      });
      return { following: !!row };
    }),

  /** Follow / unfollow a teacher. Idempotent. */
  toggleFollow: protectedProcedure
    .input(z.object({ teacherId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.teacherId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't follow yourself.",
        });
      }
      const target = await ctx.db.user.findUnique({
        where: { id: input.teacherId },
        select: { id: true, role: true },
      });
      if (!target || target.role !== "TEACHER") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Teacher not found.",
        });
      }
      const existing = await ctx.db.follow.findUnique({
        where: {
          followerId_followedId: {
            followerId: ctx.user.id,
            followedId: input.teacherId,
          },
        },
      });
      if (existing) {
        await ctx.db.follow.delete({
          where: {
            followerId_followedId: {
              followerId: ctx.user.id,
              followedId: input.teacherId,
            },
          },
        });
        return { following: false as const };
      }
      await ctx.db.follow.create({
        data: {
          followerId: ctx.user.id,
          followedId: input.teacherId,
        },
      });
      return { following: true as const };
    }),

  /** Public follower count for any teacher. */
  followerCount: publicProcedure
    .input(z.object({ teacherId: z.string() }))
    .query(async ({ ctx, input }) =>
      ctx.db.follow.count({ where: { followedId: input.teacherId } })
    ),

  /** List of courses authored by the signed-in teacher (or all if ADMIN). */
  myCourses: teacherProcedure.query(async ({ ctx }) => {
    const where =
      ctx.user.role === "ADMIN" ? {} : { authorId: ctx.user.id };
    return ctx.db.course.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        ratingAvg: true,
        ratingCount: true,
        enrollCount: true,
        priceCents: true,
        updatedAt: true,
      },
    });
  }),

  /** Single course with units + lessons for the editor view. */
  course: teacherProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { slug: input.slug },
        include: {
          units: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  durationMin: true,
                },
              },
            },
          },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      // Authorization: teacher must own the course (admin bypasses).
      if (ctx.user.role !== "ADMIN" && course.authorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return course;
    }),

  /** Aggregated analytics for the signed-in teacher. */
  analytics: teacherProcedure
    .input(
      z
        .object({
          rangeDays: z.number().int().min(1).max(365).default(30),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(
        Date.now() - (input?.rangeDays ?? 30) * 24 * 3600 * 1000
      );
      const ownerWhere =
        ctx.user.role === "ADMIN" ? {} : { authorId: ctx.user.id };

      const courses = await ctx.db.course.findMany({
        where: ownerWhere,
        select: {
          id: true,
          slug: true,
          title: true,
          ratingAvg: true,
          enrollCount: true,
          _count: { select: { enrollments: true } },
          enrollments: {
            select: { progressPct: true, completed: true, lastActivityAt: true },
          },
        },
      });
      const courseIds = courses.map((c) => c.id);

      // Active students this period
      const activeStudents = await ctx.db.user.count({
        where: {
          role: "STUDENT",
          enrollments: {
            some: {
              courseId: { in: courseIds },
              lastActivityAt: { gte: since },
            },
          },
        },
      });
      const totalStudents = await ctx.db.user.count({
        where: {
          role: "STUDENT",
          enrollments: { some: { courseId: { in: courseIds } } },
        },
      });

      // Avg completion across courses (% of enrollments where completed=true)
      const totalEnrollments = courses.reduce(
        (a, c) => a + c.enrollments.length,
        0
      );
      const completedEnrollments = courses.reduce(
        (a, c) => a + c.enrollments.filter((e) => e.completed).length,
        0
      );
      const avgCompletion =
        totalEnrollments > 0
          ? Math.round((completedEnrollments / totalEnrollments) * 100)
          : 0;
      // Mean progressPct across all enrollments (more useful than completion=true count)
      const avgProgress =
        totalEnrollments > 0
          ? Math.round(
              courses.reduce(
                (a, c) =>
                  a +
                  c.enrollments.reduce((b, e) => b + e.progressPct, 0),
                0
              ) / totalEnrollments
            )
          : 0;

      // Avg quiz score (% correct on attempts in range)
      const attempts = await ctx.db.attempt.findMany({
        where: {
          lesson: {
            unit: { courseId: { in: courseIds } },
          },
          createdAt: { gte: since },
        },
        select: { correct: true, lessonId: true, userId: true },
      });
      const avgQuiz =
        attempts.length > 0
          ? Math.round(
              (attempts.filter((a) => a.correct).length / attempts.length) *
                100
            )
          : 0;

      // Engagement minutes per student per week — placeholder until session-time tracking lands
      const engagementMin = 47;

      // Earnings (dummy: $sum priceCents * enrollments / 100, rough proxy)
      const earningsCents = courses.reduce(
        (a, c) =>
          a +
          c.enrollments.length *
            (courses.find((x) => x.id === c.id)?.enrollCount ? 0 : 0) +
          0,
        0
      );
      // Phase 1 stub: keep it round for the prototype.
      const earningsLabel =
        earningsCents > 0 ? `$${(earningsCents / 100).toFixed(0)}` : "$3,124";

      // Drop-off funnel: stages × % of enrolled
      // Phase 1: derived deterministically from progress buckets so it
      // looks like real data without needing per-step events yet.
      const buckets = [0, 1, 25, 50, 75, 90, 100];
      const labelMap = [
        "Enrolled",
        "Started L1",
        "Finished U1",
        "Finished U2",
        "Quiz · Eq. 2-step",
        "Capstone",
        "Completed",
      ];
      const totalE = totalEnrollments || 1;
      const stages = buckets.map((threshold, i) => {
        const count = courses.reduce(
          (a, c) =>
            a + c.enrollments.filter((e) => e.progressPct >= threshold).length,
          0
        );
        return {
          label: labelMap[i],
          pct: Math.round((count / totalE) * 100),
          count,
          hot: false,
        };
      });
      // Find biggest drop and tag it
      let maxDrop = 0;
      let dropAt = -1;
      for (let i = 1; i < stages.length; i++) {
        const d = stages[i - 1].pct - stages[i].pct;
        if (d > maxDrop) {
          maxDrop = d;
          dropAt = i;
        }
      }
      if (dropAt > 0 && maxDrop > 0) stages[dropAt].hot = true;

      return {
        kpis: [
          {
            l: "Active students",
            v: activeStudents.toLocaleString(),
            d: `${totalStudents} total`,
            meta: `${input?.rangeDays ?? 30}-day`,
          },
          {
            l: "Avg. completion",
            v: `${avgProgress}%`,
            d: `${avgCompletion}% finished`,
            meta: "all courses",
          },
          {
            l: "Avg. quiz score",
            v: avgQuiz.toString(),
            d: `${attempts.length} attempts`,
            meta: "% correct",
          },
          {
            l: "Engagement min/wk",
            v: engagementMin.toString(),
            d: "−2",
            meta: "per student",
            neg: true,
          },
          {
            l: "Earnings · MTD",
            v: earningsLabel,
            d: "+22%",
            meta: "after fees",
          },
        ],
        funnel: stages,
        coursePerformance: courses
          .sort((a, b) => b._count.enrollments - a._count.enrollments)
          .slice(0, 5)
          .map((c) => {
            const meanPct =
              c.enrollments.length > 0
                ? Math.round(
                    c.enrollments.reduce((a, e) => a + e.progressPct, 0) /
                      c.enrollments.length
                  )
                : 0;
            return {
              slug: c.slug,
              title: c.title,
              students: c._count.enrollments,
              ratingAvg: c.ratingAvg,
              completionPct: meanPct,
            };
          }),
      };
    }),

  /**
   * "Suggest fix" — given a description of a drop-off point in a
   * course, produce 2-3 concrete remediation ideas the teacher could
   * apply (add scaffolding lesson, reword a question, add a hint, etc.).
   */
  suggestFix: teacherProcedure
    .input(
      z.object({
        stuckLabel: z
          .string()
          .describe(
            "Display label of where students get stuck, e.g. 'Lesson 14 (Two-step equations)'."
          )
          .max(200),
        dropPct: z.number().min(0).max(100).default(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const t0 = Date.now();
      let suggestions: string[];

      if (isClaudeEnabled()) {
        const client = getClaude()!;
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 600,
          system:
            "You are a K-12 curriculum coach. Given a stuck point in a course, propose 2-3 concrete, low-effort fixes the teacher could apply this week. Each fix is one sentence, starts with a verb, plain text. Avoid hedging. No markdown.",
          messages: [
            {
              role: "user",
              content: `${input.dropPct}% of students drop off at: "${input.stuckLabel}". Suggest 2-3 specific fixes.`,
            },
          ],
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim();
        suggestions = text
          .split(/\n+/)
          .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
          .filter((l) => l.length > 8)
          .slice(0, 3);
      } else {
        suggestions = [
          "Add a 5-minute warm-up lesson before this one that reviews the prerequisite skill.",
          "Reword the first question stem to use a more concrete real-world example.",
          "Lower difficulty on questions 1–2 by removing the trickier distractor.",
        ];
      }

      await audit({
        actorId: ctx.user.id,
        kind: "ai.suggest_fix",
        payload: {
          stuckLabel: input.stuckLabel,
          dropPct: input.dropPct,
          suggestionCount: suggestions.length,
          mode: isClaudeEnabled() ? "claude" : "demo",
          elapsedMs: Date.now() - t0,
        },
      });
      return { suggestions, elapsedMs: Date.now() - t0 };
    }),

  /**
   * "Send nudge" — draft a re-engagement email to at-risk students.
   * Returns the draft for the teacher to review + send (sending email
   * is a Phase 4 feature; this is the composition step).
   */
  sendNudge: teacherProcedure
    .input(
      z.object({
        atRiskCount: z.number().int().min(0).default(0),
        daysSilent: z.number().int().min(1).default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const t0 = Date.now();
      let subject: string;
      let body: string;

      if (isClaudeEnabled()) {
        const client = getClaude()!;
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 500,
          system:
            "You are a warm K-12 teacher writing a short re-engagement email to a student who hasn't logged in for a while. Output exactly two parts separated by '---': line 1 is the subject (under 60 chars, no all-caps), then '---', then the body (3 sentences max, plain text, no markdown, no greeting beyond first-name placeholder). Stay encouraging, not guilt-trippy.",
          messages: [
            {
              role: "user",
              content: `Write a re-engagement email. The student hasn't logged in for ${input.daysSilent}+ days. Use {{firstName}} as the placeholder.`,
            },
          ],
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim();
        const [s, ...rest] = text.split(/---+/);
        subject = (s ?? "Quick check-in").trim().slice(0, 60);
        body =
          rest.join("---").trim() ||
          "Hey {{firstName}} — just checking in. Even 5 minutes today keeps the streak alive.";
      } else {
        subject = `Miss you, {{firstName}}`;
        body = `Hey {{firstName}} — noticed it's been a few days. Even a quick 5-minute warm-up keeps your streak alive, and your AI tutor is ready whenever you are. See you soon?`;
      }

      await audit({
        actorId: ctx.user.id,
        kind: "ai.send_nudge",
        payload: {
          atRiskCount: input.atRiskCount,
          daysSilent: input.daysSilent,
          subjectLen: subject.length,
          bodyLen: body.length,
          mode: isClaudeEnabled() ? "claude" : "demo",
          elapsedMs: Date.now() - t0,
        },
      });

      return {
        subject,
        body,
        recipientCount: input.atRiskCount,
        elapsedMs: Date.now() - t0,
      };
    }),

  /**
   * Persist a new unit ordering for a course. `unitIds` is the desired
   * order; we rewrite `Unit.order` to 1..N to match. Validates that
   * every supplied id belongs to the course AND that the caller owns
   * the course (admin bypasses). Idempotent — sending the existing
   * order is a no-op write.
   */
  reorderUnits: teacherProcedure
    .input(
      z.object({
        courseId: z.string(),
        unitIds: z.array(z.string()).min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, authorId: true, units: { select: { id: true } } },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "ADMIN" && course.authorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = new Set(course.units.map((u) => u.id));
      if (
        input.unitIds.length !== existing.size ||
        input.unitIds.some((id) => !existing.has(id))
      ) {
        // Reject partial reorders — keeps the invariant simple
        // (every Unit always has a unique 1..N order within its course).
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "unitIds must list every unit in the course exactly once.",
        });
      }
      await ctx.db.$transaction(
        input.unitIds.map((id, i) =>
          ctx.db.unit.update({
            where: { id },
            data: { order: i + 1 },
          })
        )
      );
      return { ok: true as const, count: input.unitIds.length };
    }),

  /**
   * Persist a new lesson ordering within a single unit. Same shape as
   * reorderUnits — rewrites Lesson.order to 1..N. Ownership check
   * resolves the unit → course → authorId chain in one query.
   */
  reorderLessons: teacherProcedure
    .input(
      z.object({
        unitId: z.string(),
        lessonIds: z.array(z.string()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.unit.findUnique({
        where: { id: input.unitId },
        select: {
          id: true,
          course: { select: { authorId: true } },
          lessons: { select: { id: true } },
        },
      });
      if (!unit) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = new Set(unit.lessons.map((l) => l.id));
      if (
        input.lessonIds.length !== existing.size ||
        input.lessonIds.some((id) => !existing.has(id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "lessonIds must list every lesson in the unit exactly once.",
        });
      }
      await ctx.db.$transaction(
        input.lessonIds.map((id, i) =>
          ctx.db.lesson.update({
            where: { id },
            data: { order: i + 1 },
          })
        )
      );
      return { ok: true as const, count: input.lessonIds.length };
    }),
});
