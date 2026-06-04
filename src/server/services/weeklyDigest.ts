import type { PrismaClient } from "@prisma/client";

/**
 * Weekly progress digest — audience selection + per-student aggregation.
 *
 * Pure data layer (no email import) so it's fully unit-testable: the cron
 * route (`/api/cron/weekly-digest`) calls this, then hands each row to
 * `sendWeeklyDigest` in lib/email.ts. Kept separate so a test can assert
 * WHO gets a digest and WHAT it says without touching Resend.
 *
 * Audience rules:
 *   - role STUDENT only (teachers/admins/parents don't get a learner digest)
 *   - `emailOptOut === false` (the /settings toggle the student controls)
 *   - had ≥1 activity in the trailing 7-day window (a "you did nothing this
 *     week" email is spam, not engagement — those students are skipped)
 */

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 86_400_000;

export type WeeklyDigest = {
  userId: string;
  email: string;
  firstName: string;
  lessonsCompleted: number;
  questionsAnswered: number;
  questionsCorrect: number;
  xpEarned: number;
  streak: number;
};

export async function buildWeeklyDigests(
  db: PrismaClient,
  now: Date = new Date()
): Promise<WeeklyDigest[]> {
  const since = new Date(now.getTime() - WINDOW_MS);

  // Candidate audience: opted-in students. We pull the streak inline so the
  // digest can surface it without a second round-trip per user.
  const students = await db.user.findMany({
    where: { role: "STUDENT", emailOptOut: false },
    select: {
      id: true,
      email: true,
      firstName: true,
      name: true,
      streak: { select: { current: true } },
    },
  });
  if (students.length === 0) return [];

  const ids = students.map((s) => s.id);
  const window = { gte: since, lte: now };

  // One grouped query per metric across the whole candidate set — cheaper
  // and more predictable than N×4 per-user counts.
  const orderBy = { userId: "asc" } as const;
  const [lessonGroups, attemptGroups, correctGroups, xpGroups] =
    await Promise.all([
      db.lessonProgress.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, completedAt: window },
        _count: { _all: true },
        orderBy,
      }),
      db.attempt.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, createdAt: window },
        _count: { _all: true },
        orderBy,
      }),
      db.attempt.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, createdAt: window, correct: true },
        _count: { _all: true },
        orderBy,
      }),
      db.xPEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, createdAt: window },
        _sum: { points: true },
        orderBy,
      }),
    ]);

  const lessonsBy = new Map(lessonGroups.map((g) => [g.userId, g._count._all]));
  const attemptsBy = new Map(
    attemptGroups.map((g) => [g.userId, g._count._all])
  );
  const correctBy = new Map(correctGroups.map((g) => [g.userId, g._count._all]));
  const xpBy = new Map(xpGroups.map((g) => [g.userId, g._sum.points ?? 0]));

  const digests: WeeklyDigest[] = [];
  for (const s of students) {
    const lessonsCompleted = lessonsBy.get(s.id) ?? 0;
    const questionsAnswered = attemptsBy.get(s.id) ?? 0;
    const questionsCorrect = correctBy.get(s.id) ?? 0;
    const xpEarned = xpBy.get(s.id) ?? 0;

    if (lessonsCompleted === 0 && questionsAnswered === 0 && xpEarned === 0) {
      continue; // no activity this week — don't email
    }

    digests.push({
      userId: s.id,
      email: s.email,
      firstName: s.firstName ?? s.name ?? "there",
      lessonsCompleted,
      questionsAnswered,
      questionsCorrect,
      xpEarned,
      streak: s.streak?.current ?? 0,
    });
  }
  return digests;
}
