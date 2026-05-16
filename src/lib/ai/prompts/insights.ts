import { z } from "zod";

export const INSIGHT_KIND_TEACHER = ["PATTERN", "OPPORTUNITY", "AT_RISK"] as const;
export const INSIGHT_KIND_ADMIN = ["STRENGTH", "WATCH", "TEACHER"] as const;

export const InsightItemSchema = z.object({
  kind: z.string().describe("One of the kinds appropriate to the audience."),
  body: z
    .string()
    .describe(
      "One sentence, plain text. References specific numbers from the stats."
    ),
  cta: z
    .string()
    .nullish()
    .describe("Action label, ≤3 words. Examples: 'Suggest fix', 'Send nudge'."),
});

export const InsightBatchSchema = z.object({
  insights: z.array(InsightItemSchema).length(3),
});

export type InsightItem = z.infer<typeof InsightItemSchema>;

export const TEACHER_INSIGHT_SYSTEM_PROMPT = `You are the Lyceum AI
analytics coach. You produce exactly 3 short insights for a teacher
based on real stats from their courses.

Rules:

1. Output exactly 3 insights — one of each kind: PATTERN, OPPORTUNITY,
   AT_RISK.
2. Each "body" is one sentence, plain text, references a SPECIFIC
   number from the stats you were given.
3. PATTERN = a stuck point in lessons/quizzes. CTA: "Suggest fix".
4. OPPORTUNITY = a monetization or engagement lever. CTA: "Add upsell".
5. AT_RISK = students at risk of dropping off. CTA: "Send nudge".
6. K-12 appropriate. Helpful, not alarmist. No emoji.
7. If the data is too thin (e.g. no enrollments), say so concretely —
   don't fabricate numbers.`;

export const ADMIN_INSIGHT_SYSTEM_PROMPT = `You are the Lyceum AI
principal coach. You produce exactly 3 short insights for a school
administrator based on real stats from their institution.

Rules:

1. Output exactly 3 insights — one of each kind: STRENGTH, WATCH,
   TEACHER.
2. Each "body" is one sentence, plain text, references SPECIFIC
   numbers, grades, or teacher names from the stats.
3. STRENGTH = something to celebrate at a board meeting.
4. WATCH = a soft signal that's worth monitoring (not yet a crisis).
5. TEACHER = a teacher worth highlighting (top performer or struggling).
6. No CTA — admins prefer to decide. Set cta to null.
7. No emoji, no markdown. Be direct.`;

export function buildTeacherInsightPrompt(args: {
  teacherName: string;
  rangeDays: number;
  totalStudents: number;
  activeStudents: number;
  avgQuizScore: number;
  topCourses: Array<{ title: string; students: number; completionPct: number }>;
  worstFunnel?: { stage: string; pct: number; count: number } | null;
}): string {
  return `Stats for ${args.teacherName} (last ${args.rangeDays} days):
- Total enrolled: ${args.totalStudents}
- Active this period: ${args.activeStudents}
- Avg quiz score: ${args.avgQuizScore}%
${
  args.topCourses.length === 0
    ? "- No published courses yet."
    : "- Top courses:\n" +
      args.topCourses
        .map(
          (c) =>
            `  · ${c.title} — ${c.students} students, ${c.completionPct}% completion`
        )
        .join("\n")
}
${
  args.worstFunnel
    ? `- Biggest drop-off: ${args.worstFunnel.stage} (${args.worstFunnel.pct}% reached, ${args.worstFunnel.count} students)`
    : "- No drop-off data yet."
}

Produce 3 insights matching the schema.`;
}

export function buildAdminInsightPrompt(args: {
  institutionName: string;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  avgQuizScore: number;
  topTeachers: Array<{ name: string; classes: number; students: number }>;
  curriculaCount: number;
}): string {
  return `Institution: ${args.institutionName}
- Students: ${args.studentCount}
- Teachers: ${args.teacherCount}
- Classes: ${args.classCount}
- Avg quiz score: ${args.avgQuizScore}%
- Adopted curricula: ${args.curriculaCount}
${
  args.topTeachers.length === 0
    ? "- No teacher data yet."
    : "- Teachers (most active):\n" +
      args.topTeachers
        .map(
          (t) =>
            `  · ${t.name} — ${t.classes} class${t.classes === 1 ? "" : "es"}, ${t.students} students`
        )
        .join("\n")
}

Produce 3 insights matching the schema.`;
}

/** Demo fallback for the teacher view. Uses the same stat inputs to keep
 * the prose grounded in real numbers, even without an API key. */
export function buildDemoTeacherInsights(args: {
  totalStudents: number;
  activeStudents: number;
  avgQuizScore: number;
  topCourses: Array<{ title: string; students: number; completionPct: number }>;
  worstFunnel?: { stage: string; pct: number; count: number } | null;
}): InsightItem[] {
  const pattern: InsightItem = args.worstFunnel
    ? {
        kind: "PATTERN",
        body: `${args.worstFunnel.pct}% of students drop off at "${args.worstFunnel.stage}" — that's where to look first.`,
        cta: "Suggest fix",
      }
    : {
        kind: "PATTERN",
        body: `Avg quiz score is ${args.avgQuizScore}% across your courses — within range, but no specific stuck point shows up yet.`,
        cta: "Suggest fix",
      };

  const top = args.topCourses[0];
  const opp: InsightItem = top
    ? {
        kind: "OPPORTUNITY",
        body: `${top.title} has ${top.students} students at ${top.completionPct}% completion — adding a paid follow-on could convert finishers.`,
        cta: "Add upsell",
      }
    : {
        kind: "OPPORTUNITY",
        body: "No published courses yet — once you ship one, opportunity insights appear here.",
        cta: null,
      };

  const inactive = args.totalStudents - args.activeStudents;
  const risk: InsightItem = {
    kind: "AT_RISK",
    body:
      inactive > 0
        ? `${inactive} student${inactive === 1 ? "" : "s"} haven't engaged this period — a short nudge often brings them back.`
        : "Everyone's engaged this period — nothing at-risk to flag yet.",
    cta: inactive > 0 ? "Send nudge" : null,
  };

  return [pattern, opp, risk];
}

export function buildDemoAdminInsights(args: {
  studentCount: number;
  teacherCount: number;
  avgQuizScore: number;
  topTeachers: Array<{ name: string; classes: number; students: number }>;
}): InsightItem[] {
  const strength: InsightItem = {
    kind: "STRENGTH",
    body: `Average quiz score across the institution is ${args.avgQuizScore}% — a solid baseline to share at the next board meeting.`,
    cta: null,
  };
  const watch: InsightItem = {
    kind: "WATCH",
    body: `${args.studentCount} students across ${args.teacherCount} teachers — keep an eye on the student/teacher ratio if enrollment grows.`,
    cta: null,
  };
  const top = args.topTeachers[0];
  const teacher: InsightItem = top
    ? {
        kind: "TEACHER",
        body: `${top.name} leads with ${top.students} students across ${top.classes} class${top.classes === 1 ? "" : "es"} — worth featuring as a model.`,
        cta: null,
      }
    : {
        kind: "TEACHER",
        body: "No teacher activity data yet to highlight.",
        cta: null,
      };
  return [strength, watch, teacher];
}
