import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";

async function enrollOne(
  db: import("@prisma/client").PrismaClient,
  userId: string,
  courseId: string
) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" }, take: 1 },
        },
        take: 1,
      },
    },
  });
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  if (course.priceCents > 0) {
    throw new TRPCError({
      code: "PAYMENT_REQUIRED" as never,
      message: "Paid courses require Stripe checkout (Phase 3).",
    });
  }
  await db.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { lastActivityAt: new Date() },
    create: { userId, courseId, lastActivityAt: new Date() },
  });
  return {
    course,
    firstLesson: course.units[0]?.lessons[0] ?? null,
  };
}

export const courseRouter = router({
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { slug: input.slug },
        include: {
          author: { select: { name: true, firstName: true } },
          units: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  isPreview: true,
                  durationMin: true,
                },
              },
            },
          },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      return course;
    }),

  reviews: publicProcedure
    .input(z.object({ courseId: z.string(), limit: z.number().int().max(20).default(6) }))
    .query(({ ctx, input }) =>
      ctx.db.review.findMany({
        where: { courseId: input.courseId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      })
    ),

  /**
   * Return the set of course ids the current viewer is enrolled in.
   * Used by list surfaces (marketplace homepage, search results) to
   * badge cards the student already owns so we never invite them to
   * re-purchase a course visible in their library.
   *
   * publicProcedure on purpose — anon visitors get [] rather than a
   * 401 so the marketplace stays browseable without sign-in.
   */
  myEnrolledIds: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) return [] as string[];
    const rows = await ctx.db.enrollment.findMany({
      where: { userId: ctx.session.user.id },
      select: { courseId: true },
    });
    return rows.map((r) => r.courseId);
  }),

  /**
   * Per-user enrollment status for a course. Used by the course detail
   * page to flip the EnrollPanel from "Buy/Enroll" to "Continue learning"
   * once the student already owns the course.
   *
   * publicProcedure on purpose — anon visitors see the course page and
   * should get `{ isEnrolled: false }` rather than a 401. The
   * firstLessonSlug is returned so the UI can deep-link straight into
   * the first lesson.
   */
  myStatus: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ ctx, input }) => {
      // First lesson lookup is shared between branches — compute once.
      const firstLesson = await ctx.db.lesson.findFirst({
        where: { unit: { courseId: input.courseId } },
        orderBy: [{ unit: { order: "asc" } }, { order: "asc" }],
        select: { slug: true },
      });
      const firstLessonSlug = firstLesson?.slug ?? null;

      if (!ctx.session?.user) {
        return { isEnrolled: false as const, firstLessonSlug };
      }

      const enrollment = await ctx.db.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: ctx.session.user.id,
            courseId: input.courseId,
          },
        },
        select: { id: true },
      });
      return {
        isEnrolled: enrollment !== null,
        firstLessonSlug,
      };
    }),

  /**
   * Phase-1: free-only enrollment. Paid checkout = Phase 3.
   * Returns the slug of the first lesson so the client can route there.
   */
  enroll: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { firstLesson } = await enrollOne(
        ctx.db,
        ctx.user.id,
        input.courseId
      );
      return {
        ok: true as const,
        firstLessonSlug: firstLesson?.slug ?? null,
        firstLessonId: firstLesson?.id ?? null,
      };
    }),

  /** "Add to library" — saves to enrollments without redirecting away. */
  addToLibrary: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // For free courses this is equivalent to enroll. For paid, surface a
      // softer "saved for later" without throwing — we add a record but
      // mark progress 0 and don't redirect.
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, priceCents: true },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      if (course.priceCents > 0) {
        // Paid: until Phase 3 we just signal "saved". No real wishlist
        // table yet — Phase 3 adds one.
        return { ok: true as const, saved: true as const };
      }
      await ctx.db.enrollment.upsert({
        where: {
          userId_courseId: { userId: ctx.user.id, courseId: course.id },
        },
        update: {},
        create: {
          userId: ctx.user.id,
          courseId: course.id,
        },
      });
      return { ok: true as const, saved: false as const };
    }),
});
