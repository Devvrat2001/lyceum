import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";

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
        await ctx.db.enrollment.upsert({
          where: {
            userId_courseId: { userId: ctx.user.id, courseId: course.id },
          },
          update: { lastActivityAt: new Date() },
          create: {
            userId: ctx.user.id,
            courseId: course.id,
            lastActivityAt: new Date(),
          },
        });
        enrolled += 1;
        if (!firstLessonSlug) {
          firstLessonSlug = course.units[0]?.lessons[0]?.slug ?? null;
        }
      }

      return { ok: true as const, enrolled, saved, firstLessonSlug };
    }),
});
