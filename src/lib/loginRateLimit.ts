import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Credentials login throttling (REQUIREMENTS R46). The signup +
 * password-reset routers are already rate-limited, but the NextAuth
 * credentials `authorize()` bcrypt-compared with no attempt cap, so
 * password-guessing against a known email was unthrottled.
 *
 * Reuses the AuditLog table as the counter store (same pattern as
 * `checkAIQuota`) — no separate store, no migration. Each failed login
 * writes an `auth.login_failed` row stamped with the attempted email +
 * caller IP; the throttle counts those rows in a sliding window.
 *
 * Two independent buckets so neither alone is too blunt:
 *  - per-email: caps guesses against one account (account-targeted brute
 *    force). A successful login isn't required to reset — rows age out.
 *  - per-IP: catches user-enumeration sweeps across many emails from one
 *    host. Set higher to tolerate shared NAT / school networks.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

/** Best-effort IP from a NextAuth request (x-forwarded-for on Vercel). */
export function ipFromRequest(req: Request | undefined): string {
  const xff = req?.headers?.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req?.headers?.get("x-real-ip")?.trim() || "unknown";
}

/** True when this email *or* IP has too many recent failures. */
export async function isLoginThrottled(params: {
  email: string;
  ip: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.auditLog.count({
      where: {
        kind: "auth.login_failed",
        createdAt: { gte: since },
        payload: { path: ["email"], equals: params.email },
      },
    }),
    params.ip === "unknown"
      ? Promise.resolve(0)
      : db.auditLog.count({
          where: {
            kind: "auth.login_failed",
            createdAt: { gte: since },
            payload: { path: ["ip"], equals: params.ip },
          },
        }),
  ]);
  return byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP;
}

/** Record one failed credentials attempt. Fire-and-forget via `audit`. */
export async function recordLoginFailure(params: {
  email: string;
  ip: string;
}): Promise<void> {
  await audit({
    kind: "auth.login_failed",
    payload: { email: params.email, ip: params.ip },
  });
}
