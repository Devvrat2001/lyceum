import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateAdminInsights,
  generateTeacherInsights,
} from "@/server/services/insightEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Stop generating ~10s before the function ceiling so an in-flight LLM call
// can finish and we still return cleanly. Whatever we don't reach stays served
// by the on-demand regenerate path (or the next nightly run).
const BUDGET_MS = 50_000;
// Hard ceilings on the candidate sets so the queries themselves stay cheap.
const MAX_TEACHERS = 50;
const MAX_INSTITUTIONS = 50;

/**
 * Nightly AI-insight cache warmer. The teacher/admin analytics pages read a
 * 24h `Insight` cache and, on a miss, fire an LLM regeneration on the page's
 * critical path (slow first paint + cost per view). This pre-generates that
 * cache overnight so the pages load warm and stay fresh.
 *
 * Only scopes with real signal are touched — teachers who've authored a course,
 * institutions with at least one student — so empty accounts cost nothing
 * (the engine's demo fallback is instant anyway). Generation is sequential and
 * time-boxed; at larger scale the right evolution is QStash fan-out (as the
 * course generator already does), not a bigger single function.
 *
 * Security: identical posture to the other crons — refuse unless CRON_SECRET
 * is set AND the Bearer token matches. Without ANTHROPIC/OPENAI keys every
 * scope just writes deterministic demo insights, so this is safe pre-launch.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[/api/cron/ai-insights] CRON_SECRET not set — refusing to run"
    );
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const start = Date.now();
  const overBudget = () => Date.now() - start > BUDGET_MS;

  const teachers = await db.user.findMany({
    where: { role: "TEACHER", authoredCourses: { some: {} } },
    select: { id: true, name: true, email: true },
    take: MAX_TEACHERS,
  });
  const institutions = await db.institution.findMany({
    where: { users: { some: { role: "STUDENT" } } },
    select: { id: true },
    take: MAX_INSTITUTIONS,
  });

  let teachersWarmed = 0;
  let adminsWarmed = 0;
  let skipped = false;

  for (const t of teachers) {
    if (overBudget()) {
      skipped = true;
      break;
    }
    try {
      await generateTeacherInsights(db, {
        teacherId: t.id,
        teacherName: t.name ?? t.email ?? "Teacher",
        isAdmin: false,
      });
      teachersWarmed++;
    } catch (err) {
      console.error(`[ai-insights] teacher ${t.id} failed`, err);
    }
  }

  for (const inst of institutions) {
    if (overBudget()) {
      skipped = true;
      break;
    }
    try {
      await generateAdminInsights(db, { institutionId: inst.id });
      adminsWarmed++;
    } catch (err) {
      console.error(`[ai-insights] institution ${inst.id} failed`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    teachersWarmed,
    adminsWarmed,
    skipped, // true if we hit the time budget before finishing
    elapsedMs: Date.now() - start,
  });
}
