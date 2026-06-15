import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /**
   * Security response headers (REQUIREMENTS R50). Applied to every route.
   * CSP is deliberately omitted for now — the app styles everything via
   * inline `style={{}}` and emits JSON-LD via `dangerouslySetInnerHTML`, so
   * a strict policy needs nonces/refactoring; that's the R50 tail (start
   * report-only). These header-only hardenings are free and high-value.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // The SPEAK block uses the mic (SpeechRecognition); camera +
          // geolocation are unused, so deny them outright.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

// Phase 6.2 — Sentry. Only wrap the config when SENTRY_DSN is set, so a build
// without Sentry provisioned is byte-for-byte the current build (zero risk to
// the live deploy). When set, this injects the release + uploads source maps
// (needs SENTRY_AUTH_TOKEN + org/project on Vercel) for readable stack traces.
const withSentry: NextConfig = process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Keep build logs quiet; the plugin is chatty by default.
      silent: true,
      // No auth token (e.g. preview builds) → skip upload instead of failing.
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : nextConfig;

// Phase 6.4 — i18n (next-intl, no routing). The locale comes from a cookie
// (src/i18n/request.ts), so this just registers the request config; it doesn't
// touch routing or the build shape.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(withSentry);
