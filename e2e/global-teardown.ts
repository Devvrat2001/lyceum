import type { FullConfig } from "@playwright/test";

/**
 * Playwright global teardown: wipe every test-vitest-* user that any
 * spec created during this run.
 *
 * `e2e/buy-flow.spec.ts` signs up a fresh `test-vitest-buy-${Date.now()}`
 * user that owns a real Order + Enrollment. Without this teardown,
 * those rows sit in the dev DB until the next `npm test` run hits
 * vitest's `cleanupTestUsers` helper.
 *
 * Cleanup chain mirrors `test/helpers.ts:cleanupTestUsers`:
 *   1. Delete courses authored by test users (Course.author is the
 *      lone Restrict relation; everything else cascades).
 *   2. Delete the users themselves; cascade rules wipe Order /
 *      Enrollment / Attempt / XPEvent / Streak / Notification /
 *      ParentChild / BlockVote / etc. downstream.
 *
 * Implementation notes:
 *   - The project's `package.json` doesn't set `"type": "module"`, so
 *     Playwright's config loader treats this .ts file as CommonJS and
 *     trips on top-level `import` statements other than `import type`.
 *     Runtime imports use `require()` instead.
 *   - We don't go through `src/lib/db` — Playwright's loader doesn't
 *     honour the `@/*` tsconfig alias, so the app's db singleton
 *     isn't reachable from here. Build a fresh Prisma client off
 *     `DATABASE_URL` instead.
 */
export default async function globalTeardown(_config: FullConfig) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config: loadDotEnv } = require("dotenv");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");

  const projectRoot = path.resolve(__dirname, "..");
  loadDotEnv({ path: path.join(projectRoot, ".env.local") });
  loadDotEnv({ path: path.join(projectRoot, ".env") });

  const url = process.env.DATABASE_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.warn(
      "[playwright teardown] DATABASE_URL not set — skipping test-user cleanup"
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@prisma/client");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg");

  const adapter = new PrismaPg(url);
  const db = new PrismaClient({ adapter });
  const PREFIX = "test-vitest-";
  try {
    await db.course.deleteMany({
      where: { author: { email: { startsWith: PREFIX } } },
    });
    const { count } = await db.user.deleteMany({
      where: { email: { startsWith: PREFIX } },
    });
    if (count > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[playwright teardown] wiped ${count} test-vitest-* user(s)`
      );
    }
  } finally {
    await db.$disconnect();
  }
}
