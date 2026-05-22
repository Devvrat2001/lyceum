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
    const StripeMod = (await import("stripe")).default;
    // No apiVersion pin — use the SDK's built-in default. A hardcoded
    // version string only stays valid for the SDK build it was written
    // against; a stale one throws "Invalid Stripe API version".
    _client = new StripeMod(env.STRIPE_SECRET_KEY);
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
