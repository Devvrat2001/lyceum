import type { PrismaClient } from "@prisma/client";

/**
 * Board report — data layer. Gathers the institution snapshot a trustee
 * report needs (headline counts, 30-day engagement, top teachers, and the
 * cached AI insights warmed by /api/cron/ai-insights). Pure data + bare `db`
 * so it's testable without a session; the PDF rendering lives separately in
 * lib/reports/BoardReportPdf.tsx.
 */

export type BoardReportKpi = { label: string; value: string };

export type BoardReportData = {
  institutionName: string;
  brandColor: string | null;
  generatedAt: Date;
  kpis: BoardReportKpi[];
  topTeachers: { name: string; classes: number; students: number }[];
  insights: { kind: string; body: string }[];
};

/** Resolve which institution an admin reports on (their own, else the first). */
export async function resolveAdminInstitutionId(
  db: PrismaClient,
  userId: string
): Promise<string | null> {
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });
  return (
    me?.institutionId ??
    (await db.institution.findFirst({ select: { id: true } }))?.id ??
    null
  );
}

export async function gatherBoardReportData(
  db: PrismaClient,
  institutionId: string,
  now: Date = new Date()
): Promise<BoardReportData> {
  const institution = await db.institution.findUnique({
    where: { id: institutionId },
  });

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const [
    studentCount,
    teacherCount,
    classCount,
    activeStudents,
    attempts,
    teachers,
    insightRows,
  ] = await Promise.all([
    db.user.count({ where: { role: "STUDENT", institutionId } }),
    db.user.count({ where: { role: "TEACHER", institutionId } }),
    db.class.count({ where: { institutionId } }),
    db.user.count({
      where: {
        role: "STUDENT",
        institutionId,
        enrollments: { some: { lastActivityAt: { gte: thirtyDaysAgo } } },
      },
    }),
    db.attempt.findMany({
      where: { user: { institutionId } },
      select: { correct: true },
      take: 5000,
    }),
    db.user.findMany({
      where: { role: "TEACHER", institutionId },
      select: {
        name: true,
        firstName: true,
        taughtClasses: { select: { _count: { select: { students: true } } } },
      },
      take: 5,
    }),
    db.insight.findMany({
      where: {
        audience: "admin",
        scope: `ADMIN:${institutionId}`,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  const avgQuizScore =
    attempts.length > 0
      ? Math.round(
          (attempts.filter((a) => a.correct).length / attempts.length) * 100
        )
      : null;

  const topTeachers = teachers
    .map((t) => ({
      name: t.name ?? t.firstName ?? "—",
      classes: t.taughtClasses.length,
      students: t.taughtClasses.reduce((a, c) => a + c._count.students, 0),
    }))
    .sort((a, b) => b.students - a.students)
    .slice(0, 5);

  const kpis: BoardReportKpi[] = [
    { label: "Students", value: String(studentCount) },
    { label: "Teachers", value: String(teacherCount) },
    { label: "Classes", value: String(classCount) },
    { label: "Active students (30d)", value: String(activeStudents) },
    { label: "Avg quiz score", value: avgQuizScore === null ? "—" : `${avgQuizScore}%` },
  ];

  return {
    institutionName: institution?.name ?? "Institution",
    brandColor: institution?.brandColor ?? null,
    generatedAt: now,
    kpis,
    topTeachers,
    insights: insightRows.map((r) => ({ kind: r.kind, body: r.body })),
  };
}
