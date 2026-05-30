import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Vitest config for Lyceum's starter critical-path suite.
 *
 * Tests run against the real dev Postgres (port 5433 in Docker). Each
 * test creates ephemeral users with a `test-vitest-` email prefix and
 * relies on `onDelete: Cascade` to wipe everything they touched at the
 * end of the file. This is intentionally simpler than per-test
 * transactions — Prisma 7 doesn't expose a clean rollback handle, and
 * the cost of `user.deleteMany({startsWith})` is bounded by what one
 * test created (≤ ~10 rows).
 *
 * Serialisation matters because every file shares the same Postgres:
 * - `pool: "forks"` keeps each test file in its own Node process
 *   (clean module-cache between files; matters because `db` is a
 *   singleton stashed on globalThis)
 * - `fileParallelism: false` runs files one at a time so cleanups
 *   from one file can't race writes from another. Vitest 4 removed
 *   the old `poolOptions.forks.singleFork` knob; this is the
 *   supported way to serialise.
 */
export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    // Loads .env.local + .env so DATABASE_URL etc. are present, same
    // contract as `tsx --env-file=...` in the probe scripts.
    env: loadDotEnv(),
  },
  resolve: {
    alias: {
      // Mirror tsconfig "@/* → src/*" so router files resolve.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The `server-only` npm package throws on import to keep server
      // modules out of client bundles. Tests legitimately import
      // server modules, so swap it for a no-op shim — same trick as
      // mocking out a build-time-only guard.
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
});

/**
 * Read .env.local + .env into a plain { key: value } map. Vitest doesn't
 * honour `--env-file` flags (that's a Node 20+ feature for the runtime,
 * not for vitest), so we shim the same shape ourselves.
 */
function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  // Keep live Stripe secrets out of the automated suite so payments run
  // in deterministic demo mode. `isStripeEnabled()` is keyed on
  // STRIPE_SECRET_KEY; if a developer has live test-mode keys in
  // .env.local, `payment.createCheckoutSession` would mint a `stripe`
  // order and the demo-path tests (demoConfirm / refundOrder) would
  // fail with "Only demo orders can be confirmed". Real-Stripe flows are
  // covered by the manual smoke test, not this suite.
  const SKIP_KEYS = new Set(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  for (const name of [".env", ".env.local"]) {
    const url = new URL(`./${name}`, import.meta.url);
    let text: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      text = require("node:fs").readFileSync(fileURLToPath(url), "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (SKIP_KEYS.has(key)) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith(`"`) && value.endsWith(`"`)) ||
        (value.startsWith(`'`) && value.endsWith(`'`))
      ) {
        value = value.slice(1, -1);
      }
      // Don't clobber a real env var — .env files are the fallback.
      if (out[key] === undefined) out[key] = value;
    }
  }
  return out;
}
