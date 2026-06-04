import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  protectedProcedure,
  router,
  teacherProcedure,
} from "../trpc";
import {
  generateAdminInsights,
  generateTeacherInsights,
} from "@/server/services/insightEngine";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";

export const insightRouter = router({
  /**
   * Read the freshest cached insights for a teacher. Returns the
   * cache row (no AI call). Returns null when the cache is stale/empty
   * or forceRefresh is set — the client then calls regenerateTeacher.
   */
  forTeacher: teacherProcedure
    .input(z.object({ forceRefresh: z.boolean().default(false) }).optional())
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
    .input(z.object({ forceRefresh: z.boolean().default(false) }).optional())
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

  /**
   * Generate (or regenerate) teacher insights. The generation core lives in
   * `insightEngine` (shared with the nightly cron); this wrapper adds the
   * per-user rate limit + audit. Caches for 24h.
   */
  regenerateTeacher: teacherProcedure
    .input(
      z.object({ rangeDays: z.number().int().min(1).max(180).default(30) })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const t0 = Date.now();
      const { items, mode, stats } = await generateTeacherInsights(ctx.db, {
        teacherId: ctx.user.id,
        teacherName:
          ctx.session.user.name ?? ctx.session.user.email ?? "Teacher",
        isAdmin: ctx.user.role === "ADMIN",
        rangeDays: input.rangeDays,
      });

      await audit({
        actorId: ctx.user.id,
        kind: "ai.suggest_fix",
        payload: {
          variant: "regenerate_teacher_insights",
          courseCount: stats.courseCount,
          totalStudents: stats.totalStudents,
          activeStudents: stats.activeStudents,
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
        (await ctx.db.institution.findFirst({ select: { id: true } }))?.id;
      if (!institutionId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No institution attached to this admin.",
        });
      }

      const { items, mode, stats } = await generateAdminInsights(ctx.db, {
        institutionId,
      });

      await audit({
        actorId: ctx.user.id,
        kind: "ai.suggest_fix",
        payload: {
          variant: "regenerate_admin_insights",
          institutionId,
          studentCount: stats.studentCount,
          teacherCount: stats.teacherCount,
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
