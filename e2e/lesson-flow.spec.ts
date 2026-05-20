import { expect, test } from "@playwright/test";

/**
 * End-to-end: sign in as a seeded STUDENT → open the multiplying-
 * fractions lesson → submit an MCQ → verify XP chip renders.
 *
 * This is the long-deferred P1-41 happy-path verification. Covers the
 * engagement loop bottom that vitest deliberately can't:
 *   - tRPC `lesson.attemptBlock` round-trip via the real HTTP layer
 *     (cookie + Auth.js session attached automatically)
 *   - BlockReader.tsx renders the MCQ + reads feedback state
 *   - awardCorrectAttempt fires + the "+N XP" chip shows up
 *
 * Robust to seed re-runs: walks each MCQ option in turn rather than
 * hard-coding the correct index. If the seed loses its MCQ block on
 * multiplying-fractions, the test fails fast with a clear locator
 * error instead of timing out on Check.
 *
 * Depends on the seed having placed at least one MCQ block on the
 * multiplying-fractions lesson — that's been stable for many sessions;
 * the test fails with a clear message if it isn't.
 */
test("STUDENT can submit an MCQ on multiplying-fractions and see +XP", async ({
  page,
}) => {
  // ── Sign in via dev quick-login (first seeded STUDENT). ──
  await page.goto("/login");
  const studentBtn = page
    .getByRole("button", { name: /@cedar\.test/i })
    .first();
  await expect(studentBtn).toBeVisible({ timeout: 15_000 });
  await Promise.all([
    page.waitForURL(/\/student(\b|\/|$)/, { timeout: 20_000 }),
    studentBtn.click(),
  ]);

  // ── Open the multiplying-fractions lesson. ──
  await page.goto("/student/lesson/multiplying-fractions");

  // The MCQ block renders a "Check answer" button — wait for it
  // before driving the option clicks.
  const checkBtn = page.getByRole("button", { name: /^check answer$/i }).first();
  await expect(checkBtn).toBeVisible({ timeout: 20_000 });

  // ── Walk through each option until one earns XP. ──
  // MCQ options are buttons whose accessible name starts with "A", "B",
  // "C", or "D" (followed by the option text). We try them in order;
  // up to 4 attempts. After each Check we look for either the green
  // "+N XP" chip (correct) or the "Try again" affordance (wrong).
  const xpChip = page.locator("text=/^\\+\\d+ XP$/").first();

  let earned = false;
  for (let i = 0; i < 4; i++) {
    const letter = String.fromCharCode(65 + i); // A, B, C, D
    const option = page
      .getByRole("button", { name: new RegExp(`^\\s*${letter}\\b`) })
      .first();
    if (!(await option.isVisible().catch(() => false))) break;

    await option.click();
    await checkBtn.click();

    // Race the XP chip vs the Try-again button.
    const tryAgain = page.getByRole("button", { name: /^try again$/i });
    const winner = await Promise.race([
      xpChip
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => "xp" as const)
        .catch(() => "none" as const),
      tryAgain
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => "tryagain" as const)
        .catch(() => "none" as const),
    ]);
    if (winner === "xp") {
      earned = true;
      break;
    }
    if (winner === "tryagain") {
      await tryAgain.click();
      continue;
    }
    // Neither showed up — bail with the page state captured in the
    // Playwright trace.
    throw new Error("MCQ Check produced no feedback within 10s");
  }

  expect(earned).toBe(true);
  await expect(xpChip).toBeVisible();
  // Server should also report "✓ Correct".
  await expect(page.getByText(/^✓ correct/i).first()).toBeVisible();
});
