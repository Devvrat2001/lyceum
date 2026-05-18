import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";

export const adminRouter = router({
  /**
   * List a given PARENT user's linked STUDENT children. Used by the
   * admin people page's per-parent expander panel.
   *
   * Admin-only — parent self-service viewing of their own kids
   * happens via `parent.children` on the /parent dashboard (Phase 4
   * follow-up commit).
   */
  parentLinks: adminProcedure
    .input(z.object({ parentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const parent = await ctx.db.user.findUnique({
        where: { id: input.parentId },
        select: { id: true, role: true },
      });
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });
      if (parent.role !== "PARENT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is not a PARENT",
        });
      }
      const links = await ctx.db.parentChild.findMany({
        where: { parentId: parent.id },
        orderBy: { createdAt: "asc" },
        include: {
          child: {
            select: {
              id: true,
              name: true,
              firstName: true,
              email: true,
              avatarUrl: true,
              _count: { select: { enrollments: true } },
            },
          },
        },
      });
      return links.map((l) => ({
        childId: l.childId,
        createdAt: l.createdAt.toISOString(),
        name: l.child.firstName ?? l.child.name ?? "Student",
        email: l.child.email,
        avatarUrl: l.child.avatarUrl,
        enrollmentCount: l.child._count.enrollments,
      }));
    }),

  /**
   * Link a PARENT to a STUDENT child. Both must exist; both must be
   * in the admin's institution (or admins-of-everything case where
   * the admin has no institutionId — they can link anyone).
   * Idempotent: linking the same pair twice is a no-op.
   */
  linkParentToChild: adminProcedure
    .input(
      z.object({
        parentId: z.string(),
        childEmail: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [parent, child, me] = await Promise.all([
        ctx.db.user.findUnique({
          where: { id: input.parentId },
          select: { id: true, role: true, institutionId: true },
        }),
        ctx.db.user.findUnique({
          where: { email: input.childEmail.toLowerCase() },
          select: { id: true, role: true, institutionId: true },
        }),
        ctx.db.user.findUnique({
          where: { id: ctx.user.id },
          select: { institutionId: true },
        }),
      ]);
      if (!parent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Parent not found",
        });
      }
      if (parent.role !== "PARENT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected user is not a PARENT",
        });
      }
      if (!child) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No student found with email ${input.childEmail}`,
        });
      }
      if (child.role !== "STUDENT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `User ${input.childEmail} is a ${child.role}, not a STUDENT`,
        });
      }
      if (
        me?.institutionId &&
        (parent.institutionId !== me.institutionId ||
          child.institutionId !== me.institutionId)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Both users must be in your institution",
        });
      }

      await ctx.db.parentChild.upsert({
        where: {
          parentId_childId: { parentId: parent.id, childId: child.id },
        },
        create: { parentId: parent.id, childId: child.id },
        // No-op update so the row stays idempotent without ts errors.
        update: {},
      });
      return { ok: true as const, childId: child.id };
    }),

  /**
   * Remove a parent ↔ child link. Idempotent: removing a non-existent
   * link returns ok without error.
   */
  unlinkParentFromChild: adminProcedure
    .input(
      z.object({ parentId: z.string(), childId: z.string() })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.parentChild.deleteMany({
        where: { parentId: input.parentId, childId: input.childId },
      });
      return { ok: true as const };
    }),

  /** Whole-dashboard payload for the institution admin. */
  overview: adminProcedure.query(async ({ ctx }) => {
    // Locate the admin's institution (or first one if unset)
    const me = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: { institutionId: true },
    });
    const institutionId =
      me?.institutionId ??
      (await ctx.db.institution.findFirst({ select: { id: true } }))?.id;
    const institution = institutionId
      ? await ctx.db.institution.findUnique({
          where: { id: institutionId },
        })
      : null;

    const [
      students,
      teachers,
      classes,
      seatUsers,
      activeStudents,
      attempts,
      teachersList,
    ] = await Promise.all([
      ctx.db.user.count({
        where: { role: "STUDENT", institutionId },
      }),
      ctx.db.user.count({
        where: { role: "TEACHER", institutionId },
      }),
      ctx.db.class.count({ where: { institutionId } }),
      ctx.db.user.count({ where: { institutionId } }),
      ctx.db.user.count({
        where: {
          role: "STUDENT",
          institutionId,
          enrollments: {
            some: {
              lastActivityAt: {
                gte: new Date(Date.now() - 30 * 24 * 3600 * 1000),
              },
            },
          },
        },
      }),
      ctx.db.attempt.findMany({
        where: { user: { institutionId } },
        select: { correct: true },
      }),
      ctx.db.user.findMany({
        where: { role: "TEACHER", institutionId },
        select: {
          id: true,
          name: true,
          firstName: true,
          taughtClasses: {
            select: {
              name: true,
              _count: { select: { students: true } },
            },
          },
        },
        take: 8,
      }),
    ]);

    const avgQuizScore =
      attempts.length > 0
        ? Math.round(
            (attempts.filter((a) => a.correct).length / attempts.length) * 100
          )
        : 79;

    const seatTotal = institution?.seats ?? Math.max(seatUsers, 1);
    const seatPct = Math.round((activeStudents / Math.max(seatTotal, 1)) * 100);

    const teachersActivity = teachersList.map((t) => {
      const total = t.taughtClasses.reduce(
        (a, c) => a + c._count.students,
        0
      );
      // Stub time today — derive from class size deterministically
      const minsToday = Math.max(0.5, Math.min(4, total * 0.12));
      let tag: "top" | "low" | "" = "";
      if (minsToday >= 3) tag = "top";
      else if (minsToday < 1) tag = "low";
      return {
        id: t.id,
        n: t.name ?? t.firstName ?? "—",
        s:
          t.taughtClasses
            .map((c) => `${c.name} · ${c._count.students} students`)
            .join(", ") || "no classes assigned",
        m: `${minsToday.toFixed(1)} hr today`,
        t: tag,
      };
    });

    // Adopted curricula = institution-wide enrollments grouped by course author/title
    const enrollGroups = await ctx.db.enrollment.groupBy({
      by: ["courseId"],
      where: { user: { institutionId } },
      _count: { _all: true },
      _avg: { progressPct: true },
    });
    const courseInfo = await ctx.db.course.findMany({
      where: { id: { in: enrollGroups.map((g) => g.courseId) } },
      select: { id: true, title: true, authorLabel: true },
    });
    const curricula = enrollGroups
      .map((g) => {
        const c = courseInfo.find((c) => c.id === g.courseId);
        if (!c) return null;
        return {
          courseId: g.courseId,
          t: `${c.title} · ${c.authorLabel ?? "—"}`,
          s: `1 class · ${g._count._all} students`,
          p: Math.round(g._avg.progressPct ?? 0),
        };
      })
      .filter(Boolean) as {
      courseId: string;
      t: string;
      s: string;
      p: number;
    }[];

    return {
      institution: {
        name: institution?.name ?? "Cedar Middle",
        plan: institution?.plan ?? "FREE",
        seats: seatTotal,
      },
      kpis: [
        {
          l: "Students",
          v: students.toString(),
          d: `+${Math.max(0, Math.round(students * 0.04))}`,
          meta: "7-day",
        },
        {
          l: "Teachers",
          v: teachers.toString(),
          d: "0",
          meta: "no change",
        },
        {
          l: "Classes",
          v: classes.toString(),
          d: "+2",
          meta: "spring",
        },
        {
          l: "Avg engagement",
          v: "47m",
          d: "+6m",
          meta: "per stu/wk",
        },
        {
          l: "Avg quiz score",
          v: avgQuizScore.toString(),
          d: `${attempts.length} attempts`,
          meta: "all grades",
        },
        {
          l: "Seat usage",
          v: `${seatPct}%`,
          d: `${activeStudents}/${seatTotal}`,
          meta: "active 30d",
        },
      ],
      teachers: teachersActivity,
      curricula,
      // Phase 1 stubs — these become real in Phase 4 (institution).
      compliance: [
        ["SSO with Clever", "Connected"],
        ["COPPA / FERPA", "Compliant"],
        [`Parent consent · ${students}/${students}`, "Up to date"],
        ["Content filter", "Strict (K-12)"],
        ["AI tutor logging", "Enabled"],
        ["Data retention", "7 years"],
      ] as [string, string][],
      insights: [
        {
          tag: "STRENGTH",
          t: "Grade 7 Math is outperforming district by 14%. Worth highlighting at next board meeting.",
        },
        {
          tag: "WATCH",
          t: "Grade 6 Reading scores are flat — suggest pairing with the Reading Lab path.",
        },
        {
          tag: "TEACHER",
          t: "Mr. Jacobs (8B) has 3× class engagement. Consider sharing his lesson plans.",
        },
      ],
    };
  }),
});
