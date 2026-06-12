import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, teacherProcedure } from "../trpc";

/**
 * Teacher-posted assignments (REQUIREMENTS R12). v1 semantics: an
 * assignment says "do this lesson by the due date" — it always targets
 * one lesson in one of the teacher's courses. Students enrolled in that
 * course see it on the dashboard's "Due this week" card
 * (student.dashboard); completion is derived from LessonProgress, and
 * the bonus XP is awarded once by lesson.markComplete.
 */
export const assignmentRouter = router({
  create: teacherProcedure
    .input(
      z.object({
        lessonId: z.string().min(1),
        title: z.string().trim().min(1).max(160),
        instructions: z.string().trim().max(2000).optional(),
        // Client sends an ISO string from <input type="date">; coerce
        // accepts that or a superjson Date.
        dueAt: z.coerce.date(),
        xp: z.number().int().min(0).max(200).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.db.lesson.findUnique({
        where: { id: input.lessonId },
        select: {
          id: true,
          unit: {
            select: {
              course: { select: { id: true, authorId: true } },
            },
          },
        },
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      const course = lesson.unit.course;
      if (ctx.user.role !== "ADMIN" && course.authorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // A whole-day-stale due date is a typo, not a policy choice —
      // same-day posting (even late evening) stays allowed.
      if (input.dueAt.getTime() < Date.now() - 24 * 3600 * 1000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Due date is in the past.",
        });
      }
      const assignment = await ctx.db.assignment.create({
        data: {
          // Attribute to the course's author even when an ADMIN posts —
          // the assignment belongs to the teacher's course surface.
          teacherId: course.authorId,
          courseId: course.id,
          lessonId: lesson.id,
          title: input.title,
          instructions: input.instructions?.trim() || null,
          dueAt: input.dueAt,
          xp: input.xp,
        },
        select: { id: true, title: true, dueAt: true, xp: true },
      });
      return { ok: true as const, assignment };
    }),

  /**
   * The teacher's posted assignments with live completion counts:
   * completed = enrolled students who have a LessonProgress row on the
   * target lesson. Admin sees all assignments platform-wide.
   */
  listMine: teacherProcedure.query(async ({ ctx }) => {
    const where =
      ctx.user.role === "ADMIN" ? {} : { teacherId: ctx.user.id };
    const rows = await ctx.db.assignment.findMany({
      where,
      orderBy: { dueAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        instructions: true,
        dueAt: true,
        xp: true,
        createdAt: true,
        course: { select: { id: true, title: true, enrollCount: true } },
        lesson: { select: { id: true, title: true, slug: true } },
      },
    });
    const completedCounts = await Promise.all(
      rows.map((a) =>
        ctx.db.lessonProgress.count({
          where: {
            lessonId: a.lesson.id,
            user: { enrollments: { some: { courseId: a.course.id } } },
          },
        })
      )
    );
    return rows.map((a, i) => ({
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      dueAt: a.dueAt,
      xp: a.xp,
      createdAt: a.createdAt,
      courseTitle: a.course.title,
      lessonTitle: a.lesson.title,
      lessonSlug: a.lesson.slug,
      enrolled: a.course.enrollCount,
      completed: completedCounts[i],
    }));
  }),

  delete: teacherProcedure
    .input(z.object({ assignmentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await ctx.db.assignment.findUnique({
        where: { id: input.assignmentId },
        select: { id: true, teacherId: true },
      });
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        assignment.teacherId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db.assignment.delete({ where: { id: assignment.id } });
      return { ok: true as const };
    }),

  /**
   * Course → lessons options for the create form's picker, one query.
   */
  lessonOptions: teacherProcedure.query(async ({ ctx }) => {
    const where =
      ctx.user.role === "ADMIN" ? {} : { authorId: ctx.user.id };
    const courses = await ctx.db.course.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        units: {
          orderBy: { order: "asc" },
          select: {
            lessons: {
              orderBy: { order: "asc" },
              select: { id: true, title: true },
            },
          },
        },
      },
    });
    return courses.map((c) => ({
      courseId: c.id,
      courseTitle: c.title,
      lessons: c.units.flatMap((u) => u.lessons),
    }));
  }),
});
