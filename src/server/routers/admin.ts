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

    // Real average when we have any attempts; null lets the page
    // render "—" instead of the prototype's hardcoded 79.
    const avgQuizScore =
      attempts.length > 0
        ? Math.round(
            (attempts.filter((a) => a.correct).length / attempts.length) * 100
          )
        : null;

    const seatTotal = institution?.seats ?? Math.max(seatUsers, 1);
    const seatPct = Math.round((activeStudents / Math.max(seatTotal, 1)) * 100);

    const teachersActivity = teachersList.map((t) => {
      const studentTotal = t.taughtClasses.reduce(
        (a, c) => a + c._count.students,
        0
      );
      return {
        id: t.id,
        n: t.name ?? t.firstName ?? "—",
        s:
          t.taughtClasses
            .map((c) => `${c.name} · ${c._count.students} students`)
            .join(", ") || "no classes assigned",
        // Used to show `${minsToday} hr today` derived from class
        // size via `total * 0.12` — fake activity. Now shows the
        // real student count so the right-side label means something.
        m:
          studentTotal === 0
            ? "no students"
            : `${studentTotal} student${studentTotal === 1 ? "" : "s"}`,
        t: "" as "top" | "low" | "",
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
        // Real institution name when one exists; null lets the page
        // render a generic header instead of the prototype's
        // hardcoded "Cedar Middle" fallback.
        name: institution?.name ?? null,
        plan: institution?.plan ?? "FREE",
        seats: seatTotal,
      },
      // Only KPIs we can compute from real data. The prototype shipped
      // a hardcoded "Avg engagement: 47m / +6m" tile and arbitrary
      // deltas (`+spring`, `+4% 7-day` derived from multiplying counts)
      // — those are gone. Empty `d` / `meta` strings render nothing.
      kpis: [
        { l: "Students", v: students.toString(), d: "", meta: "" },
        { l: "Teachers", v: teachers.toString(), d: "", meta: "" },
        { l: "Classes", v: classes.toString(), d: "", meta: "" },
        {
          l: "Avg quiz score",
          v: avgQuizScore === null ? "—" : `${avgQuizScore}%`,
          d: "",
          meta: `${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`,
        },
        {
          l: "Seat usage",
          v: `${seatPct}%`,
          d: "",
          meta: `${activeStudents}/${seatTotal} · active 30d`,
        },
      ],
      teachers: teachersActivity,
      curricula,
      // The prototype shipped a hardcoded compliance block ("SSO with
      // Clever · Connected", "COPPA · Compliant", "Parent consent ·
      // N/N", etc.) that didn't reflect any real configuration. Real
      // institution-flag wiring is Phase 4; until then the page
      // renders an empty-state card.
      compliance: [] as [string, string][],
    };
  }),
});
