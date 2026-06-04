// Sentry — browser runtime init. Next.js auto-loads this file on the client
// (the client-side counterpart to instrumentation.ts).
//
// Gated on NEXT_PUBLIC_SENTRY_DSN (must be NEXT_PUBLIC_ to be inlined into the
// client bundle). Absent → enabled:false → no-op. We deliberately do NOT add
// Session Replay here: it records the DOM, which on a K-12 product means
// capturing student screens — not something we send to a third party by
// default. Add it later behind an explicit, consented opt-in if ever needed.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  sendDefaultPii: false,
});

// Instruments client-side navigations so traces span route transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
