import { expect, test } from "@playwright/test";

/**
 * End-to-end: dev quick-login as a seeded STUDENT lands on /student
 * with a working session cookie. Covers the boundary that vitest
 * deliberately skips — Auth.js v5 CSRF, JWT cookie write, and the
 * proxy.ts role gate redirecting unauth → /login.
 *
 * Requires the seed (`npm run db:seed`) to have run at least once;
 * picks the first STUDENT quick-login button rather than a specific
 * email so the test is robust to seed-data tweaks.
 *
 * Dev-only path: in production the quick-login UI is gated to
 * `NODE_ENV === 'development'`. The test runs against `npm run dev`
 * via playwright's `webServer` block, so the gate is open.
 */
test("dev quick-login as STUDENT → lands on /student dashboard", async ({
  page,
}) => {
  await page.goto("/login");

  // The login page groups quick-login buttons by role into Cards. Find
  // the STUDENT card via its monospace header label, then click the
  // first button inside it.
  const studentCard = page
    .locator("div")
    .filter({ hasText: /^STUDENT$/ })
    .locator("xpath=ancestor::*[contains(@class, 'wf-card') or @data-card][1]")
    .first();

  // Fallback: if the card locator can't latch, just click the first
  // button whose accessible name contains an @cedar.test email under
  // a STUDENT-headed group.
  let button;
  if (await studentCard.count()) {
    button = studentCard.getByRole("button").first();
  } else {
    button = page
      .getByRole("button", { name: /@cedar\.test/i })
      .first();
  }
  await expect(button).toBeVisible({ timeout: 10_000 });

  // Click + wait for the proxy.ts gate to allow /student through after
  // the JWT cookie is set.
  await Promise.all([
    page.waitForURL(/\/student(\b|\/|$)/, { timeout: 20_000 }),
    button.click(),
  ]);

  // Student dashboard renders with some real content — at minimum a
  // sidebar nav with "Library" or a top-level heading. Don't assert
  // specific seed text (varies per user) — assert the chrome rendered.
  await expect(
    page.getByRole("link", { name: /library|skill tree|progress/i }).first()
  ).toBeVisible({ timeout: 10_000 });
});

test("unauthenticated /student redirects to /login with next param", async ({
  page,
  context,
}) => {
  // Clear cookies so we land here as a fresh anon visitor regardless
  // of test order.
  await context.clearCookies();
  await page.goto("/student");
  // The proxy.ts gate should redirect.
  await expect(page).toHaveURL(/\/login\?.*next=%2Fstudent/);
});
