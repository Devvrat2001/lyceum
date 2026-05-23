import { router, protectedProcedure } from "../trpc";

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

    const [
      xpTotal,
      streak,
      enrollments,
      classmatesRaw,
      badgesRaw,
      skillMastery,
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
                    select: { slug: true, title: true, durationMin: true },
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
    ]);

    // No Assignment model exists in the schema yet, so there's nothing
    // real to surface. The page renders a "no assignments" state when
    // this is empty — better than shipping fake teacher work that
    // doesn't tie back to any course in the user's library.
    const assignments: Array<{
      d: string;
      t: string;
      xp: number;
      due: string;
    }> = [];

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

    // No real "today's plan" generator exists yet — the page renders
    // an empty state when this is empty rather than ship a hardcoded
    // mock plan ("Intro to Equivalent Fractions…") that doesn't
    // reflect the user's actual courses. The item shape matches
    // TodaysPlan's `PlanItem` so the component drops in once we wire
    // a real source.
    const todaysPlan: Array<{
      ico: "play" | "sparkles" | "book" | "mic" | "check" | "arrow";
      tag: string;
      title: string;
      meta: string;
      state: "done" | "now" | "next";
    }> = [];

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
      },
      continueLearning,
      todaysPlan,
      skills,
      assignments,
      leaderboard,
      badges,
    };
  }),
});
