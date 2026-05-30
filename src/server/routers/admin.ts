import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, adminProcedure } from "../trpc";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week containing `d` (ISO week start — the
 *  same boundary Postgres `date_trunc('week', ...)` uses, so JS-side
 *  bucket keys line up with the SQL `to_char(...)` keys). */
function mondayUTC(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/** Period-over-period change descriptor for a KPI tile. `prev === 0`
 *  with a non-zero current is "new" (can't express ∞%); both zero is a
 *  flat dash. */
function trendOf(
  cur: number,
  prev: number
): { trend: "up" | "down" | "flat"; label: string } {
  if (prev === 0) {
    if (cur === 0) return { trend: "flat", label: "—" };
    return { trend: "up", label: "new" };
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { trend: "flat", label: "0%" };
  return { trend: pct > 0 ? "up" : "down", label: `${pct > 0 ? "+" : ""}${pct}%` };
}

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

  /**
   * Deep-dive analytics for the institution admin. Everything here is
   * computed from real rows — weekly time-series (signups / enrollments
   * / attempts + accuracy / active learners / XP), per-subject + per-
   * grade rollups, a top-courses leaderboard, and an enrolment funnel.
   *
   * `weeks` is the current window; we also fetch the equal-length prior
   * window so every KPI shows a real period-over-period delta. All
   * scoping is by the institution's *students* (enrolments + attempts
   * of `institutionId` users), mirroring how `overview` defines
   * "adopted curricula" — marketplace course authors live outside the
   * institution, so author-scoping would be wrong.
   */
  analytics: adminProcedure
    .input(
      z.object({
        weeks: z
          .union([z.literal(12), z.literal(26), z.literal(52)])
          .default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const { weeks } = input;

      const me = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { institutionId: true },
      });
      const institutionId =
        me?.institutionId ??
        (await ctx.db.institution.findFirst({ select: { id: true } }))?.id ??
        null;
      const institution = institutionId
        ? await ctx.db.institution.findUnique({
            where: { id: institutionId },
            select: { name: true },
          })
        : null;

      // Dense, Monday-anchored UTC week buckets spanning the current
      // period plus an equal prior period (used only for deltas).
      const thisMonday = mondayUTC(new Date());
      const totalWeeks = weeks * 2;
      const allKeys: string[] = [];
      for (let i = totalWeeks - 1; i >= 0; i--) {
        allKeys.push(
          new Date(thisMonday.getTime() - i * WEEK_MS)
            .toISOString()
            .slice(0, 10)
        );
      }
      const priorKeys = allKeys.slice(0, weeks);
      const currentKeys = allKeys.slice(weeks);
      const windowStart = new Date(
        thisMonday.getTime() - (totalWeeks - 1) * WEEK_MS
      );
      const currentStart = new Date(
        thisMonday.getTime() - (weeks - 1) * WEEK_MS
      );

      // No institution at all (fresh DB) → render a graceful zero-state
      // rather than running ten queries against a null scope.
      if (!institutionId) {
        const zeroKpi = (label: string) => ({
          label,
          value: "0",
          deltaLabel: "—",
          trend: "flat" as const,
          meta: "no data yet",
        });
        return {
          weeks,
          institution: { name: institution?.name ?? null },
          kpis: [
            zeroKpi("Active learners"),
            zeroKpi("Enrollments"),
            zeroKpi("Attempts"),
            zeroKpi("Avg accuracy"),
            zeroKpi("XP earned"),
            zeroKpi("New signups"),
          ],
          series: currentKeys.map((weekStart) => ({
            weekStart,
            attempts: 0,
            correct: 0,
            accuracyPct: null as number | null,
            activeLearners: 0,
            enrollments: 0,
            signups: 0,
            xp: 0,
          })),
          bySubject: [] as Array<{
            subject: string;
            courses: number;
            enrollments: number;
            avgCompletion: number;
            completed: number;
            accuracyPct: number | null;
          }>,
          byGrade: [] as Array<{
            grade: string;
            enrollments: number;
            avgCompletion: number;
            completed: number;
          }>,
          topCourses: [] as Array<{
            id: string;
            title: string;
            subject: string;
            grade: string;
            enrollments: number;
            completionPct: number;
            avgProgress: number;
            accuracyPct: number | null;
          }>,
          funnel: [
            { label: "Enrolled", count: 0, pct: 0 },
            { label: "Started", count: 0, pct: 0 },
            { label: "Halfway", count: 0, pct: 0 },
            { label: "Completed", count: 0, pct: 0 },
          ],
        };
      }

      const [
        signupWeekly,
        enrollWeekly,
        attemptWeekly,
        xpWeekly,
        activeTotals,
        subjectRows,
        gradeRows,
        courseAttemptRows,
        topCourseRows,
        funnelRows,
      ] = await Promise.all([
        ctx.db.$queryRaw<Array<{ wk: string; n: bigint }>>(Prisma.sql`
          SELECT to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS wk,
                 count(*) AS n
          FROM "User"
          WHERE "institutionId" = ${institutionId}
            AND "createdAt" >= ${windowStart}
          GROUP BY 1
        `),
        ctx.db.$queryRaw<Array<{ wk: string; n: bigint }>>(Prisma.sql`
          SELECT to_char(date_trunc('week', e."enrolledAt"), 'YYYY-MM-DD') AS wk,
                 count(*) AS n
          FROM "Enrollment" e
          JOIN "User" u ON u."id" = e."userId"
          WHERE u."institutionId" = ${institutionId}
            AND e."enrolledAt" >= ${windowStart}
          GROUP BY 1
        `),
        ctx.db.$queryRaw<
          Array<{ wk: string; n: bigint; correct: bigint; active: bigint }>
        >(Prisma.sql`
          SELECT to_char(date_trunc('week', a."createdAt"), 'YYYY-MM-DD') AS wk,
                 count(*) AS n,
                 count(*) FILTER (WHERE a."correct") AS correct,
                 count(DISTINCT a."userId") AS active
          FROM "Attempt" a
          JOIN "User" u ON u."id" = a."userId"
          WHERE u."institutionId" = ${institutionId}
            AND a."createdAt" >= ${windowStart}
          GROUP BY 1
        `),
        ctx.db.$queryRaw<Array<{ wk: string; p: bigint }>>(Prisma.sql`
          SELECT to_char(date_trunc('week', x."createdAt"), 'YYYY-MM-DD') AS wk,
                 coalesce(sum(x."points"), 0) AS p
          FROM "XPEvent" x
          JOIN "User" u ON u."id" = x."userId"
          WHERE u."institutionId" = ${institutionId}
            AND x."createdAt" >= ${windowStart}
          GROUP BY 1
        `),
        ctx.db.$queryRaw<
          Array<{ cur_active: bigint; prior_active: bigint }>
        >(Prisma.sql`
          SELECT
            count(DISTINCT a."userId") FILTER (WHERE a."createdAt" >= ${currentStart}) AS cur_active,
            count(DISTINCT a."userId") FILTER (WHERE a."createdAt" <  ${currentStart}) AS prior_active
          FROM "Attempt" a
          JOIN "User" u ON u."id" = a."userId"
          WHERE u."institutionId" = ${institutionId}
            AND a."createdAt" >= ${windowStart}
        `),
        ctx.db.$queryRaw<
          Array<{
            subject: string;
            courses: bigint;
            enrollments: bigint;
            avgcompletion: string;
            completed: bigint;
          }>
        >(Prisma.sql`
          SELECT c."subject" AS subject,
                 count(DISTINCT e."courseId") AS courses,
                 count(*) AS enrollments,
                 coalesce(avg(e."progressPct"), 0) AS avgcompletion,
                 count(*) FILTER (WHERE e."completed") AS completed
          FROM "Enrollment" e
          JOIN "Course" c ON c."id" = e."courseId"
          JOIN "User" u ON u."id" = e."userId"
          WHERE u."institutionId" = ${institutionId}
          GROUP BY c."subject"
          ORDER BY enrollments DESC
        `),
        ctx.db.$queryRaw<
          Array<{
            grade: string;
            enrollments: bigint;
            avgcompletion: string;
            completed: bigint;
          }>
        >(Prisma.sql`
          SELECT c."grade" AS grade,
                 count(*) AS enrollments,
                 coalesce(avg(e."progressPct"), 0) AS avgcompletion,
                 count(*) FILTER (WHERE e."completed") AS completed
          FROM "Enrollment" e
          JOIN "Course" c ON c."id" = e."courseId"
          JOIN "User" u ON u."id" = e."userId"
          WHERE u."institutionId" = ${institutionId}
          GROUP BY c."grade"
          ORDER BY enrollments DESC
        `),
        ctx.db.$queryRaw<
          Array<{
            courseid: string;
            subject: string;
            attempts: bigint;
            correct: bigint;
          }>
        >(Prisma.sql`
          SELECT c."id" AS courseid,
                 c."subject" AS subject,
                 count(*) AS attempts,
                 count(*) FILTER (WHERE a."correct") AS correct
          FROM "Attempt" a
          JOIN "User" u ON u."id" = a."userId"
          JOIN "Lesson" l ON l."id" = a."lessonId"
          JOIN "Unit" un ON un."id" = l."unitId"
          JOIN "Course" c ON c."id" = un."courseId"
          WHERE u."institutionId" = ${institutionId}
          GROUP BY c."id", c."subject"
        `),
        ctx.db.$queryRaw<
          Array<{
            id: string;
            title: string;
            subject: string;
            grade: string;
            enrollments: bigint;
            avgprogress: string;
            completed: bigint;
          }>
        >(Prisma.sql`
          SELECT c."id" AS id,
                 c."title" AS title,
                 c."subject" AS subject,
                 c."grade" AS grade,
                 count(*) AS enrollments,
                 coalesce(avg(e."progressPct"), 0) AS avgprogress,
                 count(*) FILTER (WHERE e."completed") AS completed
          FROM "Enrollment" e
          JOIN "Course" c ON c."id" = e."courseId"
          JOIN "User" u ON u."id" = e."userId"
          WHERE u."institutionId" = ${institutionId}
          GROUP BY c."id"
          ORDER BY enrollments DESC
          LIMIT 8
        `),
        ctx.db.$queryRaw<
          Array<{
            enrolled: bigint;
            started: bigint;
            halfway: bigint;
            completed: bigint;
          }>
        >(Prisma.sql`
          SELECT count(*) AS enrolled,
                 count(*) FILTER (WHERE e."progressPct" > 0) AS started,
                 count(*) FILTER (WHERE e."progressPct" >= 50) AS halfway,
                 count(*) FILTER (WHERE e."completed") AS completed
          FROM "Enrollment" e
          JOIN "User" u ON u."id" = e."userId"
          WHERE u."institutionId" = ${institutionId}
        `),
      ]);

      // ── Weekly maps → dense current-period series ──────────────────
      const signupByWk = new Map(
        signupWeekly.map((r) => [r.wk, Number(r.n)])
      );
      const enrollByWk = new Map(
        enrollWeekly.map((r) => [r.wk, Number(r.n)])
      );
      const attByWk = new Map(
        attemptWeekly.map((r) => [
          r.wk,
          { n: Number(r.n), c: Number(r.correct), a: Number(r.active) },
        ])
      );
      const xpByWk = new Map(xpWeekly.map((r) => [r.wk, Number(r.p)]));

      const series = currentKeys.map((weekStart) => {
        const at = attByWk.get(weekStart);
        const attempts = at?.n ?? 0;
        const correct = at?.c ?? 0;
        return {
          weekStart,
          attempts,
          correct,
          accuracyPct:
            attempts > 0 ? Math.round((correct / attempts) * 100) : null,
          activeLearners: at?.a ?? 0,
          enrollments: enrollByWk.get(weekStart) ?? 0,
          signups: signupByWk.get(weekStart) ?? 0,
          xp: xpByWk.get(weekStart) ?? 0,
        };
      });

      // ── Period totals for the KPI deltas ───────────────────────────
      const sumKeys = (keys: string[], m: Map<string, number>) =>
        keys.reduce((acc, k) => acc + (m.get(k) ?? 0), 0);
      const attN = new Map([...attByWk].map(([k, v]) => [k, v.n]));
      const attC = new Map([...attByWk].map(([k, v]) => [k, v.c]));

      const curSignups = sumKeys(currentKeys, signupByWk);
      const priorSignups = sumKeys(priorKeys, signupByWk);
      const curEnroll = sumKeys(currentKeys, enrollByWk);
      const priorEnroll = sumKeys(priorKeys, enrollByWk);
      const curXp = sumKeys(currentKeys, xpByWk);
      const priorXp = sumKeys(priorKeys, xpByWk);
      const curAttempts = sumKeys(currentKeys, attN);
      const priorAttempts = sumKeys(priorKeys, attN);
      const curCorrect = sumKeys(currentKeys, attC);
      const priorCorrect = sumKeys(priorKeys, attC);
      const curAcc =
        curAttempts > 0 ? Math.round((curCorrect / curAttempts) * 100) : 0;
      const priorAcc =
        priorAttempts > 0
          ? Math.round((priorCorrect / priorAttempts) * 100)
          : 0;
      const curActive = Number(activeTotals[0]?.cur_active ?? 0);
      const priorActive = Number(activeTotals[0]?.prior_active ?? 0);

      // Accuracy delta is in percentage *points*, not a relative %.
      const accTrend = (() => {
        if (priorAttempts === 0) {
          return curAttempts === 0
            ? { trend: "flat" as const, label: "—" }
            : { trend: "up" as const, label: "new" };
        }
        const d = curAcc - priorAcc;
        if (d === 0) return { trend: "flat" as const, label: "0 pts" };
        return {
          trend: d > 0 ? ("up" as const) : ("down" as const),
          label: `${d > 0 ? "+" : ""}${d} pts`,
        };
      })();

      const acT = trendOf(curActive, priorActive);
      const eT = trendOf(curEnroll, priorEnroll);
      const aT = trendOf(curAttempts, priorAttempts);
      const xT = trendOf(curXp, priorXp);
      const sT = trendOf(curSignups, priorSignups);

      const kpis = [
        {
          label: "Active learners",
          value: curActive.toLocaleString(),
          deltaLabel: acT.label,
          trend: acT.trend,
          meta: `prev ${priorActive.toLocaleString()}`,
        },
        {
          label: "Enrollments",
          value: curEnroll.toLocaleString(),
          deltaLabel: eT.label,
          trend: eT.trend,
          meta: `prev ${priorEnroll.toLocaleString()}`,
        },
        {
          label: "Attempts",
          value: curAttempts.toLocaleString(),
          deltaLabel: aT.label,
          trend: aT.trend,
          meta: `prev ${priorAttempts.toLocaleString()}`,
        },
        {
          label: "Avg accuracy",
          value: curAttempts > 0 ? `${curAcc}%` : "—",
          deltaLabel: accTrend.label,
          trend: accTrend.trend,
          meta: `prev ${priorAttempts > 0 ? `${priorAcc}%` : "—"}`,
        },
        {
          label: "XP earned",
          value: curXp.toLocaleString(),
          deltaLabel: xT.label,
          trend: xT.trend,
          meta: `prev ${priorXp.toLocaleString()}`,
        },
        {
          label: "New signups",
          value: curSignups.toLocaleString(),
          deltaLabel: sT.label,
          trend: sT.trend,
          meta: `prev ${priorSignups.toLocaleString()}`,
        },
      ];

      // ── Accuracy joins (one query, reused for subject + course) ────
      const subjAtt = new Map<string, { attempts: number; correct: number }>();
      const courseAtt = new Map<string, { attempts: number; correct: number }>();
      for (const r of courseAttemptRows) {
        const a = Number(r.attempts);
        const c = Number(r.correct);
        const s = subjAtt.get(r.subject) ?? { attempts: 0, correct: 0 };
        s.attempts += a;
        s.correct += c;
        subjAtt.set(r.subject, s);
        courseAtt.set(r.courseid, { attempts: a, correct: c });
      }
      const accOf = (m: { attempts: number; correct: number } | undefined) =>
        m && m.attempts > 0 ? Math.round((m.correct / m.attempts) * 100) : null;

      const bySubject = subjectRows.map((r) => ({
        subject: r.subject,
        courses: Number(r.courses),
        enrollments: Number(r.enrollments),
        avgCompletion: Math.round(Number(r.avgcompletion)),
        completed: Number(r.completed),
        accuracyPct: accOf(subjAtt.get(r.subject)),
      }));

      const byGrade = gradeRows.map((r) => ({
        grade: r.grade,
        enrollments: Number(r.enrollments),
        avgCompletion: Math.round(Number(r.avgcompletion)),
        completed: Number(r.completed),
      }));

      const topCourses = topCourseRows.map((r) => {
        const enrollments = Number(r.enrollments);
        const completed = Number(r.completed);
        return {
          id: r.id,
          title: r.title,
          subject: r.subject,
          grade: r.grade,
          enrollments,
          completionPct:
            enrollments > 0 ? Math.round((completed / enrollments) * 100) : 0,
          avgProgress: Math.round(Number(r.avgprogress)),
          accuracyPct: accOf(courseAtt.get(r.id)),
        };
      });

      // ── Enrolment funnel ───────────────────────────────────────────
      const f = funnelRows[0];
      const enrolled = Number(f?.enrolled ?? 0);
      const funnel = [
        { label: "Enrolled", count: enrolled },
        { label: "Started", count: Number(f?.started ?? 0) },
        { label: "Halfway", count: Number(f?.halfway ?? 0) },
        { label: "Completed", count: Number(f?.completed ?? 0) },
      ].map((s) => ({
        ...s,
        pct: enrolled > 0 ? Math.round((s.count / enrolled) * 100) : 0,
      }));

      return {
        weeks,
        institution: { name: institution?.name ?? null },
        kpis,
        series,
        bySubject,
        byGrade,
        topCourses,
        funnel,
      };
    }),
});
