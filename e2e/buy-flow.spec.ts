import { expect, test } from "@playwright/test";

/**
 * End-to-end: fresh signup → buy a paid course → demo confirm → land on
 * the success page enrolled.
 *
 * Walks the full Stripe-Connect-demo-mode pipeline that vitest verifies
 * mutation-by-mutation but no other test exercises end-to-end through
 * a real browser:
 *
 *   1. POST /api/trpc/auth.signup  → fresh User row + bcrypt hash
 *   2. signIn("credentials")        → JWT cookie + proxy.ts allows /student
 *   3. POST .../payment.createCheckoutSession → Order(PENDING) + URL
 *   4. /demo-checkout/[orderId]     → Pay (demo) button
 *   5. POST .../payment.demoConfirm → Order(PAID) + Enrollment in one tx
 *   6. /checkout/success            → "You're enrolled." rendered
 *
 * The test uses the `test-vitest-` email prefix so the vitest
 * `cleanupTestUsers` helper sweeps the row on the next `npm test` run.
 * Cascade rules wipe the Order + Enrollment with the user; no other
 * cleanup needed.
 *
 * Depends on the seed having placed a paid course at slug
 * `algebra-foundations` ($19 / Mr. Adeyemi). That's been the canonical
 * paid-course fixture across many sessions; if it changes, update the
 * `PAID_COURSE_SLUG` constant below.
 */

const PAID_COURSE_SLUG = "algebra-foundations";

test("fresh signup → buy → confirm lands enrolled on success page", async ({
  page,
}) => {
  const email = `test-vitest-buy-${Date.now()}@example.test`;
  const password = "verysecret123";

  // ── Sign up. ──
  await page.goto("/signup");
  await page.getByLabel(/first name/i).fill("Vitest");
  await page.getByLabel(/^email$/i).fill(email);
  // Two password fields (PASSWORD + CONFIRM PASSWORD); fill by index.
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill(password);
  await passwordInputs.nth(1).fill(password);
  // STUDENT is the default; no role click needed.
  await Promise.all([
    page.waitForURL(/\/student(\b|\/|$)/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);

  // ── Open the paid course detail page. ──
  await page.goto(`/course/${PAID_COURSE_SLUG}`);
  const buyBtn = page.getByRole("button", { name: /buy & start/i }).first();
  await expect(buyBtn).toBeVisible({ timeout: 10_000 });

  // Click → lands on /demo-checkout/[orderId]. The button calls
  // createCheckoutSession which writes Order(PENDING) and returns the
  // local demo URL; the panel navigates client-side.
  await Promise.all([
    page.waitForURL(/\/demo-checkout\//, { timeout: 20_000 }),
    buyBtn.click(),
  ]);

  // ── Confirm the demo purchase. ──
  const payBtn = page.getByRole("button", { name: /pay \(demo\)/i });
  await expect(payBtn).toBeVisible({ timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/checkout\/success/, { timeout: 20_000 }),
    payBtn.click(),
  ]);

  // ── Success page asserts. ──
  // URL + heading prove the demoConfirm mutation flipped Order→PAID,
  // created the Enrollment, and the success page rendered. We don't
  // assert the post-purchase CTAs — they're Btn-inside-Link which
  // confuses Playwright's accessible-name resolution; the URL/heading
  // combo is sufficient end-to-end proof.
  await expect(
    page.getByRole("heading", { name: /you'?re enrolled/i })
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`courseSlug=${PAID_COURSE_SLUG}`)
  );
});
