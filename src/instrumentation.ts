// Next.js instrumentation hook — runs once per server/edge runtime at boot.
// We use it to initialize Sentry per-runtime and to forward server-side
// request errors (Server Components, route handlers, proxy) to Sentry.
//
// All of this is a no-op until SENTRY_DSN is set (see the per-runtime
// configs), so it's safe to ship dark.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, and the proxy.
// (tRPC swallows its own errors into the response, so those are reported
// separately from the tRPC handler's onError — see app/api/trpc/[trpc].)
export const onRequestError = Sentry.captureRequestError;
