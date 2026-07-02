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

- **ESLint: 0 problems** across all of `src` — fully clean. *(2026-06-06: down from 9 over the day — **S1-3, the S2-1 ×4 cluster, and the S3-1 ×3 unused-vars all resolved**; the tree now has zero lint errors AND zero warnings. Also this day: the AI-generator page moved to `new/ai/` and the video player was extracted out of BlockReader.)*
- **0** `@ts-ignore` / `@ts-expect-error` in `src`.
- **2** TODO/FIXME (both the same Email-magic-link note in `auth.ts`).
- **0** truly-empty `catch {}` (the bindless `catch {` blocks all have bodies).
- `tsc --noEmit` is **clean**.

So this is a short, targeted list — not a tar pit. But every item here is a real "later" failure.

⚠️ **Why these survive:** `next build` does **not** fail on the ESLint errors below (verified — builds pass with all 5 present). They are latent precisely because nothing gates on them yet. The day CI adds a lint gate — or React Compiler promotes its rules to hard errors — they become build-breaking all at once.

---

## S1 — Correctness / will fail in production

### S1-1 · Prod TLS verification is disabled app-wide — ✅ RESOLVED 2026-06-16
- **Where:** Vercel **Production** env var `NODE_TLS_REJECT_UNAUTHORIZED=0` (not in code — confirmed absent from `src`, config, `.env*`).
- **Risk:** Disables *all* TLS certificate validation in the Node runtime → MITM exposure on every outbound HTTPS call (DB, Stripe, Mux, Anthropic) and it silently masks real cert errors. On a children's-data product this is a compliance problem, not just hygiene.
- **Fix — exact steps (yours to run; per policy I can't change Vercel env vars):**
  1. **Confirm it's set:** Vercel → project `lyceum` → Settings → Environment Variables → find `NODE_TLS_REJECT_UNAUTHORIZED` (expect `0`, Production scope). CLI: `vercel env ls`.
  2. **Anticipate why it's there:** it's almost always a band-aid for a managed-Postgres cert (self-signed / incomplete chain). Have the narrow replacement (step 4) ready *before* you remove it.
  3. **Remove it:** delete the var in the dashboard (every environment it's set in), or `vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production`.
  4. **If the DB then complains** (`SELF_SIGNED_CERT_IN_CHAIN` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`): scope trust narrowly on `DATABASE_URL` instead of disabling globally — add `?sslmode=require` (encrypt, minimum) or, better, `?sslmode=verify-full` with the provider's CA bundle. **Do NOT re-add the global var.**
  5. **Redeploy** (env changes need a fresh deploy — dashboard "Redeploy" or push a commit) and watch logs.
- **Post-removal verification checklist** (each path previously rode the disabled verify):
  - **DB:** open a DB-backed page (`/teacher`, `/student`). A Prisma cert error → do step 4.
  - **Stripe / Mux / Anthropic / OpenAI / Resend:** all use public CAs (should be unaffected), but still smoke one of each — a test checkout + webhook 200, a video playback-token mint, the tutor stream, a receipt send.
  - **Logs:** Vercel Runtime Logs (or `vercel logs <url>`) — grep `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `DEPTH_ZERO_SELF_SIGNED_CERT` for ~10 min post-deploy.
  - **Rollback:** re-adding the var restores the (insecure) status quo if the DB breaks before you can land the cert fix — treat that as strictly temporary.
- **✅ Resolved 2026-06-16 (cont.55):** the user removed the var; **verified from prod runtime telemetry** — 7 days (Jun 9–16) of live traffic with **zero** occurrences of the Node `"…makes TLS connections… insecure"` cold-start warning, while process warnings are demonstrably enabled (the `pg-connection-string` `verify-full` notice fires), so the absence is conclusive rather than suppressed. Postgres now connects with full cert verification. Read via the Vercel runtime-logs MCP; the `DATABASE_URL` value was never read. Residual hardening — pin `?sslmode=verify-full` on `DATABASE_URL` — tracked as REQUIREMENTS **R54**. *(Diagnosed 2026-06-03; ~10 min fix as predicted.)*

### S1-2 · Unvalidated `Json`-column cast in the AI generator worker — ✅ RESOLVED 2026-06-06
- **Where:** `src/lib/jobs/processOutlineJob.ts:99` — was `const partial = job.partial as unknown as Outline | null`.
- **Fix shipped:** `validatePartialOutline()` structurally validates the persisted `partial` on read; a drifted/half-written blob now fails the job cleanly (clear message) instead of crashing deep at `partial.units[unitIdx]`. Covered by `test/processOutlineJob.partial.test.ts` (7 cases). The write-side casts (:292/:357–358/:370) and the `generator.ts` input cast remain (input is already defended at :63–67 + `SettingsSchema.parse`).
- **⚠️ Why NOT `OutlineSchema.safeParse` (the original recommendation):** that would have **broken generation**. The partial deliberately holds ~110-char placeholder readings between chunks (below `readingContent.min(120)`) and the skeleton's unit/lesson counts aren't bound by `OutlineSchema`'s `min(3)` authoring rules — so the strict schema rejects every valid in-flight blob. The fix uses a **lenient structural schema** (shape only) and returns the *original* object so accumulated `lessons[].blocks` survive.
- **Discovered while fixing → see S3-5:** that placeholder is 110 chars, not ≥120 as its comment claims.

### S1-3 · Ref mutation flagged by React Compiler (SPEAK block) — ✅ RESOLVED 2026-06-06
- **Where:** `src/components/lesson/BlockReader.tsx` SPEAK block — was `recognitionRef.current = r` where `recognitionRef` came from `useMemo(() => ({ current: null }))`.
- **Fix shipped:** switched `recognitionRef` to a real **`useRef`** — `.current` is mutable by contract, so the assignment is allowed under the React Compiler (a `useMemo` value is treated as immutable, which is what tripped `react-hooks/immutability`). One-line change + the `useRef` import; the error is gone (BlockReader 5→4 lint problems). No behavior change — the ref was already a stable single instance. The original code comment had even flagged `useRef` as "more conventional."
- **Note:** with S1-1 (prod TLS — verified removed 2026-06-16), S1-2, and S1-3 all resolved, the **S1 tier is clear**.

---

## S2 — Latent / will bite as code & deps evolve

### S2-1 · `setState` called synchronously inside effects (×4) — ✅ RESOLVED 2026-06-06
- **Where (was):** `BlockReader.tsx` time-ticker / BRANCHING terminal-complete / SPEAK feature-detect; `new/ai/page.tsx` job-status sync.
- **Fix shipped (per-site, not a blanket suppression):**
  - **BRANCHING completion** — `completedTerminals` was a dedup tracker never read in render, so it became a **`useRef`**: the effect now mutates the ref + fires the mutation (no setState). `terminalFeedback` from the mutation's `onSuccess` drives the real re-render.
  - **SPEAK feature-detect** — the `recognitionCtor`/`ttsAvailable` `useState`+effect became two **`useSyncExternalStore`** reads (server snapshot = no-capability, client resolves on mount) — the SSR-safe primitive, no effect/setState/hydration mismatch.
  - **time-ticker** + **AI-page job sync** — genuinely-correct external-sync effects (the wall clock; an async job result → editable local state) that the heuristic over-flags; each carries a one-line `eslint-disable-next-line react-hooks/set-state-in-effect` **with a reason**, which survives a future hard-error promotion of the rule.
- **Result:** ESLint **0 errors** (verified `tsc` + vitest 140/140 + `next build`). The remaining 3 problems are unused-var warnings (S3-1).

### S2-2 · `BlockSettingsShape` wide bag — ✅ RESOLVED 2026-06-06 (3 passes)
- **Canonical union (already done):** `lib/blocks.ts` holds the `Block.type`-keyed discriminated union — `SettingsMap` + `SettingsFor<T>` + `settingsFor()` + a compile-time `_ExhaustivenessCheck`. Server (`lesson.ts`, `generator.ts`) + reader (`BlockReader.tsx`) narrow per type.
- **Pass 1 — inspector drift + cast:** `BlockInspector` imports `McqOption`/`QuizQuestion`/`BranchingNode`/`DragMatchPair` from `blocks.ts` (was re-declaring → two sources of truth), and the named `as unknown as` cast (POLL `options`, formerly `:1041`) is gone (`options: McqOption[] | string[]`).
- **Pass 2 — third dup + drift guard:** `CourseBuilderClient`'s separate `BlockSettings` is now an **alias of `BlockSettingsShape`** (builder + inspector share one settings type; the bag's `generated` reuses canonical `QuizQuestion`). Added a **type-level drift guard** (`_BagCoversCanonical`) asserting every `SettingsFor<T>` stays assignable to the bag — adding a field in `blocks.ts` now forces the bag to mirror it or `tsc` fails.
- **Pass 3 — index signature gone + every editor narrowed:** removed `[k: string]: unknown` from the bag (only cascade was the one `LessonVideoPlayer` callsite in the builder → an explicit `Record<string, unknown>` cast). All **15 `*Fields` editors now take their own `SettingsFor<T>`** (via a `fieldsFor<T>` dispatch helper that performs the single narrowing cast at the `block.type` switch), so a VIDEO editor reading `.options` is now a **compile error** — the original symptom is structurally impossible. The narrowing immediately caught **3 real under-declared fields the reader actually uses** — `POLL.stem` (legacy question), `LIVE.title`, `DRAG_MATCH.prompt` — now added to the canonical types (drift guard still green). Pure type-level; runtime unchanged (the helper is identity at runtime). `tsc`/`eslint`/`vitest`/`next build` all clean. *(Roadmap §6.6 / Tier 4.5 — done.)*

### S2-3 · `Attempt.chosenKey` overloads 5 encodings in one string column — ✅ RESOLVED 2026-06-12
- **Fix shipped (REQUIREMENTS R16):** typed `chosenIndex` / `subIndex` Int? columns on Attempt; migration `20260612*_attempt_typed_columns` backfills the three choice-shaped encodings (`"3"`, `"2:1"`, lettered `"B"`→1) and deliberately leaves `drag:`/`branch:` rows NULL (scores/terminals, not choices). Write side: `lesson.attempt` maps the lettered key to its index; `lesson.attemptBlock` stores both ints directly. `chosenKey` stays for back-compat — analytics must read the typed columns. Covered by `test/attemptTypedColumns.test.ts` (3 cases).

### S2-4 · `react-hooks/exhaustive-deps` disabled in 6 effects — ✅ RESOLVED 2026-06-06
- **Reviewed all six.** None was an actual stale-closure bug; each is one of three idiomatic patterns. Two were **eliminated**, four are now **documented**:
  - **Removed the disable (2):** `AdminInsights.tsx` + `AnalyticsInsights.tsx` "auto-generate on first load" effects — converted to a `firedRef` one-shot latch carrying their real deps (`[needsFirstGen, regen]`). `regen` is a fresh object each render, so the latch (not a trimmed dep array) is what guarantees one fire — and a future edit that reads a new prop now surfaces as a lint error instead of hiding.
  - **Kept + commented (4):** two **mount-only seed** effects (`BlockInspector.tsx` BRANCHING `:1467` / QUIZ `:1850` — `[]` is the intent; re-running would fight the teacher's edits) and two **intentional identity exclusions** (`BlockReader.tsx` BRANCHING terminal re-fires only on `currentId`; DRAG_MATCH shuffle re-keys on `rawPairs.length`, not array identity). All four carry a one-line why-safe comment.
- **Effort:** done.

### S2-5 · Error-swallowing `catch {` blocks — ✅ REASSESSED + RESOLVED 2026-06-06
- **Audit finding:** the original suspicion was largely a false alarm. Every bindless `catch {` in `src` is one of: **feature-detection** (`new URL()` validity in BlockReader SLIDES/PDF/SIMULATION + `LessonVideoPlayer` + CourseBuilderClient `hostOf`; the `stripe`/Mux dynamic-import probes), a **defensive no-op** (SpeechRecognition abort/stop, clipboard-blocked, the SSE partial-line skip in `LessonClient`, the offline-queue retry path), or **input validation that returns a meaningful HTTP error** (the `/api/*` route bodies → 400/401/503). None of those should log — it would be noise (e.g. "user pasted an invalid URL").
- **Fix shipped:** the one genuine "handles the failure but loses the cause" case — `PdfDownloadButton`'s download `catch` (it set the error/retry UI but discarded the fetch/blob error) — now binds the error and `console.debug`s it, so a failed report download is traceable.

### S2-6 · `@prisma/adapter-pg@7.8.0` drops the last-column bind param under connection saturation — ⚠️ ROOT-CAUSED + MITIGATED (2026-07-02)
- **Symptom:** a bundle `db.order.create({ data: { pathId, … } })` persists the row
  with **`pathId = NULL`** — the `pathId` bind parameter is silently dropped.
- **Root cause (confirmed by bisecting):** `@prisma/adapter-pg` defaults to
  **unnamed** prepared statements — `PrismaPgOptions.statementNameGenerator` is
  unset, and its own docs say "if not provided, prepared statements are not
  cached." That unnamed path **drops the last *physical* column's bind parameter**
  once enough same-connection INSERTs accumulate on a pooled `pg` connection.
  `pathId` is `Order`'s **last-added physical column** (Postgres reports the
  failing row with `pathId` last), and it's the **only** field a *bundle* order
  needs non-null — which is exactly why **only bundle orders corrupt** (a
  single-course order leaves `pathId` NULL anyway, so the drop is invisible).
- **Reproduction:** deterministic in the vitest process (hundreds of prior
  inserts) and in a standalone `warm×N → bundle` saturation loop on one `@/lib/db`
  client; **NOT** reproducible in a short script (few queries) or a fresh bare
  client — it's a *stateful* saturation bug, not a per-query one. Independent of
  the CHECK constraint (which only converts the silent NULL into a visible
  `23514`).
- **Prod exposure:** `payment.createPathCheckout` → `order.create({ pathId })` on a
  **warm pooled connection** (a serverless container that has served many prior
  order inserts) can persist `pathId = NULL` → `fulfillPaidOrder` enrolls the buyer
  in **nothing** → **paid-but-unenrolled**. Low frequency (bundles are rare +
  needs a saturated connection), high severity (money in, no access).
- **Mitigation SHIPPED (2026-07-02):** `fulfillPaidOrder` now **throws on a
  both-null order** *before* flipping it to PAID (test: `test/fulfillOrderGuard.test.ts`),
  so a dropped-`pathId` order fails loudly (webhook non-200 → provider retries;
  demoConfirm surfaces the error) instead of silently taking money.
- **Real fix (pending):** **upgrade `prisma` + `@prisma/adapter-pg` past 7.8** and
  re-run the saturation repro to confirm the drop is gone. Do **NOT** set
  `statementNameGenerator` as a blanket workaround — named prepared statements
  break **pgbouncer** transaction-pooling (common on managed Postgres). Once the
  drop can't recur, land the deferred **Order (courseId XOR pathId) CHECK** (R59)
  and extend `test/checkConstraints.test.ts` with the Order cases.

---

## S3 — Hygiene / low risk

### S3-1 · Unused variables — ✅ RESOLVED 2026-06-06
- Was `BlockReader.tsx` `correctCount` (turned out **redundant** with the existing DRAG_MATCH feedback score line → local var removed, not duplicated), `processOutlineJob.ts` `_` (dead `const _ = brief` → `_brief` param), `generator.ts` `settings` (redundant `SettingsSchema.parse` — input already Zod-validated → deleted). ESLint is now at **0 problems**. *(`StudentChrome.tsx`'s dead `_WF` import was removed earlier the same day.)*

### S3-2 · Direct `process.env` reads outside `lib/env.ts` — ✅ RESOLVED 2026-06-06
- **`tutor/stream/route.ts`** — the `mode` audit flag now reads `env.ANTHROPIC_API_KEY` (was `process.env.…`), so the FERPA tutor-usage trail agrees with `env`'s validated view (incl. the empty-string-shadow handling).
- **`trpc/react.tsx` (`PORT`)** — **deliberately left a direct read, now documented:** it's a client module (`"use client"`), and `lib/env` eagerly validates the whole *server* env at import and throws on a miss — importing it into the client bundle would be wrong. `PORT` is only consulted in the SSR base-URL branch; a comment records the exception.
- **Boot-time files** (cron/Sentry bootstrap) read `process.env` by necessity (they run before/around `env` init) — acceptable, as the original audit noted.

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
