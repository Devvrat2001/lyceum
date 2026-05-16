import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  protectedProcedure,
  router,
  teacherProcedure,
} from "../trpc";
import {
  ADMIN_INSIGHT_SYSTEM_PROMPT,
  InsightBatchSchema,
  TEACHER_INSIGHT_SYSTEM_PROMPT,
  buildAdminInsightPrompt,
  buildDemoAdminInsights,
  buildDemoTeacherInsights,
  buildTeacherInsightPrompt,
  type InsightItem,
} from "@/lib/ai/prompts/insights";
import { CLAUDE_MODEL, getClaude, isClaudeEnabled } from "@/lib/ai/claude";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TEACHER_KINDS = new Set(["PATTERN", "OPPORTUNITY", "AT_RISK"]);
const ADMIN_KINDS = new Set(["STRENGTH", "WATCH", "TEACHER"]);

const INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insights"],
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "body"],
        properties: {
          kind: { type: "string" },
          body: { type: "string" },
          cta: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export const insightRouter = router({
  /**
   * Read the freshest cached insights for a teacher. Returns the
   * cache row (no AI call). Triggers a regeneration if forceRefresh
   * is true OR no fresh row exists.
   */
  forTeacher: teacherProcedure
    .input(
      z
        .object({ forceRefresh: z.boolean().default(false) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const scope = `TEACHER:${ctx.user.id}`;
      const fresh = await ctx.db.insight.findMany({
        where: {
          audience: "teacher",
          scope,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      if (fresh.length === 3 && !input?.forceRefresh) {
        return {
          insights: fresh.map((r) => ({
            kind: r.kind,
            body: r.body,
            cta: r.cta,
          })),
          generatedAt: fresh[0].createdAt.toISOString(),
          fromCache: true,
        };
      }
      return null;
    }),

  forAdmin: adminProcedure
    .input(
      z
        .object({ forceRefresh: z.boolean().default(false) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const me = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { institutionId: true },
      });
      const institutionId =
        me?.institutionId ??
        (await ctx.db.institution.findFirst({ select: { id: true } }))?.id;
      if (!institutionId) return null;
      const scope = `ADMIN:${institutionId}`;
      const fresh = await ctx.db.insight.findMany({
        where: {
          audience: "admin",
          scope,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      if (fresh.length === 3 && !input?.forceRefresh) {
        return {
          insights: fresh.map((r) => ({
            kind: r.kind,
            body: r.body,
            cta: r.cta,
          })),
          generatedAt: fresh[0].createdAt.toISOString(),
          fromCache: true,
        };
      }
      return null;
    }),

  /** Generate (or regenerate) teacher insights. Caches for 24h. */
  regenerateTeacher: teacherProcedure
    .input(
      z.object({
        rangeDays: z.number().int().min(1).max(180).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const t0 = Date.now();
      const scope = `TEACHER:${ctx.user.id}`;

      // Pull real teacher stats. ADMIN sees all courses.
      const courses = await ctx.db.course.findMany({
        where:
          ctx.user.role === "ADMIN" ? {} : { authorId: ctx.user.id },
        select: {
          id: true,
          title: true,
          enrollments: {
            select: { progressPct: true, completed: true, lastActivityAt: true },
          },
        },
      });
      const since = new Date(
        Date.now() - input.rangeDays * 24 * 3600 * 1000
      );
      const allEnrollments = courses.flatMap((c) =>
        c.enrollments.map((e) => ({ ...e, courseId: c.id }))
      );
      const totalStudents = new Set(
        allEnrollments.map((e) => `${e.courseId}`)
      ).size > 0 ? allEnrollments.length : 0;
      const activeStudents = allEnrollments.filter(
        (e) => e.lastActivityAt && e.lastActivityAt >= since
      ).length;

      const attempts = await ctx.db.attempt.findMany({
        where: {
          lesson: { unit: { courseId: { in: courses.map((c) => c.id) } } },
          createdAt: { gte: since },
        },
        select: { correct: true },
      });
      const avgQuizScore =
        attempts.length > 0
          ? Math.round(
              (attempts.filter((a) => a.correct).length / attempts.length) *
                100
            )
          : 0;

      const topCourses = courses
        .map((c) => {
          const meanPct =
            c.enrollments.length > 0
              ? Math.round(
                  c.enrollments.reduce((a, e) => a + e.progressPct, 0) /
                    c.enrollments.length
                )
              : 0;
          return {
            title: c.title,
            students: c.enrollments.length,
            completionPct: meanPct,
          };
        })
        .sort((a, b) => b.students - a.students)
        .slice(0, 3);

      // Compute worst funnel stage (deterministic — same logic as
      // teacher.analytics).
      const totalE = allEnrollments.length || 1;
      const buckets = [0, 1, 25, 50, 75, 90, 100];
      const labels = [
        "Enrolled",
        "Started L1",
        "Finished U1",
        "Finished U2",
        "Quiz · Eq. 2-step",
        "Capstone",
        "Completed",
      ];
      const stages = buckets.map((threshold, i) => {
        const count = allEnrollments.filter(
          (e) => e.progressPct >= threshold
        ).length;
        return { label: labels[i], pct: Math.round((count / totalE) * 100), count };
      });
      let worstNamed: { stage: string; pct: number; count: number } | null =
        null;
      let maxDrop = 0;
      for (let i = 1; i < stages.length; i++) {
        const d = stages[i - 1].pct - stages[i].pct;
        if (d > maxDrop) {
          maxDrop = d;
          worstNamed = {
            stage: stages[i].label,
            pct: stages[i].pct,
            count: stages[i].count,
          };
        }
      }

      let items: InsightItem[];
      let mode: "claude" | "demo";

      if (isClaudeEnabled() && totalStudents > 0) {
        const client = getClaude()!;
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 700,
          system: TEACHER_INSIGHT_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildTeacherInsightPrompt({
                teacherName:
                  ctx.session.user.name ?? ctx.session.user.email ?? "Teacher",
                rangeDays: input.rangeDays,
                totalStudents,
                activeStudents,
                avgQuizScore,
                topCourses,
                worstFunnel: worstNamed,
              }),
            },
          ],
          output_config: {
            format: { type: "json_schema", schema: INSIGHT_JSON_SCHEMA },
          },
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const parsed = InsightBatchSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `AI returned invalid insights: ${parsed.error.message}`,
          });
        }
        items = parsed.data.insights;
        // Coerce kinds to expected set; fall back to demo for any unknowns.
        for (const it of items) {
          if (!TEACHER_KINDS.has(it.kind)) {
            it.kind = it.kind.toUpperCase().replace(/[^A-Z_]/g, "");
          }
        }
        if (items.filter((i) => TEACHER_KINDS.has(i.kind)).length !== 3) {
          items = buildDemoTeacherInsights({
            totalStudents,
            activeStudents,
            avgQuizScore,
            topCourses,
            worstFunnel: worstNamed,
          });
          mode = "demo";
        } else {
          mode = "claude";
        }
      } else {
        items = buildDemoTeacherInsights({
          totalStudents,
          activeStudents,
          avgQuizScore,
          topCourses,
          worstFunnel: worstNamed,
        });
        mode = "demo";
      }

      // Replace cached rows atomically.
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
      await ctx.db.$transaction([
        ctx.db.insight.deleteMany({
          where: { audience: "teacher", scope },
        }),
        ...items.map((it) =>
          ctx.db.insight.create({
            data: {
              audience: "teacher",
              scope,
              kind: it.kind,
              body: it.body,
              cta: it.cta ?? null,
              payload: {
                rangeDays: input.rangeDays,
                stats: {
                  totalStudents,
                  activeStudents,
                  avgQuizScore,
                  worstFunnel: worstNamed,
                },
                mode,
              },
              expiresAt,
            },
          })
        ),
      ]);

      await audit({
        actorId: ctx.user.id,
        kind: "ai.suggest_fix",
        payload: {
          variant: "regenerate_teacher_insights",
          courseCount: courses.length,
          totalStudents,
          activeStudents,
          mode,
          elapsedMs: Date.now() - t0,
        },
      });

      return {
        insights: items.map((i) => ({
          kind: i.kind,
          body: i.body,
          cta: i.cta ?? null,
        })),
        generatedAt: new Date().toISOString(),
        fromCache: false,
        mode,
      };
    }),

  /** Generate (or regenerate) admin insights. Caches for 24h. */
  regenerateAdmin: adminProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const t0 = Date.now();

      const me = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { institutionId: true },
      });
      const institutionId =
        me?.institutionId ??
        (
          await ctx.db.institution.findFirst({
            select: { id: true },
          })
        )?.id;
      if (!institutionId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No institution attached to this admin.",
        });
      }
      const scope = `ADMIN:${institutionId}`;
      const institution = await ctx.db.institution.findUnique({
        where: { id: institutionId },
      });

      const [studentCount, teacherCount, classCount, attempts, teachers, curriculaCount] =
        await Promise.all([
          ctx.db.user.count({
            where: { role: "STUDENT", institutionId },
          }),
          ctx.db.user.count({
            where: { role: "TEACHER", institutionId },
          }),
          ctx.db.class.count({ where: { institutionId } }),
          ctx.db.attempt.findMany({
            where: { user: { institutionId } },
            select: { correct: true },
            take: 1000,
          }),
          ctx.db.user.findMany({
            where: { role: "TEACHER", institutionId },
            select: {
              name: true,
              firstName: true,
              taughtClasses: {
                select: { _count: { select: { students: true } } },
              },
            },
            take: 5,
          }),
          ctx.db.enrollment
            .groupBy({
              by: ["courseId"],
              where: { user: { institutionId } },
            })
            .then((g) => g.length),
        ]);

      const avgQuizScore =
        attempts.length > 0
          ? Math.round(
              (attempts.filter((a) => a.correct).length / attempts.length) *
                100
            )
          : 0;
      const topTeachers = teachers
        .map((t) => ({
          name: t.name ?? t.firstName ?? "—",
          classes: t.taughtClasses.length,
          students: t.taughtClasses.reduce(
            (a, c) => a + c._count.students,
            0
          ),
        }))
        .sort((a, b) => b.students - a.students)
        .slice(0, 3);

      let items: InsightItem[];
      let mode: "claude" | "demo";

      if (isClaudeEnabled() && (studentCount > 0 || teacherCount > 0)) {
        const client = getClaude()!;
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 700,
          system: ADMIN_INSIGHT_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildAdminInsightPrompt({
                institutionName: institution?.name ?? "the institution",
                studentCount,
                teacherCount,
                classCount,
                avgQuizScore,
                topTeachers,
                curriculaCount,
              }),
            },
          ],
          output_config: {
            format: { type: "json_schema", schema: INSIGHT_JSON_SCHEMA },
          },
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const parsed = InsightBatchSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `AI returned invalid insights: ${parsed.error.message}`,
          });
        }
        items = parsed.data.insights;
        for (const it of items) {
          if (!ADMIN_KINDS.has(it.kind)) {
            it.kind = it.kind.toUpperCase().replace(/[^A-Z_]/g, "");
          }
        }
        if (items.filter((i) => ADMIN_KINDS.has(i.kind)).length !== 3) {
          items = buildDemoAdminInsights({
            studentCount,
            teacherCount,
            avgQuizScore,
            topTeachers,
          });
          mode = "demo";
        } else {
          mode = "claude";
        }
      } else {
        items = buildDemoAdminInsights({
          studentCount,
          teacherCount,
          avgQuizScore,
          topTeachers,
        });
        mode = "demo";
      }

      const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
      await ctx.db.$transaction([
        ctx.db.insight.deleteMany({
          where: { audience: "admin", scope },
        }),
        ...items.map((it) =>
          ctx.db.insight.create({
            data: {
              audience: "admin",
              scope,
              kind: it.kind,
              body: it.body,
              cta: it.cta ?? null,
              payload: {
                stats: {
                  studentCount,
                  teacherCount,
                  classCount,
                  avgQuizScore,
                  topTeacherCount: topTeachers.length,
                },
                mode,
              },
              expiresAt,
            },
          })
        ),
      ]);

      await audit({
        actorId: ctx.user.id,
        kind: "ai.suggest_fix",
        payload: {
          variant: "regenerate_admin_insights",
          institutionId,
          studentCount,
          teacherCount,
          mode,
          elapsedMs: Date.now() - t0,
        },
      });

      return {
        insights: items.map((i) => ({
          kind: i.kind,
          body: i.body,
          cta: i.cta ?? null,
        })),
        generatedAt: new Date().toISOString(),
        fromCache: false,
        mode,
      };
    }),

  /** Public read-only health hint for components. */
  health: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.insight.count({
      where: { expiresAt: { gt: new Date() } },
    });
    return { activeCount: count };
  }),
});
