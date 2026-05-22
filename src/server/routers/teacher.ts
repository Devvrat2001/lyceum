import { z } from "zod";
import type { Prisma } from "@prisma/client";
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
import { findBlockTemplate } from "@/lib/blockTemplates";

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
                  blocks: {
                    orderBy: { order: "asc" },
                    select: { id: true, type: true, order: true, settings: true },
                  },
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

  /**
   * Publish or unpublish a course — the ONLY thing that flips
   * `Course.status` between DRAFT and PUBLISHED.
   *
   * This is the gate that makes a course reachable by students: every
   * marketplace surface (`marketplace.featured` / `search` / `aiSearch`
   * / `recommendedFor`, and the `teachers` list) filters
   * `status: "PUBLISHED"`. A course is created as DRAFT (schema
   * default; `generator.saveAsCourse` included), so until a teacher
   * publishes it the course is invisible to students no matter how
   * much unit/lesson/block content they author. Structural edits
   * (reorderUnits / addBlock / updateBlock / …) persist on their own —
   * this only toggles the visibility flag.
   *
   * Idempotent: re-sending the status a course already has is a no-op
   * (no write, no audit row) and still returns ok.
   */
  setCourseStatus: teacherProcedure
    .input(
      z.object({
        courseId: z.string(),
        status: z.enum(["DRAFT", "PUBLISHED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, authorId: true, status: true },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "ADMIN" && course.authorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (course.status === input.status) {
        return { ok: true as const, status: course.status, changed: false };
      }
      await ctx.db.course.update({
        where: { id: course.id },
        data: { status: input.status },
      });
      await audit({
        actorId: ctx.user.id,
        kind:
          input.status === "PUBLISHED"
            ? "course.publish"
            : "course.unpublish",
        courseId: course.id,
        payload: { from: course.status, to: input.status },
      });
      return { ok: true as const, status: input.status, changed: true };
    }),

  /**
   * Edit a course's identity + marketplace metadata — title, tagline,
   * subject, grade, price. Partial update: only the provided fields
   * change. The `slug` is deliberately NOT touched — it's the permanent
   * URL, and rewriting it on every rename would break student bookmarks
   * and in-flight share links.
   */
  updateCourse: teacherProcedure
    .input(
      z.object({
        courseId: z.string(),
        title: z.string().max(120).optional(),
        tagline: z.string().max(160).optional(),
        subject: z.string().max(40).optional(),
        grade: z.string().max(40).optional(),
        priceCents: z.number().int().min(0).max(1_000_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, authorId: true },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "ADMIN" && course.authorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const data: Prisma.CourseUpdateInput = {};
      if (input.title !== undefined) {
        const title = input.title.trim();
        if (title.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Course title can't be empty.",
          });
        }
        data.title = title;
      }
      if (input.tagline !== undefined) {
        // Empty tagline clears the field rather than storing "".
        const tagline = input.tagline.trim();
        data.tagline = tagline.length > 0 ? tagline : null;
      }
      if (input.subject !== undefined) {
        const subject = input.subject.trim();
        if (subject.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Subject can't be empty.",
          });
        }
        data.subject = subject;
      }
      if (input.grade !== undefined) {
        const grade = input.grade.trim();
        if (grade.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Grade can't be empty.",
          });
        }
        data.grade = grade;
      }
      if (input.priceCents !== undefined) {
        data.priceCents = input.priceCents;
      }

      if (Object.keys(data).length === 0) {
        return { ok: true as const, changed: false };
      }

      const updated = await ctx.db.course.update({
        where: { id: course.id },
        data,
        select: {
          id: true,
          title: true,
          tagline: true,
          subject: true,
          grade: true,
          priceCents: true,
        },
      });
      await audit({
        actorId: ctx.user.id,
        kind: "course.update",
        courseId: course.id,
        payload: { fields: Object.keys(data) },
      });
      return { ok: true as const, changed: true, course: updated };
    }),

  /**
   * Edit the signed-in teacher's public storefront profile — the
   * headline and bio shown on /t/[teacherId]. Empty strings clear the
   * field. Always scoped to ctx.user.id; a teacher can only edit their
   * own profile.
   */
  updateProfile: teacherProcedure
    .input(
      z.object({
        headline: z.string().max(120).optional(),
        bio: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const data: Prisma.UserUpdateInput = {};
      if (input.headline !== undefined) {
        const headline = input.headline.trim();
        data.headline = headline.length > 0 ? headline : null;
      }
      if (input.bio !== undefined) {
        const bio = input.bio.trim();
        data.bio = bio.length > 0 ? bio : null;
      }
      if (Object.keys(data).length === 0) {
        return { ok: true as const, changed: false };
      }
      const updated = await ctx.db.user.update({
        where: { id: ctx.user.id },
        data,
        select: { id: true, headline: true, bio: true },
      });
      return { ok: true as const, changed: true, profile: updated };
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
      const rangeDays = input?.rangeDays ?? 30;
      const dayMs = 24 * 3600 * 1000;
      const now = Date.now();
      // Two back-to-back windows: [since, now] is the current period,
      // [prevSince, since) the prior one — used for the period-over-period
      // KPI deltas.
      const since = new Date(now - rangeDays * dayMs);
      const prevSince = new Date(now - 2 * rangeDays * dayMs);
      const isAdmin = ctx.user.role === "ADMIN";
      const ownerWhere = isAdmin ? {} : { authorId: ctx.user.id };

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
            select: {
              progressPct: true,
              completed: true,
              lastActivityAt: true,
              enrolledAt: true,
            },
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

      // Avg quiz score (% correct on attempts in the current window).
      // createdAt is also used to bucket the daily chart series below.
      const attempts = await ctx.db.attempt.findMany({
        where: {
          lesson: { unit: { courseId: { in: courseIds } } },
          createdAt: { gte: since },
        },
        select: { correct: true, userId: true, createdAt: true },
      });
      const avgQuiz =
        attempts.length > 0
          ? Math.round(
              (attempts.filter((a) => a.correct).length / attempts.length) *
                100
            )
          : 0;

      // AI tutor sessions on this teacher's lessons, across both windows
      // so the KPI can show a real period-over-period delta.
      const tutorRows = await ctx.db.tutorSession.findMany({
        where: {
          lesson: { unit: { courseId: { in: courseIds } } },
          createdAt: { gte: prevSince },
        },
        select: { createdAt: true },
      });
      const tutorCurrent = tutorRows.filter((t) => t.createdAt >= since).length;
      const tutorPrev = tutorRows.length - tutorCurrent;
      const tutorDelta = tutorCurrent - tutorPrev;

      // Earnings — real money summed from PAID orders. Admins see the
      // whole platform; a teacher sees only their own courses' orders.
      const monthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );
      const lastMonthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth() - 1,
        1
      );
      const earningsWhere = isAdmin ? {} : { teacherId: ctx.user.id };
      const [mtdAgg, lastMonthAgg] = await Promise.all([
        ctx.db.order.aggregate({
          where: {
            ...earningsWhere,
            status: "PAID",
            paidAt: { gte: monthStart },
          },
          _sum: { netCents: true },
        }),
        ctx.db.order.aggregate({
          where: {
            ...earningsWhere,
            status: "PAID",
            paidAt: { gte: lastMonthStart, lt: monthStart },
          },
          _sum: { netCents: true },
        }),
      ]);
      const mtdNet = mtdAgg._sum.netCents ?? 0;
      const lastMonthNet = lastMonthAgg._sum.netCents ?? 0;
      const earningsDeltaPct =
        lastMonthNet > 0
          ? Math.round(((mtdNet - lastMonthNet) / lastMonthNet) * 100)
          : null;

      // Daily series for the "engagement over time" chart — one bucket
      // per day across the current window. All three lines are real:
      // active learners (≥1 quiz attempt that day), new enrollments,
      // and AI tutor sessions.
      const dayIndex = (d: Date) => {
        const i = Math.floor((d.getTime() - since.getTime()) / dayMs);
        return Math.min(rangeDays - 1, Math.max(0, i));
      };
      const activeByDay = Array.from(
        { length: rangeDays },
        () => new Set<string>()
      );
      const enrollByDay = new Array<number>(rangeDays).fill(0);
      const tutorByDay = new Array<number>(rangeDays).fill(0);
      for (const a of attempts) {
        activeByDay[dayIndex(a.createdAt)].add(a.userId);
      }
      for (const c of courses) {
        for (const e of c.enrollments) {
          if (e.enrolledAt >= since) enrollByDay[dayIndex(e.enrolledAt)] += 1;
        }
      }
      for (const t of tutorRows) {
        if (t.createdAt >= since) tutorByDay[dayIndex(t.createdAt)] += 1;
      }
      const fmtDay = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const axisLabels = [0, 1, 2, 3].map((k) =>
        fmtDay(
          new Date(
            since.getTime() + Math.round((k / 3) * (rangeDays - 1)) * dayMs
          )
        )
      );

      // Drop-off funnel: % of enrollments past each progress milestone.
      // The percentages are real; labels describe honest progress bands
      // rather than inventing per-lesson step names.
      const buckets = [0, 1, 25, 50, 75, 90, 100];
      const labelMap = [
        "Enrolled",
        "Started",
        "25% complete",
        "50% complete",
        "75% complete",
        "90% complete",
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
            v: activeStudents.toLocaleString("en-US"),
            d: `${totalStudents} total`,
            meta: `${rangeDays}-day`,
            neg: false,
          },
          {
            l: "Avg. completion",
            v: `${avgProgress}%`,
            d: `${avgCompletion}% finished`,
            meta: "all courses",
            neg: false,
          },
          {
            l: "Avg. quiz score",
            v: avgQuiz.toString(),
            d: `${attempts.length} attempts`,
            meta: "% correct",
            neg: false,
          },
          {
            l: "AI tutor sessions",
            v: tutorCurrent.toLocaleString("en-US"),
            d:
              tutorCurrent === 0 && tutorPrev === 0
                ? "no activity yet"
                : `${tutorDelta >= 0 ? "+" : "−"}${Math.abs(tutorDelta)} vs prev`,
            meta: `${rangeDays}-day`,
            neg: tutorDelta < 0,
          },
          {
            l: "Earnings · MTD",
            v: `$${Math.round(mtdNet / 100).toLocaleString("en-US")}`,
            d:
              earningsDeltaPct !== null
                ? `${earningsDeltaPct >= 0 ? "+" : "−"}${Math.abs(
                    earningsDeltaPct
                  )}% vs last mo.`
                : mtdNet > 0
                ? "first sales"
                : "no sales yet",
            meta: "after fees",
            neg: earningsDeltaPct !== null && earningsDeltaPct < 0,
          },
        ],
        funnel: stages,
        series: {
          active: activeByDay.map((s) => s.size),
          enroll: enrollByDay,
          tutor: tutorByDay,
          axisLabels,
        },
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
   * Append a new block to a lesson. Used by the course builder's
   * "+ block" popover. Block.order is set to (max existing order + 1)
   * so the new block always lands at the end — within-lesson reorder
   * is a future feature.
   *
   * `settings` defaults to an empty JSON object; type-specific defaults
   * (e.g. quiz prompts, video URLs) belong in the inspector flow which
   * lands after this. Keeping the mutation skinny avoids baking
   * assumptions about block configuration shapes too early.
   */
  addBlock: teacherProcedure
    .input(
      z.object({
        lessonId: z.string(),
        type: z.enum([
          "VIDEO",
          "READING",
          "SLIDES",
          "PDF",
          "QUIZ",
          "MCQ",
          "SPEAK",
          "AI_QUIZ",
          "SIMULATION",
          "BRANCHING",
          "DRAG_MATCH",
          "POLL",
          "SECTION",
          "DISCUSSION",
          "LIVE",
        ]),
        /** Optional starter template id (see `lib/blockTemplates.ts`).
         *  When set, server seeds Block.settings with the template's
         *  payload + writes a default label. Must match `type` —
         *  prevents client from sending a POLL template for an MCQ row
         *  (which would silently store POLL-shaped settings on an MCQ
         *  block and break the inspector). */
        templateId: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.db.lesson.findUnique({
        where: { id: input.lessonId },
        select: {
          id: true,
          unit: { select: { course: { select: { authorId: true } } } },
          blocks: { orderBy: { order: "desc" }, take: 1, select: { order: true } },
        },
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        lesson.unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Resolve template (if provided) server-side — the catalog is the
      // single source of truth, so clients can't smuggle arbitrary
      // settings via this endpoint.
      let settings: Prisma.InputJsonValue = {};
      if (input.templateId) {
        const template = findBlockTemplate(input.templateId);
        if (!template) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown template: ${input.templateId}`,
          });
        }
        if (template.type !== input.type) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Template "${input.templateId}" is a ${template.type}, not ${input.type}`,
          });
        }
        // Templates may include a default label; merge it into settings
        // alongside the per-type fields so the inspector picks it up.
        const baseSettings =
          (template.settings ?? {}) as Record<string, unknown>;
        settings = {
          ...baseSettings,
          ...(template.blockLabel ? { label: template.blockLabel } : {}),
        } as Prisma.InputJsonValue;
      }

      const nextOrder = (lesson.blocks[0]?.order ?? 0) + 1;
      const block = await ctx.db.block.create({
        data: {
          lessonId: input.lessonId,
          type: input.type,
          order: nextOrder,
          settings,
        },
        select: { id: true, type: true, order: true, settings: true },
      });
      return { ok: true as const, block };
    }),

  /**
   * Persist a new block ordering within a single lesson. Same shape
   * as reorderUnits/reorderLessons — rewrites Block.order to 1..N
   * inside a $transaction. Rejects partial reorders (caller must
   * supply every block id exactly once) so the (lessonId, order)
   * invariant stays trivially correct after the operation.
   *
   * Note: this DOES tighten the previously-sparse Block.order back
   * down to a contiguous 1..N. That's fine — sparse order is a
   * post-delete property, not a guarantee callers depend on, and
   * compacting on every reorder keeps subsequent addBlock numbers
   * small.
   */
  reorderBlocks: teacherProcedure
    .input(
      z.object({
        lessonId: z.string(),
        blockIds: z.array(z.string()).min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.db.lesson.findUnique({
        where: { id: input.lessonId },
        select: {
          id: true,
          unit: { select: { course: { select: { authorId: true } } } },
          blocks: { select: { id: true } },
        },
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        lesson.unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = new Set(lesson.blocks.map((b) => b.id));
      if (
        input.blockIds.length !== existing.size ||
        input.blockIds.some((id) => !existing.has(id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "blockIds must list every block in the lesson exactly once.",
        });
      }
      await ctx.db.$transaction(
        input.blockIds.map((id, i) =>
          ctx.db.block.update({
            where: { id },
            data: { order: i + 1 },
          })
        )
      );
      return { ok: true as const, count: input.blockIds.length };
    }),

  /**
   * Replace a block's `settings` JSON. Used by the builder's block
   * inspector to edit per-block configuration (label, notes, and
   * eventually type-specific fields like video URL or quiz prompts).
   *
   * Settings is fully replaced, not merged — callers send the
   * complete new shape. This keeps the mutation predictable and
   * lets clients implement their own optimistic-update strategy
   * without us having to think about partial-update semantics on
   * a JSON column.
   *
   * The Zod schema deliberately accepts an open record — block-type
   * specific validation belongs in the inspector forms that ship
   * the values, not here.
   */
  updateBlock: teacherProcedure
    .input(
      z.object({
        blockId: z.string(),
        settings: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
        select: {
          id: true,
          lesson: {
            select: { unit: { select: { course: { select: { authorId: true } } } } },
          },
        },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        block.lesson.unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const updated = await ctx.db.block.update({
        where: { id: input.blockId },
        data: { settings: input.settings as Prisma.InputJsonValue },
        select: { id: true, settings: true },
      });
      return { ok: true as const, block: updated };
    }),

  /**
   * Remove a block from a lesson. Resolves ownership through
   * block.lesson.unit.course.authorId. We deliberately do NOT
   * renumber the remaining blocks — `order` is sparse on purpose, so
   * a deletion in the middle of the list leaves a gap (e.g. 1, 2,
   * 4 → fine, the next add becomes 5). This keeps the mutation
   * O(1) and avoids a $transaction that would have to update every
   * row after the deleted one. (reorderBlocks above compacts back
   * to 1..N when the teacher actually rearranges.)
   */
  deleteBlock: teacherProcedure
    .input(z.object({ blockId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
        select: {
          id: true,
          lessonId: true,
          lesson: {
            select: { unit: { select: { course: { select: { authorId: true } } } } },
          },
        },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        block.lesson.unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db.block.delete({ where: { id: block.id } });
      return { ok: true as const, blockId: block.id };
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
