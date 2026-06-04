import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
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
