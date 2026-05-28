import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  courseEmbedText,
  embedText,
  isEmbeddingsEnabled,
  vectorLiteral,
} from "@/lib/ai/embeddings";

// Embedding 50 courses sequentially at ~600ms apiece + 150ms sleep
// fits comfortably under Vercel's 60s function ceiling. Bump
// MAX_PER_TICK if you outgrow this (and pair with a maxDuration
// bump) — but the hourly cadence means even an unloaded catalog of
// thousands catches up within a day.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_PER_TICK = 50;
const SLEEP_MS = 150;

/**
 * Cron-triggered sweep that embeds any PUBLISHED course missing an
 * embedding vector. Vercel Cron POSTs `/api/cron/backfill-embeddings`
 * on the schedule defined in `vercel.json` (hourly at minute 0).
 *
 * Why a sweep instead of relying purely on the publish-hook:
 *   * The publish-hook is event-driven and only fires when a teacher
 *     actively flips DRAFT→PUBLISHED or edits an embed-relevant
 *     field. Courses published before the embedding column existed
 *     (or before an OpenAI key was configured) sit indefinitely
 *     with `embedding IS NULL` until something edits them again.
 *   * If OpenAI 5xx's the moment a teacher publishes, the hook logs
 *     + swallows — the course stays unembedded. This sweep is the
 *     safety net that catches those rows on the next tick.
 *
 * Security: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * automatically when a `CRON_SECRET` env var is set on the project.
 * Without it the route would be world-callable and any bot could
 * burn our OpenAI quota by spamming /api/cron/backfill-embeddings.
 * We refuse to run unless the secret is configured AND matches —
 * same posture as the QStash webhook signature verification.
 *
 * Per-tick budget: at most MAX_PER_TICK courses are processed.
 * Larger backlogs catch up over multiple ticks (50/hour × 24 =
 * 1200/day). Trade-off: keeps each invocation well under the
 * function timeout and OpenAI's per-second rate limits.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refuse to run with no secret configured — exposing an
    // unauthenticated OpenAI-cost endpoint to the public internet
    // is worse than skipping the sweep.
    console.error(
      "[/api/cron/backfill-embeddings] CRON_SECRET not set — refusing to run"
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

  if (!isEmbeddingsEnabled()) {
    // No OpenAI key configured: log and return ok rather than
    // erroring. The cron will keep ticking; once a key is added the
    // backlog catches up on its own. Erroring here would create
    // confusing red marks in the Vercel cron dashboard.
    console.warn(
      "[/api/cron/backfill-embeddings] embeddings disabled (no OpenAI key); skipping"
    );
    return NextResponse.json({
      ok: true,
      skipped: "embeddings_disabled",
      embedded: 0,
      failed: 0,
    });
  }

  // Find candidates. Prisma can't filter on `Unsupported` columns
  // so we go raw — selecting just the ids of PUBLISHED rows whose
  // embedding is NULL, ordered by createdAt so the oldest gaps
  // close first (predictable behaviour across runs).
  const candidates = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Course"
    WHERE "status" = 'PUBLISHED'
      AND "embedding" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT ${MAX_PER_TICK}
  `;

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, embedded: 0, failed: 0, remaining: 0 });
  }

  // Pull the embed-text inputs for the candidates. One round-trip
  // through Prisma's typed API for the readable fields.
  const courses = await db.course.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      description: true,
      subject: true,
      grade: true,
    },
  });

  let embedded = 0;
  let failed = 0;
  for (const c of courses) {
    try {
      const vec = await embedText(courseEmbedText(c));
      if (!vec) {
        failed += 1;
        console.warn(`[cron-embed] ${c.slug}: embedText returned null`);
        continue;
      }
      const lit = vectorLiteral(vec);
      await db.$executeRaw`
        UPDATE "Course"
        SET "embedding" = ${lit}::vector
        WHERE "id" = ${c.id}
      `;
      embedded += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron-embed] ${c.slug}: ${msg}`);
    }
    if (SLEEP_MS > 0) {
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }
  }

  // Re-probe to report how much is still outstanding so the cron
  // dashboard surface tells the operator at a glance whether the
  // backlog is shrinking.
  const remainingRows = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
    FROM "Course"
    WHERE "status" = 'PUBLISHED' AND "embedding" IS NULL
  `;
  // BigInt arithmetic dodge: COUNT(*)::bigint comes back as a JS
  // bigint via the pg driver, and the project's tsconfig target
  // pre-dates ES2020 bigint literals. Coerce through String → Number.
  const rawCount = remainingRows[0]?.n;
  const remaining = rawCount === undefined ? 0 : Number(rawCount);

  return NextResponse.json({
    ok: true,
    embedded,
    failed,
    processed: courses.length,
    remaining,
  });
}
