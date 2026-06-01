import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expireStaleStreaks } from "@/server/services/streakEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily streak-rollover sweep. Streaks advance lazily (bumpStreak only runs
 * on activity), so a user who stops showing up keeps a stale "N day streak"
 * on the dashboard + leaderboard until they next act. This cron breaks those
 * streaks at the UTC day boundary so the displayed number is honest — and
 * lays the groundwork for a "you broke your streak" nudge email once Resend
 * is wired (6.1).
 *
 * Vercel Cron hits this on the schedule in `vercel.json` (00:05 UTC daily —
 * just after midnight so the missed day is finalized).
 *
 * Security: identical posture to `/api/cron/backfill-embeddings`. Vercel Cron
 * sends `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET
 * is set on the project. We refuse to run unless it's configured AND matches,
 * so the endpoint can't be triggered from the public internet.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[/api/cron/streak-rollover] CRON_SECRET not set — refusing to run"
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

  const broken = await expireStaleStreaks(db);
  return NextResponse.json({ ok: true, broken });
}
