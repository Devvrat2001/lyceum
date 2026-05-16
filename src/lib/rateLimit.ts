import "server-only";
import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";

/**
 * AI quota check. Uses the same AuditLog table that every AI surface
 * already writes to, so we don't need a separate counter store.
 *
 * Tiers (per actor):
 *   minute:  10  bursts
 *   hour:    60
 *   day:    300
 *
 * Anonymous (actorId === null) gets a *much* lower allowance — these
 * are unauthed public surfaces (marketplace.aiSearch) and we don't
 * want a single logged-out crawler to drain the budget.
 *
 * Throws TRPCError({code: "TOO_MANY_REQUESTS"}) on overage. The
 * thrown error includes a friendly message naming the bucket so the
 * client can render something useful. Add `retryAfterSeconds` in
 * cause if we ever need it programmatically.
 */
export async function checkAIQuota(args: {
  actorId: string | null;
  /** Optional kind to scope the check (e.g. only count tutor calls). Default: all ai.* */
  kind?: string;
}): Promise<void> {
  const now = Date.now();
  const oneMinuteAgo = new Date(now - 60_000);
  const oneHourAgo = new Date(now - 60 * 60_000);
  const oneDayAgo = new Date(now - 24 * 60 * 60_000);

  // Override caps for anonymous callers.
  const isAnon = !args.actorId;
  const limits = {
    minute: isAnon ? 4 : 10,
    hour: isAnon ? 30 : 60,
    day: isAnon ? 100 : 300,
  };

  // We only consider AI events. Other audit kinds (auth.signup,
  // course.publish, …) shouldn't burn the AI quota.
  const baseWhere = {
    actorId: args.actorId,
    kind: args.kind ?? { startsWith: "ai." },
  } as const;

  const [perMinute, perHour, perDay] = await Promise.all([
    db.auditLog.count({
      where: { ...baseWhere, createdAt: { gte: oneMinuteAgo } },
    }),
    db.auditLog.count({
      where: { ...baseWhere, createdAt: { gte: oneHourAgo } },
    }),
    db.auditLog.count({
      where: { ...baseWhere, createdAt: { gte: oneDayAgo } },
    }),
  ]);

  if (perMinute >= limits.minute) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Slow down — that's ${limits.minute} AI requests in the last minute. Try again in a moment.`,
    });
  }
  if (perHour >= limits.hour) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `You've hit the hourly AI quota (${limits.hour}/hr). Take a short break and come back.`,
    });
  }
  if (perDay >= limits.day) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `You've used your daily AI quota (${limits.day}/day). It resets at midnight UTC.`,
    });
  }
}

/**
 * Variant for streaming endpoints that throw outside tRPC. Returns
 * a structured shape the caller can surface as an SSE error.
 */
export async function checkAIQuotaSoft(args: {
  actorId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await checkAIQuota(args);
    return { ok: true };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "TOO_MANY_REQUESTS") {
      return { ok: false, message: e.message };
    }
    throw e;
  }
}
