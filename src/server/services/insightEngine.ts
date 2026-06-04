import type { PrismaClient } from "@prisma/client";
import {
  ADMIN_INSIGHT_SYSTEM_PROMPT,
  InsightBatchSchema,
  TEACHER_INSIGHT_SYSTEM_PROMPT,
  buildAdminInsightPrompt,
  buildDemoAdminInsights,
  buildDemoTeacherInsights,
  buildTeacherInsightPrompt,
  type InsightItem,
} from "@/lib/ai/prompts/insights";
import { completeStructured, isLlmEnabled } from "@/lib/ai/llm";

/**
 * Insight generation engine — the shared core behind both the on-demand
 * tRPC mutations (`insight.regenerateTeacher` / `regenerateAdmin`) and the
 * nightly `/api/cron/ai-insights` cache-warmer.
 *
 * Each function gathers real stats, asks the LLM for 3 insights (falling back
 * to deterministic demo insights when no key is set or the scope is empty),
 * and atomically replaces the cached `Insight` rows (24h TTL). It takes a bare
 * `db` — no tRPC ctx — so the cron can call it for every teacher/institution
 * without an interactive session. Auth, rate-limit, and audit stay in the
 * callers (the cron is a bounded system job; the mutations are per-user).
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TEACHER_KINDS = new Set(["PATTERN", "OPPORTUNITY", "AT_RISK"]);
const ADMIN_KINDS = new Set(["STRENGTH", "WATCH", "TEACHER"]);

export type InsightMode = "openai" | "claude" | "demo";
type WorstFunnel = { stage: string; pct: number; count: number } | null;

export type TeacherInsightStats = {
  courseCount: number;
  totalStudents: number;
  activeStudents: number;
  avgQuizScore: number;
  worstFunnel: WorstFunnel;
};

export type AdminInsightStats = {
  studentCount: number;
  teacherCount: number;
  classCount: number;
  avgQuizScore: number;
  topTeacherCount: number;
};

/** Generate + persist a teacher's 3 cached insights. ADMIN callers see all courses. */
export async function generateTeacherInsights(
  db: PrismaClient,
  opts: {
    teacherId: string;
    teacherName: string;
    isAdmin: boolean;
    rangeDays?: number;
  }
): Promise<{ items: InsightItem[]; mode: InsightMode; stats: TeacherInsightStats }> {
  const rangeDays = opts.rangeDays ?? 30;
  const scope = `TEACHER:${opts.teacherId}`;

  const courses = await db.course.findMany({
    where: opts.isAdmin ? {} : { authorId: opts.teacherId },
    select: {
      id: true,
      title: true,
      enrollments: {
        select: { progressPct: true, completed: true, lastActivityAt: true },
      },
    },
  });
  const since = new Date(Date.now() - rangeDays * 24 * 3600 * 1000);
  const allEnrollments = courses.flatMap((c) =>
    c.enrollments.map((e) => ({ ...e, courseId: c.id }))
  );
  const totalStudents =
    new Set(allEnrollments.map((e) => `${e.courseId}`)).size > 0
      ? allEnrollments.length
      : 0;
  const activeStudents = allEnrollments.filter(
    (e) => e.lastActivityAt && e.lastActivityAt >= since
  ).length;

  const attempts = await db.attempt.findMany({
    where: {
      lesson: { unit: { courseId: { in: courses.map((c) => c.id) } } },
      createdAt: { gte: since },
    },
    select: { correct: true },
  });
  const avgQuizScore =
    attempts.length > 0
      ? Math.round(
          (attempts.filter((a) => a.correct).length / attempts.length) * 100
        )
      : 0;

  const topCourses = courses
    .map((c) => {
      const meanPct =
        c.enrollments.length > 0
          ? Math.round(
              c.enrollments.reduce((a, e) => a + e.progressPct, 0) /
                c.enrollments.length
            )
          : 0;
      return {
        title: c.title,
        students: c.enrollments.length,
        completionPct: meanPct,
      };
    })
    .sort((a, b) => b.students - a.students)
    .slice(0, 3);

  // Worst funnel stage (deterministic — same logic as teacher.analytics).
  const totalE = allEnrollments.length || 1;
  const buckets = [0, 1, 25, 50, 75, 90, 100];
  const labels = [
    "Enrolled",
    "Started L1",
    "Finished U1",
    "Finished U2",
    "Quiz · Eq. 2-step",
    "Capstone",
    "Completed",
  ];
  const stages = buckets.map((threshold, i) => {
    const count = allEnrollments.filter((e) => e.progressPct >= threshold).length;
    return { label: labels[i], pct: Math.round((count / totalE) * 100), count };
  });
  let worstFunnel: WorstFunnel = null;
  let maxDrop = 0;
  for (let i = 1; i < stages.length; i++) {
    const d = stages[i - 1].pct - stages[i].pct;
    if (d > maxDrop) {
      maxDrop = d;
      worstFunnel = {
        stage: stages[i].label,
        pct: stages[i].pct,
        count: stages[i].count,
      };
    }
  }

  const demo = () =>
    buildDemoTeacherInsights({
      totalStudents,
      activeStudents,
      avgQuizScore,
      topCourses,
      worstFunnel,
    });

  let items: InsightItem[];
  let mode: InsightMode;
  if (isLlmEnabled() && totalStudents > 0) {
    try {
      const { data, mode: llmMode } = await completeStructured({
        schema: InsightBatchSchema,
        system: TEACHER_INSIGHT_SYSTEM_PROMPT,
        prompt: buildTeacherInsightPrompt({
          teacherName: opts.teacherName,
          rangeDays,
          totalStudents,
          activeStudents,
          avgQuizScore,
          topCourses,
          worstFunnel,
        }),
        maxTokens: 700,
      });
      items = data.insights;
      for (const it of items) {
        if (!TEACHER_KINDS.has(it.kind)) {
          it.kind = it.kind.toUpperCase().replace(/[^A-Z_]/g, "");
        }
      }
      if (items.filter((i) => TEACHER_KINDS.has(i.kind)).length !== 3) {
        items = demo();
        mode = "demo";
      } else {
        mode = llmMode;
      }
    } catch (err) {
      console.error("[insightEngine.teacher] LLM failed; using demo", err);
      items = demo();
      mode = "demo";
    }
  } else {
    items = demo();
    mode = "demo";
  }

  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await db.$transaction([
    db.insight.deleteMany({ where: { audience: "teacher", scope } }),
    ...items.map((it) =>
      db.insight.create({
        data: {
          audience: "teacher",
          scope,
          kind: it.kind,
          body: it.body,
          cta: it.cta ?? null,
          payload: {
            rangeDays,
            stats: { totalStudents, activeStudents, avgQuizScore, worstFunnel },
            mode,
          },
          expiresAt,
        },
      })
    ),
  ]);

  return {
    items,
    mode,
    stats: {
      courseCount: courses.length,
      totalStudents,
      activeStudents,
      avgQuizScore,
      worstFunnel,
    },
  };
}

/** Generate + persist an institution's 3 cached admin insights. */
export async function generateAdminInsights(
  db: PrismaClient,
  opts: { institutionId: string }
): Promise<{ items: InsightItem[]; mode: InsightMode; stats: AdminInsightStats }> {
  const { institutionId } = opts;
  const scope = `ADMIN:${institutionId}`;
  const institution = await db.institution.findUnique({
    where: { id: institutionId },
  });

  const [studentCount, teacherCount, classCount, attempts, teachers, curriculaCount] =
    await Promise.all([
      db.user.count({ where: { role: "STUDENT", institutionId } }),
      db.user.count({ where: { role: "TEACHER", institutionId } }),
      db.class.count({ where: { institutionId } }),
      db.attempt.findMany({
        where: { user: { institutionId } },
        select: { correct: true },
        take: 1000,
      }),
      db.user.findMany({
        where: { role: "TEACHER", institutionId },
        select: {
          name: true,
          firstName: true,
          taughtClasses: {
            select: { _count: { select: { students: true } } },
          },
        },
        take: 5,
      }),
      db.enrollment
        .groupBy({ by: ["courseId"], where: { user: { institutionId } } })
        .then((g) => g.length),
    ]);

  const avgQuizScore =
    attempts.length > 0
      ? Math.round(
          (attempts.filter((a) => a.correct).length / attempts.length) * 100
        )
      : 0;
  const topTeachers = teachers
    .map((t) => ({
      name: t.name ?? t.firstName ?? "—",
      classes: t.taughtClasses.length,
      students: t.taughtClasses.reduce((a, c) => a + c._count.students, 0),
    }))
    .sort((a, b) => b.students - a.students)
    .slice(0, 3);

  const demo = () =>
    buildDemoAdminInsights({ studentCount, teacherCount, avgQuizScore, topTeachers });

  let items: InsightItem[];
  let mode: InsightMode;
  if (isLlmEnabled() && (studentCount > 0 || teacherCount > 0)) {
    try {
      const { data, mode: llmMode } = await completeStructured({
        schema: InsightBatchSchema,
        system: ADMIN_INSIGHT_SYSTEM_PROMPT,
        prompt: buildAdminInsightPrompt({
          institutionName: institution?.name ?? "the institution",
          studentCount,
          teacherCount,
          classCount,
          avgQuizScore,
          topTeachers,
          curriculaCount,
        }),
        maxTokens: 700,
      });
      items = data.insights;
      for (const it of items) {
        if (!ADMIN_KINDS.has(it.kind)) {
          it.kind = it.kind.toUpperCase().replace(/[^A-Z_]/g, "");
        }
      }
      if (items.filter((i) => ADMIN_KINDS.has(i.kind)).length !== 3) {
        items = demo();
        mode = "demo";
      } else {
        mode = llmMode;
      }
    } catch (err) {
      console.error("[insightEngine.admin] LLM failed; using demo", err);
      items = demo();
      mode = "demo";
    }
  } else {
    items = demo();
    mode = "demo";
  }

  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await db.$transaction([
    db.insight.deleteMany({ where: { audience: "admin", scope } }),
    ...items.map((it) =>
      db.insight.create({
        data: {
          audience: "admin",
          scope,
          kind: it.kind,
          body: it.body,
          cta: it.cta ?? null,
          payload: {
            stats: {
              studentCount,
              teacherCount,
              classCount,
              avgQuizScore,
              topTeacherCount: topTeachers.length,
            },
            mode,
          },
          expiresAt,
        },
      })
    ),
  ]);

  return {
    items,
    mode,
    stats: { studentCount, teacherCount, classCount, avgQuizScore, topTeacherCount: topTeachers.length },
  };
}
