# Lyceum — Structural Refactor Plan (P10)

> **Audience.** A future Claude (Opus 4.8) session executing the six-item
> structural refactor identified in the 2026‑06‑22 whole‑app review. This is a
> *forward* plan: read it, pick the current phase, execute one **slice** at a
> time under the standard verify gauntlet, and keep `REQUIREMENTS.md` /
> `AGENT_NOTES.md` / `KNOWN_ISSUES.md` in sync as you go.
>
> **Not a rewrite.** Every phase is incremental and behavior‑preserving except
> R63 (a deliberate data migration). The test suite + e2e are the safety net —
> never land a phase with the gauntlet red.

---

## 0. Guardrails (apply to every phase)

- **Verify gauntlet (unchanged):** `npx tsc --noEmit` → `npx eslint src` →
  `npx vitest run` (i18n parity + unit) → `npx next build` → relevant Playwright
  e2e. Prefix shell with `cd /c/Users/maind/OneDrive/Documents/project/lyceum &&`
  (cwd drifts to parent at turn boundaries).
- **Commit discipline:** one logical unit per commit; a code commit + a docs
  commit; message trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
  Commit/push only when the user asks (menu picks count).
- **Migrations:** `prisma migrate dev --create-only` to scaffold, hand‑edit raw
  SQL where Prisma's DSL can't express it (CHECK constraints, pgvector, tsvector
  — see the `LessonChunk` FTS precedent in `CLAUDE.md`). Always provide a
  pre‑migration data audit query so a violating row fails loudly *before* the
  constraint is added.
- **Security constraints (hard):** never edit Vercel env vars, never read/echo
  secrets. **R54** (`sslmode=verify-full` on prod `DATABASE_URL`) is **USER‑OWNED**
  — you document + verify read‑only, the user sets it. CSP/header *code* is fine.
- **Don't fight the i18n marathon.** R55 is in flight on these exact files; Phase 1
  finishes it before any file moves so `t()` calls travel with the code.

### Sequencing (hard deps → arrows)

```
Phase 0  R58 test-isolation ──┐  (independent, do first — safety net)
         R59 CHECK constraints┤  (independent, cheap)
         R54 sslmode (user)   ┘  (independent, user-owned)
Phase 1  R55 finish i18n ──────────────► R60 no-literal-string lint guard
Phase 2  R61 design-system → primitives + Tailwind tokens   (needs nothing; pilot first)
Phase 3  R62 decompose god components   (needs R61 primitives + R55 done)
Phase 4  R57 CSP (script nonce)         (independent; style-src tighten after R61)
Phase 5  R63 retire legacy Question     (do last; after R62 reader refactor)
```

Independent phases (0, 4) may be interleaved with 1–3. Hard order: **R55 → R60**,
**R61 → R62**, **R55 → R62**, **R62 → R63 (soft)**.

---

## Phase 0 — Quick, independent wins (safety net + cheap gaps)

### R58 · Test isolation + e2e de‑flake
**Why first.** Phases 2–3 are large behavior‑preserving refactors whose only
guardrail is a trustworthy, fast, parallel test suite. Today 61 vitest files
share the dev DB (`:5433`) via fake‑time tricks + prefix cleanup, and non‑cascading
rows (`Insight`/`Institution`) leak (`KNOWN_ISSUES` S3‑3). buy‑flow e2e is
timing‑flaky.

**Approach (recommended): per‑worker ephemeral DB from a template.**
1. `globalSetup` (vitest): run `prisma migrate deploy` + seed into a template DB
   `lyceum_test_template` once.
2. Per worker: `CREATE DATABASE lyceum_test_w<id> TEMPLATE lyceum_test_template`
   (fast copy), set that worker's `DATABASE_URL`. Drop on teardown.
3. Delete the year‑2001/2002 fake‑`now` hacks and the manual `Insight`/`Institution`
   cleanups — isolation makes them unnecessary.
4. Enable vitest parallelism (remove any `singleThread`/`fileParallelism:false`).

*Fallback if testcontainers/template cloning is too heavy:* keep the shared DB but
give every test file a unique id namespace + `afterEach` truncation of the
non‑cascading tables, and leave parallelism off. (Lower value — no speedup.)

**buy‑flow e2e:** replace implicit timing with explicit `await expect(locator)
.toBeVisible()` gates on each signup→checkout→`/demo-checkout`→`/checkout/success`
transition; seed a **dedicated** buy‑flow user so the run doesn't race the
fresh‑signup path. Target: 5× consecutive green.

**Files:** `vitest.config.ts`, `test/helpers.ts`, `test/globalSetup.ts` (new),
the ~5 fake‑time tests, `e2e/buy-flow.spec.ts`.
**Verify:** `vitest run` green in parallel; buy‑flow e2e 5× stable; wall‑clock
suite time drops.
**Risk:** low‑medium (infra). Rollback = revert config; tests still pass on the
shared DB. Update `KNOWN_ISSUES` S3‑3 → resolved.

### R59 · DB CHECK constraints for "exactly one of" invariants
Today enforced only in app code (`schema.prisma` comments admit it). Add via a
migration's raw‑SQL tail:
- `Attempt`: `ALTER TABLE "Attempt" ADD CONSTRAINT attempt_one_ref CHECK (("questionId" IS NULL) <> ("blockId" IS NULL));`
- `Order`: `ADD CONSTRAINT order_one_target CHECK (("courseId" IS NULL) <> ("pathId" IS NULL));`
- `ParentChild` role rule can't be a CHECK (cross‑table) — leave app‑layer or a
  deferred trigger; note the decision, don't force it.

**Pre‑migration audit (run first — a violating row aborts the migration):**
```sql
SELECT count(*) FROM "Attempt" WHERE ("questionId" IS NULL) = ("blockId" IS NULL);
SELECT count(*) FROM "Order"   WHERE ("courseId" IS NULL) = ("pathId" IS NULL);
```
Both must return 0. If not, fix the data first (or scope the constraint `NOT VALID`
then `VALIDATE` after cleanup).

**Persistence note:** constraints added via migration SQL live in migration history
and survive `migrate dev`/`reset` (shadow DB replays them) — same pattern as the
`LessonChunk_content_fts_idx` expression index. Record in `KNOWN_ISSUES` so nobody
"cleans up" a constraint that isn't in `schema.prisma`.
**Verify:** migration applies on a fresh `reset`; insert‑violation test (both a
neither‑set and a both‑set insert must throw). **Risk:** low.

### R54 · Pin `sslmode=verify-full` (USER‑OWNED)
You cannot set Vercel env. Deliverable: restate the exact steps (already in
`KNOWN_ISSUES` S1‑1 step 4 + `REQUIREMENTS` R54), then **verify read‑only** after
the user sets it — the `pg-connection-string` `verify-full` process‑warning firing
in Vercel runtime logs is the positive signal (per the S1‑1 telemetry method).
Never read the `DATABASE_URL` value.

---

## Phase 1 — Finish i18n (R55) then lock it (R60)

### R55 · Finish i18n for real (continue the in‑flight marathon)
Remaining after cont.78: **BlockInspector** complex array editors
(`Quiz`/`AiQuiz`/`Branching`/`DragMatch`/`Live`) + the `Video` editor; then
**`BlockReader.tsx`** (3,678 lines — the student render surface, the biggest
string trove left); then teacher‑courses pages (`new`/`new/ai`/`[courseId]/edit`,
`AssignmentsClient`, `students/[id]`); then admin power tools
(`branding`/`integrations`/`analytics`). Same cadence: catalog script in
`C:\tmp` → edit render sites → gauntlet (incl. the key‑coverage probe) → commit
per unit → prepend `AGENT_NOTES` → update `REQUIREMENTS` R55.
**Do this before Phase 3.** Decomposing first would strand half‑localized files;
finishing first means `t()` calls move intact with the code.

### R60 · `no-literal-string` lint guard (only after R55 hits 100%)
The retrofit was painful precisely because nothing blocked English literals.
1. Add `eslint-plugin-i18next` (or equivalent); enable `no-literal-string` scoped
   to JSX text **and** the UI attributes actually localized here: `placeholder`,
   `aria-label`, `title`, `alt`. Allowlist non‑UI: `className`, `style`,
   `data-testid`, `key`, server routers that emit keys, `test/`, `scripts/`,
   `C:\tmp`.
2. Baseline: run it, fix stragglers (there will be a few — that's the point),
   land at 0.
3. **Gate in CI** (the `verify` job) so a new literal fails the build.
4. Optionally pair with `react/forbid-dom-props` for `style` (see R61) — same PR
   or Phase 4.
**Risk:** medium (false‑positive tuning). Time‑box the config; prefer a tight
attribute allowlist over a broad rule.

---

## Phase 2 — Design‑system extraction (R61)  ← highest leverage

**Reality of the problem.** 1,946 `style={{…}}` sites; 454 in the three builder/
reader files alone. Styles are copy‑pasted inline referencing `--wf-*` vars
(100 defined in `globals.css`). The primitives layer (`src/components/wf/
primitives.tsx`) is tiny (Btn/Eyebrow/Icon/Toggle). This one choice drives *both*
the god‑file size and the theming friction.

**CSP framing — correct this misconception before you start.** Inline **styles**
do *not* have to be removed for a valuable CSP. The real XSS win is a strict
**`script-src` with nonces** (Phase 4, R57), which is independent of styling.
`style-src 'self' 'unsafe-inline'` is a fine, low‑risk posture. So R61's payoff is
**maintainability + bundle size + theming**, with a *cleaner* `style-src` as an
optional later bonus (only if you eliminate dynamic inline styles entirely — not
required). Don't chase a `'unsafe-inline'`‑free `style-src`; it would break every
dynamic width/color and buys little.

**Approach: Tailwind v4 (already a dep) + an expanded primitives library.**
1. **Tokens:** map the `--wf-*` vars into Tailwind v4 `@theme` (colors, radii,
   spacing, type). Keep the CSS vars as the runtime source of truth — institution
   branding overrides `--wf-accent` at runtime (`app/admin/layout.tsx`), so tokens
   must resolve *through* the vars, not hard‑code hex.
2. **Primitives:** grow `wf/` into the real molecule set the big files re‑inline.
   Several already exist *inside* `BlockInspector` and should be promoted to the
   shared lib: `TextField`, `TextAreaField`, `SectionLabel`, `ToggleRow`. Add
   `Card`, `Field`/`Select`, `Chip`/`Badge`, `IconButton`, `Row`/`Stack`, `Empty`,
   `Stem`, `OptionCards`. Each is Tailwind‑classed + token‑driven.
3. **Dynamic values** (progress bar %, poll bar width, accent swatch color): keep
   a *small, documented* set of inline `style` carve‑outs (e.g. `style={{ width:
   \`${pct}%\` }}`) or CSS custom properties. This is fine under `style-src
   'unsafe-inline'`.
4. **Pilot → measure → roll out.** Convert **one** file end‑to‑end first —
   recommend `BlockInspector.tsx` (freshly localized, well‑understood, 105 inline
   sites). Record LOC delta + `next build` bundle delta. If the primitive set +
   token mapping hold, roll the pattern across the top‑8 offenders, one file (or
   file‑region) per slice, each behind the gauntlet + a Playwright screenshot diff.

**Verify per slice:** tsc/eslint/e2e green; **Playwright visual snapshot** of the
converted surface matches pre‑refactor (add `toHaveScreenshot` baselines for
`/teacher/.../edit`, `/student/lesson/...`, marketplace, dashboards before you
start); `next build` bundle size same‑or‑smaller.
**Risk:** medium — visual regressions. Mitigate with the screenshot baselines and
per‑region commits. Rollback = revert the region's commit.
**Sequencing with R62:** do R61 *before* R62 so the per‑block files extracted in
Phase 3 are already small (they consume primitives, not 40‑line style objects).

---

## Phase 3 — Decompose the god components (R62)

**Targets:** `CourseBuilderClient.tsx` (4,051), `BlockReader.tsx` (3,678),
`BlockInspector.tsx` (2,665), `server/routers/teacher.ts` (2,408); secondary
`LessonClient.tsx` (1,060), `teacher/courses/new/ai/page.tsx` (845). The three
big components are **three parallel `switch(block.type)` statements** — Reader,
Inspector editor, Builder preview — that should be colocated per type.

**Block registry (strangler pattern):**
1. Define `src/components/blocks/registry.ts`: `Record<BlockType, { Editor,
   Reader, Preview, meta }>`, typed against `SettingsFor<T>` from `lib/blocks.ts`.
2. Create `src/components/blocks/<type>/{Editor,Reader,Preview}.tsx` and move one
   type's three renderers out of the three switches into it. Register it.
3. Replace each switch arm with a registry lookup, **keeping the old switch as a
   fallback** for not‑yet‑migrated types. Migrate 16 types one per commit; delete
   each switch when its map is empty.
4. `dynamic(() => import(...))` the **Editors** (builder‑only) so the student
   reader bundle drops the authoring code — a real bundle win.

**Split `teacher.ts` by concern:** nested tRPC routers under
`server/routers/teacher/` — `courses.ts`, `blocks.ts`, `units.ts`, `students.ts`,
`earnings.ts`, `storefront.ts`, `video.ts` — merged in `teacher/_index.ts` so the
public `teacher.*` paths stay identical. Move `lesson.ts` (1,409) similarly if it
splits cleanly (reader queries vs attempt mutations vs tutor).

**Verify:** behavior‑identical — the e2e (`course-builder`, `lesson-flow`) + unit
tests are the guardrail; every procedure path string must be unchanged (grep the
client callsites). tsc/eslint/build green; bundle per‑route smaller.
**Risk:** medium — wide but mechanical; the registry fallback keeps every step
shippable. Rollback = per‑type commit revert.

---

## Phase 4 — CSP (R57) + finalize guards

**Independent of R61** (script nonces, not styles). Do once files are calmer.
1. In `src/proxy.ts` (Next 16 middleware replacement): mint a per‑request nonce,
   thread it to `<script>` via Next's nonce support, emit
   `Content-Security-Policy`. Start `script-src 'self' 'nonce-<n>' 'strict-dynamic'`;
   `style-src 'self' 'unsafe-inline'`; allowlist the real third parties —
   **Mux** (player/upload), **Stripe** (checkout/JS), **Sentry** (ingest),
   **Anthropic/OpenAI** if any browser‑side calls, plus `connect-src` for the
   tRPC/SSE tutor stream and `img-src`/`media-src` for Mux + thumbnails.
2. **Ship `Content-Security-Policy-Report-Only` first**, collect violations from
   real usage (Sentry/report‑uri) for a few days, then flip to enforcing.
3. Extend — don't replace — the R50 header config (locate it: `next.config.ts`
   `headers()` or `proxy.ts`).
4. Fold in the R60 i18n guard + optional `react/forbid-dom-props: style` (allowlist
   the R61 dynamic carve‑outs) as CI‑gated lint.
**Verify:** every surface loads with no console CSP violations (Mux playback,
Stripe checkout, tutor SSE, uploads); report‑only window clean before enforce.
**Risk:** medium — a missed allowlist entry breaks a third‑party widget. Report‑only
first is the mitigation. Closes R57.

---

## Phase 5 — Retire the legacy `Question` path (R63)  ← riskiest, last

**Why last.** It touches attempts → grading → XP → analytics, and it's cleanest
after `BlockReader`/`lesson.ts` are already refactored (Phase 3). It's the only
phase that migrates data.

1. **Audit** remaining `Question` usage: `prisma/seed.ts`, any live
   Question‑based lessons, `lesson.attempt` (the `questionId` arm), `BlockReader`
   legacy render, admin/analytics reads of `Attempt.questionId`.
2. **Data migration (idempotent, dry‑run‑first):** convert each `Question` → an
   `MCQ`/`QUIZ` `Block` (`settings` from `stem`/`answers`/`hints`); map historical
   `Attempt.questionId` rows to the new `blockId` + populate the typed
   `chosenIndex`/`subIndex` (the R16/S2‑3 columns already exist). Print
   before/after row counts; keep it reversible (record the question→block id map).
3. **Code:** delete the `questionId` branch from `lesson.ts` attempt logic, the
   `Question` arm in `BlockReader`, and the dual‑path handling. Decide the column
   fate: **keep `Attempt.questionId` nullable** (stop writing) if you'd rather not
   rewrite historical rows, **or** migrate + drop — pick based on whether analytics
   must preserve the original linkage. Update the R59 CHECK to `blockId IS NOT NULL`
   for new rows if you fully retire questions.
4. Remove `Question`/`Question[]` relations from `schema.prisma` last, once no code
   references them.
**Verify:** attempt/XP/grading unit tests (extend them first), `lesson-flow` e2e,
the migration dry‑run counts reconcile. **Risk:** high — gate behind the fullest
test coverage; land the data migration and the code change in separate commits so
either can revert independently.

---

## Bookkeeping (every phase)

- Add each R‑number to `REQUIREMENTS.md` (new **P10** block: R58–R63; R54/R55/R56/
  R57 already exist) with an inline **Status** you keep current.
- Prepend an `AGENT_NOTES.md` `cont.NN` entry per slice; refresh the Branch row.
- Update `KNOWN_ISSUES.md` when a phase resolves an item (S3‑3 → R58).
- Re‑run the review after Phase 3 — the file‑size + inline‑style metrics are the
  scoreboard (`grep -rc "style={{" src`, `wc -l` the ex‑god files).

## Definition of done (initiative)
No `src` file > ~800 lines; `style={{` count down ~10×; CSP enforced with script
nonces; i18n lint‑gated at 0 literals; CHECK constraints live; test suite parallel
+ isolated; single (`Block`) content model. `tsc`/`eslint`/`vitest`/`build`/e2e all
green throughout.
