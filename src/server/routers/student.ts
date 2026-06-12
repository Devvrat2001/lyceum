import { randomInt } from "crypto";
import { router, protectedProcedure, studentProcedure } from "../trpc";

export const studentRouter = router({
  /** Whole-dashboard payload for the signed-in user. */
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      include: {
        class: {
          include: {
            teacher: { select: { name: true, firstName: true } },
          },
        },
      },
    });
    if (!me) return null;

    // Monday 00:00 UTC of the current week — the "Your week" strip's
    // activity window. UTC keeps it consistent with the streak engine
    // and the admin analytics week buckets.
    const weekStart = (() => {
      const d = new Date();
      const x = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
      x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
      return x;
    })();

    const [
      xpTotal,
      streak,
      enrollments,
      classmatesRaw,
      badgesRaw,
      skillMastery,
      weekAttempts,
      weekProgress,
      badgeTotal,
      badgesEarned,
    ] = await Promise.all([
      ctx.db.xPEvent
        .aggregate({ where: { userId: me.id }, _sum: { points: true } })
        .then((r) => r._sum.points ?? 0),
      ctx.db.streak.findUnique({ where: { userId: me.id } }),
      ctx.db.enrollment.findMany({
        where: { userId: me.id },
        orderBy: { lastActivityAt: "desc" },
        take: 3,
        include: {
          course: {
            select: {
              slug: true,
              title: true,
              subject: true,
              authorLabel: true,
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
                    },
                  },
                },
              },
            },
          },
        },
      }),
      me.classId
        ? ctx.db.user.findMany({
            where: { classId: me.classId, role: "STUDENT" },
            select: {
              id: true,
              name: true,
              firstName: true,
              xpEvents: { select: { points: true } },
            },
          })
        : Promise.resolve([]),
      ctx.db.userBadge.findMany({
        where: { userId: me.id },
        orderBy: { earnedAt: "desc" },
        take: 6,
        include: { badge: true },
      }),
      ctx.db.mastery.findMany({
        where: { userId: me.id },
        include: { skill: true },
        orderBy: { skill: { col: "asc" } },
        take: 5,
      }),
      ctx.db.attempt.findMany({
        where: { userId: me.id, createdAt: { gte: weekStart } },
        select: { createdAt: true },
      }),
      ctx.db.lessonProgress.findMany({
        where: { userId: me.id, completedAt: { gte: weekStart } },
        select: { completedAt: true, lessonId: true },
      }),
      ctx.db.badge.count(),
      ctx.db.userBadge.count({ where: { userId: me.id } }),
    ]);

    // Real per-day activity for the "Your week" strip — a day lights up
    // only if the student actually did something that day (a quiz
    // attempt or a lesson completion), Mon..Sun of this UTC week. The
    // page used to fill every circle up to "today" unconditionally,
    // fabricating a perfect week for every account.
    const weekActivity = Array.from({ length: 7 }, () => false);
    for (const t of [
      ...weekAttempts.map((a) => a.createdAt),
      ...weekProgress.map((p) => p.completedAt),
    ]) {
      weekActivity[(t.getUTCDay() + 6) % 7] = true;
    }

    // Teacher-posted assignments across enrolled courses (R12): due in
    // the future or within the last week (so a just-missed deadline is
    // still visible), soonest first. Completion derives from
    // LessonProgress on the target lesson.
    const assignmentRows = await ctx.db.assignment.findMany({
      where: {
        course: { enrollments: { some: { userId: me.id } } },
        dueAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
      },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        xp: true,
        dueAt: true,
        lessonId: true,
        lesson: { select: { slug: true } },
      },
    });
    const doneLessonIds = new Set(
      (assignmentRows.length
        ? await ctx.db.lessonProgress.findMany({
            where: {
              userId: me.id,
              lessonId: { in: assignmentRows.map((a) => a.lessonId) },
            },
            select: { lessonId: true },
          })
        : []
      ).map((r) => r.lessonId)
    );
    const fmtDue = (d: Date) => {
      const days = Math.ceil((d.getTime() - Date.now()) / (24 * 3600 * 1000));
      if (days < 0) return "Past due";
      if (days === 0) return "Due today";
      if (days === 1) return "Due tomorrow";
      if (days <= 6) {
        return `Due ${d.toLocaleDateString("en-US", { weekday: "short" })}`;
      }
      return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    };
    const assignments = assignmentRows.map((a) => {
      const done = doneLessonIds.has(a.lessonId);
      return {
        d: a.dueAt
          .toLocaleDateString("en-US", { month: "short", day: "numeric" })
          .toUpperCase(),
        t: a.title,
        xp: a.xp,
        due: done ? "Done" : fmtDue(a.dueAt),
        done,
        lessonSlug: a.lesson.slug,
      };
    });

    const leaderboard = classmatesRaw
      .map((u) => ({
        id: u.id,
        name: u.id === me.id ? "You" : u.name ?? u.firstName ?? "—",
        me: u.id === me.id,
        xp: u.xpEvents.reduce((a, e) => a + e.points, 0),
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5)
      .map((u, i) => ({ ...u, r: i + 1 }));

    const continueLearning = enrollments.map((e) => {
      const firstLesson = e.course.units[0]?.lessons[0];
      const totalLessons = e.course.units.reduce(
        (a, u) => a + u.lessons.length,
        0
      );
      const minsLeft = Math.max(
        4,
        Math.round(((100 - e.progressPct) / 100) * (totalLessons * 8))
      );
      return {
        slug: e.course.slug,
        title: e.course.title,
        sub: `Lesson ${Math.max(
          1,
          Math.round((e.progressPct / 100) * totalLessons)
        )} of ${totalLessons} · ${e.course.subject.toUpperCase()}`,
        pct: e.progressPct,
        mins: `${minsLeft} min left`,
        firstLessonSlug: firstLesson?.slug ?? null,
      };
    });

    // ── Today's plan (R13): deterministic v1, no AI required ──
    // Sources in priority order: work completed today (visible wins,
    // crossed off) → due assignments → the next uncompleted lesson of
    // the most-recent course → weakest-skill practice → a streak saver
    // when the streak is at risk. First actionable item gets "now".
    type PlanItem = {
      ico: "play" | "sparkles" | "book" | "mic" | "check" | "arrow";
      tag: string;
      title: string;
      meta: string;
      state: "done" | "now" | "next";
      href: string | null;
    };
    const todayKey = new Date().toISOString().slice(0, 10);
    const doneTodayIds = new Set(
      weekProgress
        .filter((p) => p.completedAt.toISOString().slice(0, 10) === todayKey)
        .map((p) => p.lessonId)
    );
    const planItems: PlanItem[] = [];

    const topEnrollment = enrollments[0] ?? null;
    const topLessons = topEnrollment
      ? topEnrollment.course.units.flatMap((u) => u.lessons)
      : [];

    // Completed-today rows from the top course (max 2).
    for (const l of topLessons) {
      if (doneTodayIds.has(l.id) && planItems.length < 2) {
        planItems.push({
          ico: "check",
          tag: "DONE",
          title: l.title,
          meta: topEnrollment!.course.title,
          state: "done",
          href: null,
        });
      }
    }

    // Due, not-yet-done assignments (max 2).
    for (const a of assignments.filter((a) => !a.done).slice(0, 2)) {
      planItems.push({
        ico: "check",
        tag: "ASSIGNMENT",
        title: a.t,
        meta: `${a.due} · +${a.xp} XP`,
        state: "next",
        href: a.lessonSlug ? `/student/lesson/${a.lessonSlug}` : null,
      });
    }

    // Next uncompleted lesson in the most-recent course.
    if (topEnrollment) {
      const completedInTop = new Set(
        (
          await ctx.db.lessonProgress.findMany({
            where: {
              userId: me.id,
              lesson: { unit: { courseId: topEnrollment.courseId } },
            },
            select: { lessonId: true },
          })
        ).map((r) => r.lessonId)
      );
      const nextLesson = topLessons.find(
        (l) => !completedInTop.has(l.id) && l.slug
      );
      if (nextLesson) {
        planItems.push({
          ico: "play",
          tag: "CONTINUE",
          title: nextLesson.title,
          meta: `${topEnrollment.course.title}${
            nextLesson.durationMin ? ` · ${nextLesson.durationMin} min` : ""
          }`,
          state: "next",
          href: `/student/lesson/${nextLesson.slug}`,
        });
      }
    }

    // Weakest skill → practice nudge (links into the skill tree).
    const weakest = [...skillMastery].sort((a, b) => a.level - b.level)[0];
    if (weakest) {
      planItems.push({
        ico: "sparkles",
        tag: "PRACTICE",
        title: `Practice ${weakest.skill.title}`,
        meta: `Your weakest skill · ${Math.round(weakest.level * 100)}% mastered`,
        state: "next",
        href: "/student/skill-tree",
      });
    }

    // Streak saver — only when there IS a streak and nothing happened
    // today yet (an attempt or a completion both count as activity).
    const activeToday =
      doneTodayIds.size > 0 ||
      weekAttempts.some(
        (a) => a.createdAt.toISOString().slice(0, 10) === todayKey
      );
    if ((streak?.current ?? 0) > 0 && !activeToday) {
      planItems.push({
        ico: "book",
        tag: "STREAK",
        title: `Keep your ${streak!.current}-day streak alive`,
        meta: "Any lesson or quiz today counts",
        state: "next",
        href: null,
      });
    }

    const todaysPlan = planItems.slice(0, 5);
    const firstActionable = todaysPlan.findIndex((p) => p.state === "next");
    if (firstActionable !== -1) {
      todaysPlan[firstActionable] = {
        ...todaysPlan[firstActionable],
        state: "now",
      };
    }

    // Real per-skill mastery only — the prototype used to pad with a
    // hardcoded "Number sense / Fractions / Geometry / …" filler when
    // the user had fewer than 5 Mastery rows, which made fresh
    // accounts look populated with skills they'd never practiced.
    // Empty state is rendered by the page when there's nothing yet.
    const skills = skillMastery
      .map((m) => ({
        name: m.skill.title,
        v: Math.round(m.level * 100),
      }))
      .slice(0, 5);

    const badges = badgesRaw.map((ub) => ({
      slug: ub.badge.slug,
      name: ub.badge.name,
      icon: ub.badge.icon,
    }));

    return {
      me: {
        id: me.id,
        firstName: me.firstName ?? "Friend",
        name: me.name ?? me.firstName ?? "Friend",
        avatarInitials:
          (me.firstName?.[0] ?? "") + (me.name?.split(" ")[1]?.[0] ?? ""),
        className: me.class?.name ?? null,
        teacherLabel: me.class?.teacher?.name ?? null,
      },
      stats: {
        xp: xpTotal,
        streak: streak?.current ?? 0,
        level: Math.max(1, 1 + Math.floor(xpTotal / 350)),
        // XP into the current level + the level span — the dashboard's
        // level-progress bar derives "N XP to L(n+1)" from these, so
        // the 350-per-level constant has one source of truth.
        levelInto: xpTotal % 350,
        levelSpan: 350,
      },
      continueLearning,
      todaysPlan,
      skills,
      assignments,
      leaderboard,
      badges,
      weekActivity,
      // Real earned/total so the page never hardcodes a badge count.
      badgeCounts: { earned: badgesEarned, total: badgeTotal },
    };
  }),

  /**
   * Family code for parent self-service linking (REQUIREMENTS R26).
   * The student generates a short code, shares it out-of-band
   * (WhatsApp, paper), and the parent enters it on their dashboard —
   * no email infrastructure needed. One live code per child
   * (regenerating replaces it), single-use, 7-day expiry, stored in
   * the same VerificationToken table the auth flows namespace.
   */
  generateParentCode: studentProcedure.mutation(async ({ ctx }) => {
    const identifier = `parentlink:${ctx.user.id}`;
    // 6 chars from a no-confusables alphabet (no I/L/O/0/1) ≈ 887M
    // combos. Codes are single-use, expire in 7 days, and redeeming
    // requires a signed-in PARENT — fine without a dedicated rate
    // limit at this scale.
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const code = Array.from(
      { length: 6 },
      () => ALPHABET[randomInt(ALPHABET.length)]
    ).join("");
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await ctx.db.$transaction([
      ctx.db.verificationToken.deleteMany({ where: { identifier } }),
      ctx.db.verificationToken.create({
        data: { identifier, token: code, expires },
      }),
    ]);
    return { code, expiresAt: expires.toISOString() };
  }),
});
