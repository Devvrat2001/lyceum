import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendWeeklyDigest } from "@/lib/email";
import { buildWeeklyDigests } from "@/server/services/weeklyDigest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly student progress digest. `buildWeeklyDigests` selects opted-in
 * students with activity in the trailing 7 days and aggregates their week;
 * we then hand each row to `sendWeeklyDigest`. When RESEND_API_KEY is unset
 * the send is a logged no-op, so this runs harmlessly before email is live
 * (sent: 0). Once the key lands, the same cron starts delivering.
 *
 * Scheduled in `vercel.json` (Mondays 13:00 UTC — a fresh-week nudge). The
 * `emailOptOut` toggle on /settings governs the audience, so this honors the
 * student's own choice end-to-end.
 *
 * Security: identical posture to `/api/cron/streak-rollover` — refuse unless
 * CRON_SECRET is configured AND the Bearer token matches, so the endpoint
 * can't be triggered from the public internet (and can't fan out email).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[/api/cron/weekly-digest] CRON_SECRET not set — refusing to run"
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

  const digests = await buildWeeklyDigests(db);
  let sent = 0;
  for (const d of digests) {
    const delivered = await sendWeeklyDigest({
      to: d.email,
      firstName: d.firstName,
      lessonsCompleted: d.lessonsCompleted,
      questionsAnswered: d.questionsAnswered,
      questionsCorrect: d.questionsCorrect,
      xpEarned: d.xpEarned,
      streak: d.streak,
      dashboardUrl: `${env.PUBLIC_BASE_URL}/student`,
    });
    if (delivered) sent++;
  }

  return NextResponse.json({ ok: true, candidates: digests.length, sent });
}
