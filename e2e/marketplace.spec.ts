import { expect, test } from "@playwright/test";

/**
 * Public-surface smoke. Hits the marketplace homepage and the
 * `/login` page — both are unauthed and exercise the public tRPC
 * procedures + the design-system primitives (Btn, Card, Eyebrow, …)
 * without depending on any specific seed row.
 *
 * Resilient to empty DB: only asserts wordmark + presence of a
 * recognisable layout element. Course content is seed-dependent and
 * deliberately not asserted here.
 */
test("homepage renders the Lyceum marketplace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Lyceum/i);
  // The "Lyceum" wordmark appears in the header. Use a heading-or-link
  // anchor so we don't accidentally match body copy.
  await expect(
    page.getByRole("link", { name: /lyceum/i }).first()
  ).toBeVisible();
});

test("login page renders + offers at least one quick-login option in dev", async ({
  page,
}) => {
  await page.goto("/login");
  // The page title/heading is "Sign in" (or includes Lyceum branding).
  await expect(page).toHaveURL(/\/login/);
  // Quick-login buttons are role=button with an email in their text;
  // any seeded user qualifies. If seeded data is missing this fails
  // with a clear "no buttons" message rather than a vague timeout.
  const quickLogins = page.getByRole("button", {
    name: /@cedar\.test|@example\./i,
  });
  await expect(quickLogins.first()).toBeVisible({ timeout: 10_000 });
});
