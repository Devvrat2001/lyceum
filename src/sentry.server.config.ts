// Sentry — Node.js server runtime init. Loaded by `register()` in
// instrumentation.ts when NEXT_RUNTIME === "nodejs".
//
// Dormant-safe: with no SENTRY_DSN the SDK inits `enabled:false` and every
// capture becomes a no-op, so this is harmless in dev/test/un-provisioned prod.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  // 100% of traces in dev for visibility; 10% in prod to bound cost. Tune as
  // real traffic data arrives.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // COPPA/FERPA: this is a children's-data product. Do NOT auto-attach IP
  // addresses or request headers — we never want student PII in a third-party
  // error tracker. Attach only what we explicitly tag.
  sendDefaultPii: false,
});
