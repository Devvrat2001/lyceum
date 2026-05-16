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

    const assignmentsRaw = [
      { d: "Wed", t: "Fractions Quiz · Mrs. Reyes", xp: 50, due: "Tomorrow" },
      { d: "Thu", t: "Lab report: Plant cells", xp: 80, due: "In 2 days" },
      { d: "Fri", t: "Spelling quiz · Unit 6", xp: 30, due: "In 3 days" },
      { d: "Mon", t: "Project: Mini-biome", xp: 200, due: "Next week" },
    ];

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

    const todaysPlan = [
      {
        ico: "play" as const,
        tag: "WATCH",
        title: "Intro to Equivalent Fractions",
        meta: "8 min · Math",
        state: "done" as const,
      },
      {
        ico: "sparkles" as const,
        tag: "PRACTICE",
        title: "Adaptive quiz · 10 questions",
        meta: "Adjusts as you go",
        state: "now" as const,
      },
      {
        ico: "book" as const,
        tag: "READ",
        title: "Ch. 5 · Bridge to Terabithia",
        meta: "12 min · ELA",
        state: "next" as const,
      },
      {
        ico: "mic" as const,
        tag: "SPEAK",
        title: "Spanish: order at a café (role-play)",
        meta: "5 min · with AI partner",
        state: "next" as const,
      },
    ];

    const skillBars = skillMastery.map((m) => ({
      name: m.skill.title,
      v: Math.round(m.level * 100),
    }));
    const fillerSkills = [
      { name: "Number sense", v: 86 },
      { name: "Fractions", v: 62 },
      { name: "Geometry", v: 41 },
      { name: "Reading comprehension", v: 78 },
      { name: "Vocabulary", v: 55 },
    ];
    const skills = (skillBars.length >= 5 ? skillBars : fillerSkills).slice(0, 5);

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
      assignments: assignmentsRaw,
      leaderboard,
      badges,
    };
  }),
});
