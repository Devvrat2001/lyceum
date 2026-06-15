import "server-only";
import { db } from "@/lib/db";

/**
 * Account-creation throttle (REQUIREMENTS R51). `auth.signup` was the last
 * unguarded public mutation — `requestPasswordReset` is rate-limited, but a
 * bot could mass-create accounts through signup. Reuses the AuditLog table
 * as the counter (same pattern as `checkAIQuota` / `loginRateLimit`): each
 * signup writes an `auth.signup` row stamped with the caller's hashed-IP
 * `anonKey`, and this counts them per key in a sliding window.
 *
 * Skips entirely when there's no IP scope (`anonKey` absent) so the test
 * suite — which signs up many users with no request context — is never
 * throttled. The token-gated mutations (resetPassword / verifyEmail /
 * confirmParentalConsent) need no IP throttle: their 32-byte tokens are
 * infeasible to brute-force.
 *
 * Generous limit (per IP, not global) so a small classroom or a family
 * behind one NAT can still self-serve; a bot flood (hundreds/min) is what
 * this stops.
 */
const WINDOW_MS = 60 * 60_000; // 1 hour
const MAX_PER_IP = 20;

export async function isSignupThrottled(
  anonKey: string | null | undefined
): Promise<boolean> {
  if (!anonKey) return false;
  const since = new Date(Date.now() - WINDOW_MS);
  const count = await db.auditLog.count({
    where: {
      kind: "auth.signup",
      createdAt: { gte: since },
      payload: { path: ["anonKey"], equals: anonKey },
    },
  });
  return count >= MAX_PER_IP;
}
