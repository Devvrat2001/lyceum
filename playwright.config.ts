import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Lyceum end-to-end browser smokes.
 *
 * Strategy: tests run against a real `next dev` server (Postgres in
 * Docker on port 5433) launched by Playwright's `webServer` block.
 * This is slower than vitest (~30-60s warm-up vs <1s) but exercises
 * the actual cookie + Auth.js session + tRPC HTTP layer that vitest
 * deliberately skips.
 *
 * Browsers: chromium only for v1 — Firefox/WebKit add ~300MB to the
 * install for marginal coverage of our SPA-shaped surface. Add them
 * when a cross-browser regression actually bites.
 *
 * Workers: 1. Tests share the dev DB and rely on the `test-vitest-*`
 * email prefix cleanup pattern from `test/helpers.ts` — parallel
 * workers would race that prefix across tests. The vitest suite
 * already enforces the same serialisation via `fileParallelism: false`.
 */
export default defineConfig({
  testDir: "./e2e",
  // Excluded from `testDir` discovery so the runner doesn't try to
  // execute it as a spec.
  testMatch: "**/*.spec.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  // Each test gets one retry on CI failure (flake guard). Locally we
  // surface failures fast so authors can iterate.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    // Capture on failure only — full traces are large.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // First-boot of next dev with Turbopack + Prisma adapter on this
    // machine routinely takes 30-60s. Generous timeout, but no retry.
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    // Force demo-mode payments so buy-flow.spec is deterministic
    // regardless of whether the developer has live Stripe test keys in
    // .env.local. An empty STRIPE_SECRET_KEY shadows the .env.local
    // value (@next/env won't override an already-set env var, even to
    // ""), so isStripeEnabled() is false and createCheckoutSession uses
    // the demo path the spec drives. NB: a *reused* server must already
    // be in demo mode — stop a Stripe-mode dev server before e2e.
    env: {
      ...(process.env as Record<string, string>),
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
    },
    // Surface dev-server stdout/stderr in the Playwright output so
    // route-level errors are debuggable from the test log.
    stdout: "pipe",
    stderr: "pipe",
  },
});
