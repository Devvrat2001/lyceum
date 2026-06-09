import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  teacherProcedure,
} from "../trpc";
import { ensureEnrollment } from "../services/enrollment";
import { slugify } from "@/lib/slugify";

export const pathRouter = router({
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const path = await ctx.db.path.findUnique({
        where: { slug: input.slug },
        include: {
          courses: {
            orderBy: { order: "asc" },
            include: {
              course: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  priceCents: true,
                  authorLabel: true,
                  ratingAvg: true,
                  tag: true,
                },
              },
            },
          },
        },
      });
      if (!path) throw new TRPCError({ code: "NOT_FOUND" });
      return path;
    }),

  /**
   * Bulk-enroll in every (free) course in a path. Paid courses inside the
   * path are tracked as "saved" until Phase 3 Stripe Checkout lands.
   * Returns the slug of the first lesson the student should land on.
   */
  enroll: protectedProcedure
    .input(z.object({ pathId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const path = await ctx.db.path.findUnique({
        where: { id: input.pathId },
        include: {
          courses: {
            orderBy: { order: "asc" },
            include: {
              course: {
                include: {
                  units: {
                    orderBy: { order: "asc" },
                    include: {
                      lessons: { orderBy: { order: "asc" }, take: 1 },
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
      if (!path) throw new TRPCError({ code: "NOT_FOUND" });

      let firstLessonSlug: string | null = null;
      let enrolled = 0;
      let saved = 0;

      for (const pc of path.courses) {
        const course = pc.course;
        if (course.priceCents > 0) {
          saved += 1;
          continue;
        }
        await ensureEnrollment(ctx.db, ctx.user.id, course.id, {
          lastActivityAt: new Date(),
        });
        enrolled += 1;
        if (!firstLessonSlug) {
          firstLessonSlug = course.units[0]?.lessons[0]?.slug ?? null;
        }
      }

      return { ok: true as const, enrolled, saved, firstLessonSlug };
    }),

  /**
   * Published courses the signed-in teacher can put in a bundle —
   * feeds the course picker on /teacher/paths.
   */
  myEligibleCourses: teacherProcedure.query(({ ctx }) =>
    ctx.db.course.findMany({
      where: { authorId: ctx.user.id, status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, priceCents: true },
    })
  ),

  /** The signed-in teacher's own bundles, with their ordered courses. */
  myPaths: teacherProcedure.query(({ ctx }) =>
    ctx.db.path.findMany({
      where: { authorId: ctx.user.id },
      orderBy: { title: "asc" },
      include: {
        courses: {
          orderBy: { order: "asc" },
          include: {
            course: { select: { id: true, title: true, priceCents: true } },
          },
        },
      },
    })
  ),

  /**
   * Create a multi-course bundle from the teacher's own published
   * courses. `courseIds` is ordered — the index becomes the path's
   * course order. `saveLabel` is computed against the sum of the
   * individual course prices so the homepage card's "Save N%" is honest.
   */
  create: teacherProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(120),
        subtitle: z.string().trim().max(160).optional(),
        priceCents: z.number().int().min(0).max(500_000),
        courseIds: z.array(z.string().min(1)).min(2).max(12),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = Array.from(new Set(input.courseIds));
      if (ids.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick at least 2 distinct courses for a bundle.",
        });
      }
      const owned = await ctx.db.course.findMany({
        where: { id: { in: ids }, authorId: ctx.user.id, status: "PUBLISHED" },
        select: { id: true, priceCents: true },
      });
      if (owned.length !== ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bundles can only contain your own published courses.",
        });
      }

      const sumCents = owned.reduce((a, c) => a + c.priceCents, 0);
      const saveLabel =
        sumCents > 0 && input.priceCents < sumCents
          ? `Save ${Math.round((1 - input.priceCents / sumCents) * 100)}%`
          : null;

      const baseSlug = slugify(input.title) || "path";
      let slug = baseSlug;
      let n = 2;
      while (
        await ctx.db.path.findUnique({ where: { slug }, select: { id: true } })
      ) {
        slug = `${baseSlug}-${n}`;
        n += 1;
      }

      return ctx.db.path.create({
        data: {
          slug,
          title: input.title,
          subtitle:
            input.subtitle && input.subtitle.length > 0
              ? input.subtitle
              : `${ids.length} courses`,
          priceCents: input.priceCents,
          saveLabel,
          authorId: ctx.user.id,
          courses: {
            create: ids.map((courseId, i) => ({ courseId, order: i + 1 })),
          },
        },
        include: { courses: { orderBy: { order: "asc" } } },
      });
    }),

  /**
   * Delete one of the teacher's own bundles. Platform-curated paths
   * (authorId null — the seeded ones) are not deletable here.
   * PathCourse rows cascade; enrollments are per-course and untouched.
   */
  remove: teacherProcedure
    .input(z.object({ pathId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const path = await ctx.db.path.findUnique({
        where: { id: input.pathId },
        select: { id: true, authorId: true },
      });
      if (!path) throw new TRPCError({ code: "NOT_FOUND" });
      if (path.authorId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own bundles.",
        });
      }
      await ctx.db.path.delete({ where: { id: path.id } });
      return { ok: true as const };
    }),
});
