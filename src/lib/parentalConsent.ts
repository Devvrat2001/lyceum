/**
 * Verifiable parental consent gate (R47, COPPA — R11 v2). An under-13
 * account is "awaiting consent" until a parent confirms via the emailed
 * link (which stamps `parentConsentAt`). Pure + dependency-free so it can
 * be used on the server (queries) and the client (banners) alike.
 *
 * v1 surfaces the state (account.me → `awaitingParentalConsent`); the
 * hard access gate (blocking lessons until confirmed) is the v2 step.
 */
export function isAwaitingParentalConsent(u: {
  ageBand: string | null;
  parentConsentAt: Date | null;
}): boolean {
  return u.ageBand === "under13" && u.parentConsentAt === null;
}
