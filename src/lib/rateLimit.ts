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
  /**
   * Hashed-IP key for anonymous callers (ctx.anonKey). Without it every
   * signed-out visitor shared ONE global allowance — a single crawler
   * could drain AI search for the whole anonymous internet. With it,
   * each anon caller gets their own bucket, and a (higher) global anon
   * ceiling stays on as the distributed-abuse backstop.
   */
  anonKey?: string | null;
  /** Optional kind to scope the check (e.g. only count tutor calls). Default: all ai.* */
  kind?: string;
}): Promise<void> {
  const now = Date.now();
  const windows = [
    { name: "minute" as const, since: new Date(now - 60_000) },
    { name: "hour" as const, since: new Date(now - 60 * 60_000) },
    { name: "day" as const, since: new Date(now - 24 * 60 * 60_000) },
  ];

  const isAnon = !args.actorId;
  const kind = args.kind ?? { startsWith: "ai." };

  // Each tier is (limits, where). Signed-in: one per-user tier. Anon
  // with a key: a tight per-caller tier (keyed on payload.anonKey,
  // which the AI surfaces stamp into their audit rows) + a loose global
  // ceiling. Anon without a key (no request scope): the old tight
  // global bucket, defensively.
  type Tier = {
    limits: { minute: number; hour: number; day: number };
    where: object;
    scope: "you" | "global";
  };
  const tiers: Tier[] = !isAnon
    ? [
        {
          limits: { minute: 10, hour: 60, day: 300 },
          where: { actorId: args.actorId, kind },
          scope: "you",
        },
      ]
    : args.anonKey
      ? [
          {
            limits: { minute: 4, hour: 30, day: 100 },
            where: {
              actorId: null,
              kind,
              payload: { path: ["anonKey"], equals: args.anonKey },
            },
            scope: "you",
          },
          {
            limits: { minute: 20, hour: 150, day: 500 },
            where: { actorId: null, kind },
            scope: "global",
          },
        ]
      : [
          {
            limits: { minute: 4, hour: 30, day: 100 },
            where: { actorId: null, kind },
            scope: "you",
          },
        ];

  for (const tier of tiers) {
    const counts = await Promise.all(
      windows.map((w) =>
        db.auditLog.count({
          where: { ...tier.where, createdAt: { gte: w.since } },
        })
      )
    );
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const limit = tier.limits[w.name];
      if (counts[i] >= limit) {
        const messages =
          tier.scope === "global"
            ? {
                minute: `Anonymous AI traffic is briefly rate-limited (${limit}/min platform-wide). Try again in a moment.`,
                hour: `Anonymous AI traffic has hit the hourly ceiling (${limit}/hr). Sign in for your own allowance.`,
                day: `Anonymous AI traffic has used the daily ceiling (${limit}/day). It resets at midnight UTC.`,
              }
            : {
                minute: `Slow down — that's ${limit} AI requests in the last minute. Try again in a moment.`,
                hour: `You've hit the hourly AI quota (${limit}/hr). Take a short break and come back.`,
                day: `You've used your daily AI quota (${limit}/day). It resets at midnight UTC.`,
              };
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: messages[w.name],
        });
      }
    }
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
