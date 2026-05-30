import { expect, test } from "@playwright/test";

/**
 * E2E presence-test for the Course Builder v2 (Gamma-style WYSIWYG).
 * Verifies the three-pane builder renders against the real
 * course-builder page with a real seeded teacher → catches layout
 * regressions, the outline rail failing to load units/lessons, or
 * `selectedLessonId` failing to initialise to the first lesson.
 *
 * Replaces the old `block-library.spec.ts` — the left BLOCK LIBRARY rail
 * was removed in the v2 rebuild (replaced by the COURSE OUTLINE rail +
 * an inline "/" command menu, per the design handoff).
 *
 * Deliberately does NOT insert a block. That would fire `teacher.addBlock`
 * and write a real Block row we have no clean way to wipe through this UI
 * path. The mutation is already covered by vitest in
 * `test/teacher.addBlock.test.ts`; what those cases can't verify is that
 * the React builder renders + the real course tree reaches the DOM,
 * which is exactly what this test does.
 */
test("teacher course builder renders the v2 outline rail + WYSIWYG canvas", async ({
  page,
}) => {
  // ── Sign in as the seeded TEACHER (first @cedar.test teacher button). ──
  await page.goto("/login");
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
    teacherBtn = page
      .getByRole("button", { name: /@cedar\.test/i })
      .nth(1); // skip STUDENT row
  }
  await expect(teacherBtn).toBeVisible({ timeout: 15_000 });

  await Promise.all([
    // Teacher quick-login redirects straight into a course builder.
    page.waitForURL(/\/teacher\/courses\/.+\/edit/, { timeout: 20_000 }),
    teacherBtn.click(),
  ]);

  // The builder canvas is a <section> (the page's only <main> is the
  // TeacherChrome shell), so the chrome's <main> scopes us cleanly.
  const main = page.getByRole("main");

  // ── Left rail: the COURSE OUTLINE replaces the old block library. ──
  await expect(main.getByText(/^COURSE OUTLINE$/)).toBeVisible({
    timeout: 15_000,
  });

  // ── Center canvas: a lesson is auto-selected on mount, so the editable
  //    lesson-title field renders (seed-independent — title varies). ──
  await expect(main.getByRole("textbox", { name: "Lesson title" })).toBeVisible();

  // ── Insert affordance: the inline "Add block / type /" replaces the
  //    old library's click-to-insert templates. ──
  await expect(
    main.getByRole("button", { name: /Add block/i }).first()
  ).toBeVisible();

  // ── Right rail: the contextual inspector exposes the Course + Lesson
  //    tabs (Block is disabled until a block is selected). ──
  await expect(main.getByRole("button", { name: /^Course$/ })).toBeVisible();
  await expect(main.getByRole("button", { name: /^Lesson$/ })).toBeVisible();
});
