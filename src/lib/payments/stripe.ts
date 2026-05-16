import "server-only";
import { env } from "@/lib/env";

/**
 * Lazy-init Stripe client. Returns null when no key is configured —
 * callers should fall back to the demo flow in that case.
 *
 * We dynamically import the SDK so the codebase doesn't require `stripe`
 * to be installed for the demo flow to work. When you `npm i stripe` and
 * set STRIPE_SECRET_KEY, this lights up.
 */
let _client: unknown | null = null;
let _initialized = false;

export async function getStripe(): Promise<unknown | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (_initialized) return _client;
  _initialized = true;
  try {
    // @ts-expect-error - optional dep, may not be installed
    const StripeMod = (await import("stripe")).default;
    _client = new StripeMod(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-10-01.acacia" as never,
    });
    return _client;
  } catch {
    console.warn(
      "[stripe] STRIPE_SECRET_KEY set but `stripe` package not installed. Falling back to demo flow."
    );
    return null;
  }
}

export function isStripeEnabled(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/** Lyceum's platform fee in cents for a given gross. */
export function computeFeeCents(grossCents: number): number {
  return Math.round((grossCents * env.STRIPE_PLATFORM_FEE_BPS) / 10_000);
}
