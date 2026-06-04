import type { PrismaClient } from "@prisma/client";

/**
 * Student progress report ("parent report") — data layer. A parent-friendly
 * snapshot of one student's learning: lifetime stats, this-week momentum, and
 * per-course progress. Bare `db` + a `now` seam so it's testable; the level
 * formula mirrors student.dashboard exactly (`1 + floor(xp/350)`).
 */

export type StudentReportData = {
  studentName: string;
  generatedAt: Date;
  xp: number;
  level: number;
  streak: number;
  badges: number;
  lessonsCompleted: number;
  lessonsThisWeek: number;
  xpThisWeek: number;
  courses: { title: string; progressPct: number; completed: boolean }[];
};

export async function gatherStudentReportData(
  db: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<StudentReportData> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const window = { gte: weekAgo, lte: now };

  const [
    user,
    xpAll,
    xpWeek,
    streak,
    badges,
    lessonsCompleted,
    lessonsThisWeek,
    enrollments,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, firstName: true },
    }),
    db.xPEvent.aggregate({ _sum: { points: true }, where: { userId } }),
    db.xPEvent.aggregate({
      _sum: { points: true },
      where: { userId, createdAt: window },
    }),
    db.streak.findUnique({ where: { userId }, select: { current: true } }),
    db.userBadge.count({ where: { userId } }),
    db.lessonProgress.count({ where: { userId } }),
    db.lessonProgress.count({ where: { userId, completedAt: window } }),
    db.enrollment.findMany({
      where: { userId },
      select: {
        progressPct: true,
        completed: true,
        course: { select: { title: true } },
      },
      orderBy: { enrolledAt: "desc" },
      take: 12,
    }),
  ]);

  const xp = xpAll._sum.points ?? 0;

  return {
    studentName: user?.name ?? user?.firstName ?? "Student",
    generatedAt: now,
    xp,
    level: Math.max(1, 1 + Math.floor(xp / 350)),
    streak: streak?.current ?? 0,
    badges,
    lessonsCompleted,
    lessonsThisWeek,
    xpThisWeek: xpWeek._sum.points ?? 0,
    courses: enrollments.map((e) => ({
      title: e.course.title,
      progressPct: e.progressPct,
      completed: e.completed,
    })),
  };
}
