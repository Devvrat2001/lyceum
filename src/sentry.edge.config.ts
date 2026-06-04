// Sentry — Edge runtime init (proxy.ts, edge route handlers). Loaded by
// `register()` in instrumentation.ts when NEXT_RUNTIME === "edge".
//
// Same dormant-safe gating as the server config. Note the Edge runtime can't
// run the profiling/Node integrations, so this is intentionally minimal.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  sendDefaultPii: false,
});
