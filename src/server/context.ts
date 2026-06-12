import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import type { Session } from "next-auth";

export type Context = {
  db: typeof db;
  session: Session | null;
  /**
   * Privacy-preserving per-caller key for ANONYMOUS rate limiting:
   * sha256(first-hop IP + NEXTAUTH_SECRET), truncated — never the raw
   * IP. Only computed for signed-out callers (signed-in quota keys on
   * the user id). Optional so test callers and probe scripts that build
   * a Context literal don't have to supply it; absence just means anon
   * quota falls back to the shared global bucket.
   */
  anonKey?: string | null;
};

export async function createContext(): Promise<Context> {
  const session = await auth();

  let anonKey: string | null = null;
  if (!session?.user) {
    try {
      const h = await headers();
      const ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        "unknown";
      anonKey = createHash("sha256")
        .update(`${ip}|${env.NEXTAUTH_SECRET}`)
        .digest("hex")
        .slice(0, 24);
    } catch {
      // headers() is request-scoped; outside a request (build-time
      // render, scripts) there's no caller to key — global bucket only.
    }
  }

  return {
    db,
    session,
    anonKey,
  };
}
