import { expect, test } from "@playwright/test";

/**
 * E2E presence-test for the BlockLibrary left rail (Tier 4.1 partial).
 * Verifies the rail renders against the real course-builder page with
 * a real seeded teacher → catches layout regressions, missing
 * templates, or selectedLessonId state failing to initialise.
 *
 * Deliberately does NOT click a template. The click would fire
 * `teacher.addBlock` and write a real Block row that we have no clean
 * way to wipe (no test-vitest- prefix is reachable through this UI
 * path). The mutation is already covered by 8 vitest cases in
 * `test/teacher.addBlock.test.ts`; what those cases CAN'T verify is
 * that the React rail renders + the catalog reaches the DOM, which
 * is exactly what this test does.
 *
 * Future improvement (if interaction coverage is needed): sign up a
 * fresh test-vitest- TEACHER via page.request, scaffold a Course +
 * Unit + Lesson via tRPC, exercise the click, let globalTeardown
 * cascade-delete the lot.
 */
test("teacher builder renders the BlockLibrary left rail with templates + insert chip", async ({
  page,
}) => {
  // ── Sign in as the seeded TEACHER (first @cedar.test teacher button). ──
  await page.goto("/login");
  // Use a locator that scopes to the TEACHER section to avoid grabbing
  // the STUDENT quick-login (which is alphabetically first in the
  // group iteration).
  const teacherCard = page
    .locator("text=/^TEACHER$/")
    .locator(
      "xpath=ancestor::*[contains(@class, 'wf-card') or @data-card][1]"
    )
    .first();

  let teacherBtn;
  if (await teacherCard.count()) {
    teacherBtn = teacherCard.getByRole("button").first();
  } else {
    // Fallback to any teacher.@cedar.test button if the card locator
    // doesn't latch. Tighten when the login page DOM stabilises.
    teacherBtn = page
      .getByRole("button", { name: /@cedar\.test/i })
      .nth(1); // skip STUDENT row
  }
  await expect(teacherBtn).toBeVisible({ timeout: 15_000 });

  await Promise.all([
    // Teacher quick-login redirects to the algebra-foundations builder.
    page.waitForURL(/\/teacher\/courses\/.+\/edit/, { timeout: 20_000 }),
    teacherBtn.click(),
  ]);

  // ── BlockLibrary rail asserts. ──
  // Library has a "BLOCK LIBRARY" eyebrow at the top.
  await expect(page.getByText(/^BLOCK LIBRARY$/)).toBeVisible({
    timeout: 15_000,
  });
  // STARTERS group header for the templated rows.
  await expect(page.getByText(/^STARTERS$/)).toBeVisible();
  // At least one known template label renders ("4-option MCQ" is the
  // canonical first entry — won't disappear unless someone reorders
  // BLOCK_TEMPLATES, which would also break vitest).
  await expect(
    page.getByRole("button", { name: /4-option MCQ/i })
  ).toBeVisible();

  // The "insert into → …" chip should resolve to the first seeded
  // lesson because selectedLessonId defaults to course.units[0].lessons[0].id
  // on mount. We don't assert a specific lesson title (varies by seed)
  // — just that the actionable "Insert into" copy renders rather than
  // the empty-state hint.
  await expect(page.getByText(/Insert into\s+→/i)).toBeVisible();
});
