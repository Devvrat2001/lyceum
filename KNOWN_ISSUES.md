# Known Issues & Latent Risks

> **Purpose.** Pre-existing problems that compile/ship today but will cause
> failures "down the path" — as dependencies tighten (React Compiler, stricter
> Next builds), as data drifts, or as features touch fragile seams. Audited
> **2026-06-06** by sweeping: full ESLint, `tsc`, type-suppression / `any`-hole
> / silent-`catch` / `process.env` greps, and the structural debt tracked in
> `BACKEND_ROADMAP.md` §6.6.
>
> **Refresh this** with: `npx eslint src`, `npx tsc --noEmit`, and the greps at
> the bottom. Keep severities honest — don't let S2/S3 rot into S1.

## Health summary (the good news first)

The codebase is clean on the usual rot metrics:

- **ESLint: 8 problems total** across all of `src` (5 errors, 3 warnings) — all catalogued below. *(was 9; on 2026-06-06 the AI-generator page moved to `new/ai/` and the video player was extracted out of BlockReader, shifting its lines ~−248 — line refs below updated.)*
- **0** `@ts-ignore` / `@ts-expect-error` in `src`.
- **2** TODO/FIXME (both the same Email-magic-link note in `auth.ts`).
- **0** truly-empty `catch {}` (the bindless `catch {` blocks all have bodies).
- `tsc --noEmit` is **clean**.

So this is a short, targeted list — not a tar pit. But every item here is a real "later" failure.

⚠️ **Why these survive:** `next build` does **not** fail on the ESLint errors below (verified — builds pass with all 5 present). They are latent precisely because nothing gates on them yet. The day CI adds a lint gate — or React Compiler promotes its rules to hard errors — they become build-breaking all at once.

---

## S1 — Correctness / will fail in production

### S1-1 · Prod TLS verification is disabled app-wide
- **Where:** Vercel **Production** env var `NODE_TLS_REJECT_UNAUTHORIZED=0` (not in code — confirmed absent from `src`, config, `.env*`).
- **Risk:** Disables *all* TLS certificate validation in the Node runtime → MITM exposure on every outbound HTTPS call (DB, Stripe, Mux, Anthropic) and it silently masks real cert errors. On a children's-data product this is a compliance problem, not just hygiene.
- **Fix:** Remove the var; redeploy; if managed-Postgres then complains about its cert, scope the trust narrowly with `?sslmode=require` on `DATABASE_URL` instead of disabling globally. Watch runtime logs after removal.
- **Effort:** 10 min + a watchful redeploy. *(Already diagnosed; task chip spawned earlier.)*

### S1-2 · Unvalidated `Json`-column cast in the AI generator worker — ✅ RESOLVED 2026-06-06
- **Where:** `src/lib/jobs/processOutlineJob.ts:99` — was `const partial = job.partial as unknown as Outline | null`.
- **Fix shipped:** `validatePartialOutline()` structurally validates the persisted `partial` on read; a drifted/half-written blob now fails the job cleanly (clear message) instead of crashing deep at `partial.units[unitIdx]`. Covered by `test/processOutlineJob.partial.test.ts` (7 cases). The write-side casts (:292/:357–358/:370) and the `generator.ts` input cast remain (input is already defended at :63–67 + `SettingsSchema.parse`).
- **⚠️ Why NOT `OutlineSchema.safeParse` (the original recommendation):** that would have **broken generation**. The partial deliberately holds ~110-char placeholder readings between chunks (below `readingContent.min(120)`) and the skeleton's unit/lesson counts aren't bound by `OutlineSchema`'s `min(3)` authoring rules — so the strict schema rejects every valid in-flight blob. The fix uses a **lenient structural schema** (shape only) and returns the *original* object so accumulated `lessons[].blocks` survive.
- **Discovered while fixing → see S3-5:** that placeholder is 110 chars, not ≥120 as its comment claims.

### S1-3 · Ref mutation flagged by React Compiler (SPEAK block)
- **Where:** `src/components/lesson/BlockReader.tsx:1758` — `recognitionRef.current = r` (`react-hooks/immutability`, **error**).
- **Risk:** React Compiler treats mutating a ref that was passed to a hook as illegal. Today it's "just a lint error"; under the compiler's memoization it can mis-optimize the SpeechRecognition setup so the SPEAK block's mic handler binds stale state or stops firing. This is the one lint error that is also a latent *runtime* bug.
- **Fix:** Assign the recognition instance before the hook boundary, or move the SpeechRecognition lifecycle into a dedicated effect that owns the ref.
- **Effort:** ~30–45 min (careful — risky file).

---

## S2 — Latent / will bite as code & deps evolve

### S2-1 · `setState` called synchronously inside effects (×4)
- **Where:** `BlockReader.tsx:1098` (time ticker), `:1355` (BRANCHING terminal complete), `:1681` (SPEAK feature-detect); `src/app/teacher/courses/new/ai/page.tsx:121` (`react-hooks/set-state-in-effect`, **errors**). *(The manual form is now `new/page.tsx`; the AI generator — which carries this lint error — moved to `new/ai/page.tsx` on 2026-06-06.)*
- **Risk:** Cascading re-renders today (perf). The real bite: this rule is on track to become a hard error in stricter React/Next; when it does, the build breaks in four places at once. Two of these (1346, 1929) are genuine "you might not need an effect" patterns.
- **Fix:** Lazy `useState` initializers for one-shot detection (1929); event-driven setState for completion (1603); keep the ticker but acknowledge it's a legit external-sync effect (or disable the rule narrowly with a reason).
- **Effort:** ~1 hr for all four.

### S2-2 · `BlockSettingsShape` is a 20-optional-field bag, not a discriminated union
- **Where:** type in `src/lib/blocks.ts`; symptom cast at `src/components/teacher/BlockInspector.tsx:1041` — `next as unknown as BlockSettingsShape["options"]`.
- **Risk:** A VIDEO block can read `.options` (an MCQ field) and it compiles. Wrong-field bugs across 15 block types are invisible to `tsc`. The `as unknown as` casts are the workaround that hides it.
- **Fix:** Convert to a `Block.type`-keyed discriminated union (pure type-level, no data migration). *(Roadmap §6.6 / Tier 4.5.)*
- **Effort:** ~1 session.

### S2-3 · `Attempt.chosenKey` overloads 5 encodings in one string column
- **Where:** `Attempt.chosenKey` (schema) — encodes `"subIdx:choiceIdx"`, `"drag:N/M"`, `"branch:<nodeId>"`, etc.
- **Risk:** The first analytics query that needs structured access (e.g. "% correct on Q3 of AI_QUIZ X") will string-parse this and silently mis-bucket. It's a data-shape time bomb that only goes off when someone queries it.
- **Fix:** Add typed `chosenIndex` / `subIndex` columns + a one-shot backfill. *(Roadmap §6.6 / Tier 5.3 — don't pre-build; do it the moment a query needs it.)*
- **Effort:** ~1 session incl. backfill.

### S2-4 · `react-hooks/exhaustive-deps` disabled in 6 effects
- **Where:** `AdminInsights.tsx:17`, `BlockReader.tsx:1361` & `:2185`, `AnalyticsInsights.tsx:20`, `BlockInspector.tsx:1467` & `:1850`.
- **Risk:** Each suppressed dep array is a stale-closure waiting to happen — the effect captures an old prop/state and silently uses outdated values after the dependency changes. They're correct *today* by construction, but fragile to edits.
- **Fix:** Per-site review; prefer refs or `useCallback` deps over blanket disables. At minimum, each disable should carry a one-line "why this is safe" comment (some already do).
- **Effort:** ~1–2 hr to review all six.

### S2-5 · Error-swallowing `catch {` blocks without logging
- **Where:** `BlockReader.tsx:785, 1059, 2000` (plus the SpeechRecognition try/catches, legitimately defensive). *(The former `:447` `toEmbedUrl` catch moved to `components/video/LessonVideoPlayer.tsx` in the 2026-06-06 video extraction; the rest shifted ~−248.)*
- **Risk:** Bindless `catch {` discards the error. Several are safe (feature-detection), but the non-detection ones swallow genuine failures with no console trail — the exact "invisible 200 with no error context" failure mode the tRPC handler was fixed for.
- **Fix:** Audit each; for anything that isn't pure feature-detection, log the error (even `console.debug`) so it's traceable.
- **Effort:** ~30 min.

---

## S3 — Hygiene / low risk

### S3-1 · Unused variables (×3)
- `BlockReader.tsx:2298` (`correctCount`), `processOutlineJob.ts:472` (`_`), `generator.ts:400` (`settings`). *(Was ×4 — `StudentChrome.tsx`'s dead `_WF` import was removed 2026-06-06 with the responsive-chrome work.)*
- **Note:** `correctCount` being computed-but-unused smells like a **half-dropped feature** (a score that's calculated then thrown away) — worth confirming intent, not just deleting.

### S3-2 · Direct `process.env` reads outside `lib/env.ts`
- **Where:** `src/app/api/tutor/stream/route.ts:240` (`ANTHROPIC_API_KEY` for a mode flag), `src/lib/trpc/react.tsx:14` (`PORT`). Also the new cron/Sentry bootstrap files read `process.env` directly (acceptable for boot-time, but technically the same break).
- **Risk:** `env.ts` says "never read `process.env` directly outside this file" precisely so validation + the empty-string-shadow gotcha live in one place. Each direct read can drift (e.g. tutor/stream's `ANTHROPIC_API_KEY` check could disagree with `env`'s view).
- **Fix:** Route through the validated `env` object where it's not boot-time.

### S3-3 · Test isolation depends on shared-dev-DB hacks
- **Where:** `test/streakRollover.test.ts` (year-2001 `now`), `weeklyDigest.test.ts` & `studentReport.test.ts` (year-2002 `now`), `test/helpers.ts` (prefix cleanup), `insightEngine.test.ts` & `boardReport.test.ts` (manual `Insight`/`Institution` cleanup — those rows have **no FK cascade**).
- **Risk:** Tests share the dev DB. The fake-time trick works only while seeded data stays out of the window; a test that forgets to clean its non-cascading rows leaks state into later runs (and a future seed dated in the past would break the isolation silently).
- **Fix (later):** per-test transaction+rollback, or an ephemeral test DB. Not urgent while the suite is green, but it's why a flake here is hard to debug.

### S3-4 · Dev DB silently dies on machine sleep
- **Where:** Postgres in Docker (`lyceum-postgres`, `:5433`).
- **Risk:** If Docker Desktop isn't running, every Prisma call `ECONNREFUSED`s and the whole DB-backed test suite fails in `beforeAll` — looking like a code regression when it isn't. (Hit this 2026-06-04.) Already in `CLAUDE.md`; restated here because it masquerades as a code failure.
- **Fix:** Operational — start Docker Desktop; `docker start lyceum-postgres`.

### S3-5 · Skeleton placeholder reading was 110 chars (comment claimed ≥120) — ✅ RESOLVED 2026-06-06
- **Where:** `processOutlineJob.ts` — now the exported `SKELETON_READING_PLACEHOLDER` (142 chars), used by `advanceAfterSkeleton`.
- **Fix shipped:** padded to ≥120 so a generation that **fails partway** leaves a partial that's still saveable via `saveAsCourse` (`OutlineSchema` `readingContent.min(120)`). Guarded by a test asserting length ≥120 + `OutlineLessonSchema.safeParse` success. (Found 2026-06-06 while fixing S1-2.)

---

## Refresh commands

```bash
npx eslint src                      # the 9 lint problems (S1-3, S2-1, S3-1)
npx tsc --noEmit                    # currently clean
grep -rnE "@ts-ignore|@ts-expect-error|eslint-disable" src  # suppressions (S2-4)
grep -rnE "as unknown as|: any\b"  src   # type holes (S1-2, S2-2)
grep -rnE "} catch \{"             src   # bindless catches (S2-5)
grep -rn  "process\.env\."         src   # env convention (S3-2)
```

Items S2-2, S2-3 are tracked as engineering debt in `BACKEND_ROADMAP.md` §6.6; the rest are net-new findings from this audit.
