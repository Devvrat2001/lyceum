# Lyceum — Agent Working Notebook

**Audience:** future Claude sessions resuming this build.
**Pair with:** [`BACKEND_ROADMAP.md`](./BACKEND_ROADMAP.md) — that one is product-facing scope; this one is engineering execution.

When resuming a session, read in this order:
1. This file's **§ Resume scratchpad** (last in-flight work)
2. **§ Locked decisions** (don't relitigate)
3. **§ Current phase checklist** (what to do next)
4. **§ Gotchas** (Next.js 16 quirks etc.)

---

## § Resume scratchpad

> Update this every session before stopping. Keep it short — last-touched file, last command run, what's broken.

| Field | Value |
|---|---|
| Last session | **2026-06-06 (cont.⁹)** — **Phase 6.7 — course-builder authoring fixes** (committed locally, **NOT pushed**). Three teacher-reported gaps closed. **(1) Manual course creation is now the DEFAULT, AI is the option.** `/teacher/courses/new` was the AI generator; **`git mv`'d it to `/teacher/courses/new/ai`** (history preserved) and made `/new` a new **manual form** (`src/app/teacher/courses/new/page.tsx` — title/subject/grade/tagline/price → new **`teacher.createCourse`** → blank DRAFT → straight into the builder), with a secondary "Use AI builder" card. New `createCourse` mirrors `saveAsCourse`'s unique-slug loop + course defaults but creates **zero units** (blank canvas) and **no embedding refresh** (nothing to embed yet). Repointed the in-builder "AI assist" + "Generate a whole course outline" links (CourseBuilderClient ×2) → `/new/ai`; de-AI'd the teacher-dashboard empty-state CTA. **(2) Manual unit/lesson management in the builder.** New `teacher.updateUnit` (rename + subtitle), **`deleteUnit`** (FK-cascade lessons/blocks + **compacts surviving `order` to 1..N in a `$transaction`** so the rail's "Unit N" stays contiguous), **`deleteLesson`** (cascade + lesson-order compaction). OutlineRail got inline unit **rename** (pencil → input) + **delete** (✕, `window.confirm`) and per-lesson **delete**; new `RailAction` button kept **outside** the unit/lesson `<button>`s (no nested-button) + optimistic local state with **selection reconciliation** (clears the open lesson when its unit/lesson is deleted). The AI page's long-**dead "Add unit" button** (never had an `onClick`) → replaced with a hint, because it *can't* be wired: **`OutlineSchema` requires ≥3 units, each with ≥3 lessons of ≥120-char `readingContent`**, so appending a blank unit makes the outline fail `saveAsCourse` validation — manual unit mgmt belongs in the builder, which now has it. **(3) Teacher video playback in the builder.** The builder canvas's VIDEO `BlockBody` rendered a **static placeholder** — *the reported bug:* a teacher couldn't preview their own Mux upload (even after reload) though students could play it. Extracted the student player into shared **`src/components/video/LessonVideoPlayer.tsx`** (Mux ready/signed/waiting/errored + YouTube/Vimeo sandboxed embed + caption) and render it in the builder; the **course owner/admin is already authorized** for the signed token (`lesson.videoPlaybackToken` lines 89-91), so it plays in-builder. **Delegated `BlockReader`'s `VideoBody` to the same component** (single source of truth) and deleted the now-dead `MuxVideoBody`/`VideoCaption`/`toEmbedUrl`/`MuxPlayer`/`import dynamic` (**−~250 lines** from the fragile reader; its **5 pre-existing lint problems untouched**, only line-shifted). **Verify:** new `test/teacher.outline.test.ts` **+11** (createCourse defaults/slug-dup/non-teacher-reject; updateUnit rename/empty-reject/FORBIDDEN/ADMIN; deleteUnit cascade+renumber/FORBIDDEN; deleteLesson cascade+renumber/FORBIDDEN) → **vitest 115→126**, `tsc` clean, **eslint 9→8** (zero new — all 8 pre-existing; my new files lint-clean), **`next build` clean** (both `/teacher/courses/new` + `/new/ai` routes emit). ⚠ **Not browser-verified** (no headless driver) — the actual upload→play-in-builder loop also needs **Mux keys** (still dormant). ⚠ Gotcha recorded: the `OutlineSchema` min(3)/min(3)/min(120) constraints above. _Earlier same day_ **2026-06-06 (cont.⁸)** — **Phase 6.4 — mobile foundation (responsive student chrome)** (committed `f6c2df8`). Chromes were desktop-first (fixed 212px sidebar, 100vh grid). `src/lib/useMediaQuery.ts` — SSR-safe `useMediaQuery`/`useIsMobile` via **`useSyncExternalStore`** (server snapshot `false` → resolves on mount), chosen specifically so it's **lint-clean** (avoids the `set-state-in-effect` rule a naive matchMedia+effect would trip). `StudentChrome` now branches at **768px**: desktop unchanged; mobile = top app-bar + hamburger → slide-down drawer (search+nav+account), full-width content. Logo → shared `<LyceumMark/>`; nav links shared + close drawer on tap. Also dropped the dead `_WF` import (clears a `KNOWN_ISSUES` S3-1 entry). `tsc`+`eslint` clean (StudentChrome now **0** problems), **`next build` passes**. ⚠️ **The 375px *visual* layout is NOT browser-verified** — no headless browser driver in this env; structurally sound but needs a real-device/devtools pass. Admin/Teacher/Parent chromes reuse `useIsMobile` as follow-on. _Earlier same day_ **2026-06-06 (cont.⁷)** — **Phase 6.4 — finish offline** (committed `614ba62`; suite **114→115**). Generalized the offline queue to the **full `attemptBlock` input** (+`subIndex`/`hintsUsed`/`timeMs`) → no longer MCQ-only; replay route schema widened. Wired the **2nd attemptBlock path** (QUIZ/AI_QUIZ decks) like MCQ (offline → `queueAttempt()` + "Saved offline"). **SW v2**: visited `/student/lesson/*` navigations cached on success + served from cache offline (→ airplane-mode *reading*, not just a stub). Follow-on: POLL.vote + DRAG_MATCH/BRANCHING completion mutations (different shapes) not yet queued. **Also this session: `KNOWN_ISSUES.md`** (committed `7cedd09`) — codebase audit of latent failure risks (S1 prod-TLS / unvalidated Json cast / React-Compiler ref-mutation; S2 setState-in-effect ×4, BlockSettingsShape union, chosenKey overload, exhaustive-deps disables; S3 hygiene) — linked from CLAUDE.md. Net: **9 ESLint problems total**, 0 `@ts-ignore`, `tsc` clean; `next build` does NOT gate on lint (why they persist). _Earlier_ **2026-06-04 (cont.⁶)** — **Phase 6.4 — offline attempt queue + replay (MCQ)** (committed `05bfbf8`; `master` **ahead 1**; the prior 5 were **pushed** this session). First slice of true offline lesson reading: don't lose a student's answer when they're disconnected. `lib/offline/attemptQueue.ts` — **pure, storage-injected** queue (enqueue + flush-with-retry; at-least-once, removes only after server-accept) → **fully unit-tested with an in-memory store**. `lib/offline/attemptStore.ts` — IndexedDB store (**SSR/no-IDB-safe no-op fallback**) + `flushQueuedAttempts()`. `/api/lesson/attempt-replay` — auth'd, re-runs `lesson.attemptBlock` via `getServerCaller()` (same validation/XP/streak; 401 on lapsed session → stays queued). `components/offline/OfflineSync` mounted in `StudentChrome` flushes on mount + `online` event. **BlockReader MCQ**: surgical lint-clean wiring (`navigator.onLine===false` → `queueAttempt()` + "✓ Saved offline — syncs when you reconnect"; can't show server-authoritative correctness/XP offline). **vitest 109→114** (+5 queue logic). **Scope:** MCQ is the representative path — other block types reuse `queueAttempt()` (follow-on); **lesson-content precache (offline *reading*)** is the other half (follow-on). ⚠ **Hit the Docker-down gotcha mid-cycle:** machine slept between cycles → Postgres `:5433` `ECONNREFUSED` → all 18 DB test files fail in `cleanupTestUsers` `beforeAll` (NOT a code regression — pure-logic tests stayed green). Fix: relaunched Docker Desktop (`Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"`), daemon+DB up in ~3s, suite back to **114/114**. **`next build` clean** (offline client module + replay route bundle fine). ⚠ **BlockReader's 5 lint problems are pre-existing** (1346/1603/1929 `set-state-in-effect`, 2006 `immutability` on `recognitionRef.current=`, 2546 `correctCount` unused-var warning) — my edits added zero; line numbers shifted +17 from master. _Earlier same day_ **2026-06-04 (cont.⁵)** — **Phase 6.4 — i18n scaffold (next-intl, en+es)** (committed `be05101`; `master` **ahead 4**). next-intl in **"without i18n routing"** mode — locale from a **cookie** (`locale`), so the whole existing route tree is untouched (no `[locale]` segment). `src/i18n/locales.ts` (registry: en/es, default, cookie name, `isLocale` guard), `src/i18n/request.ts` (`getRequestConfig` — clamps the cookie to a known locale **before** the dynamic `messages/${locale}.json` import), `src/i18n/setLocale.ts` (**server action** sets the cookie — not a client `document.cookie` write, which trips the React-Compiler `react-hooks/immutability` lint), `src/messages/{en,es}.json` (namespaces `Progress`,`Language`), `LocaleToggle` (EN/ES → server action + `router.refresh()`). `next.config.ts` composes `createNextIntlPlugin("./src/i18n/request.ts")` **around** the existing conditional Sentry wrap; root `layout.tsx` is now **async** (`getLocale()` → `<html lang>`, wraps `NextIntlClientProvider`). **Demo:** the **student progress page** is fully translated (`getTranslations("Progress")`) + carries the toggle, so flipping the locale flips the page in place. **vitest 106→109** (+3 catalog-parity: identical key sets across locales + no empty strings). ⚠ **Tradeoff:** cookie locale in the root layout opts everything into **dynamic rendering** — the 2 last static pages (`/teacher/courses/new`, `/teacher/discussions`) became `ƒ`; both trivial. **Build-verified.** _Earlier same day_ **2026-06-04 (cont.⁴)** — **Phase 6.5 — student progress report PDF** (committed `1f7b425`). Made good on the progress page's promised "printable parent report". Rode the board-report `@react-pdf` pipeline: `services/studentReport.ts` `gatherStudentReportData(db,userId,now)` (lifetime xp/level[`1+floor(xp/350)`]/streak/badges + this-week lessons+xp + per-course progress); `lib/reports/StudentReportPdf.tsx`; `/api/student/report` (signed-in, **always scoped to caller's own id**); progress-page **"Download report"** button + trimmed the now-shipped PDF line from its ComingSoon. **DRY:** generalized the admin button into shared `components/ui/PdfDownloadButton` (deleted bespoke `BoardReportButton`). **vitest 103→106** (+3). `tsc`+`eslint` clean. _Earlier same day_ **2026-06-04 (cont.³)** — **Phase 6.5 — admin Board report PDF** (committed `89f6ff3`; `master` **ahead 1** — the prior **8 were pushed** this session, deploy triggered). The admin overview's **"Board report" button was dead** (a `<Btn>` with no handler) — now real. `npm i @react-pdf/renderer` (pure-Node PDF, no headless Chromium → reliable on Vercel serverless). `services/boardReport.ts` `gatherBoardReportData(db, institutionId)` — institution snapshot (counts, 30-day active students, avg quiz score, top-5 teachers by reach, + the cached admin AI insights the nightly cron warms); `lib/reports/BoardReportPdf.tsx` `renderBoardReportPdf(data)→Buffer` (header accented by `Institution.brandColor`, graceful empty states); `/api/admin/board-report` route **ADMIN-only** (mirrors `/api/teacher/1099` `auth()` posture, scoped to the admin's own institution, returns `application/pdf` attachment); `BoardReportButton` client (fetch→blob→download with generating/retry state) replaces the dead button in `app/admin/page.tsx`. **No migration, no external key — always on.** **vitest 99→103** (+4: real `%PDF-` bytes for populated + empty/no-brand reports, gatherer snapshot, `resolveAdminInstitutionId`). `tsc`+`eslint` clean; **full `next build` bundles `@react-pdf/renderer` in the route with no `serverExternalPackages` needed.** _Earlier same day_ **2026-06-04 (cont.²)** — **Phase 6.6 — nightly AI-insight cache-warmer cron** (committed `9e544ef`, **NOT pushed** — `master` **ahead 7**). The teacher/admin analytics insight cache (`Insight`, 24h TTL) was regenerated **on-demand** → an LLM call on the page's critical path. Extracted that generation into `src/server/services/insightEngine.ts` (`generateTeacherInsights` / `generateAdminInsights` — ctx-free, same stats+LLM/demo+atomic store as before, ~150 lines de-duped); `insight.regenerateTeacher/regenerateAdmin` are now thin wrappers (rate-limit + audit unchanged). New **`/api/cron/ai-insights`** (CRON_SECRET Bearer) warms only scopes with signal (teachers with a course, institutions with a student), **sequential + 50s time-budget** under the 60s ceiling so it never times out — unreached scopes fall back to the on-demand path / next run; scaling path is QStash fan-out. `vercel.json` cron `0 6 * * *`. Unblocked now that `ANTHROPIC_API_KEY` is live in prod; **no key → deterministic demo insights, safe pre-launch.** **vitest 96→99** (+3 insightEngine: store/scope/kinds/TTL, regeneration idempotency, admin store). **⚠ Gotcha surfaced + recorded:** the **vitest env carries the real LLM key from `.env.local`** (`isLlmEnabled()` is **true** in tests), so any test that hits a non-empty LLM scope fires a **real network call** (first draft did → `mode:"openai"`, 10s, flaky). Fix: `vi.mock("@/lib/ai/llm", …, isLlmEnabled:()=>false)` (spread real exports, override the gate) to force the offline demo path. _Earlier same day_ **2026-06-04 (cont.)** — **Phase 6.2 — Sentry error monitoring** (committed `3ae07cf`, **NOT pushed** — `master` now **ahead 5**). `npm i @sentry/nextjs` (v10.56). Wired all three runtimes **dormant-safe, gated on `SENTRY_DSN`**: `src/instrumentation.ts` (per-runtime `register()` → `sentry.server/edge.config.ts` + `onRequestError = captureRequestError`), `src/instrumentation-client.ts` (browser init + `onRouterTransitionStart`). Each `Sentry.init({ dsn, enabled: Boolean(dsn), tracesSampleRate: dev?1:0.1, sendDefaultPii:false })`. **tRPC** `[trpc]/route.ts` `onError` now `Sentry.captureException(error.cause ?? error, { tags:{ trpcPath } })` **for `INTERNAL_SERVER_ERROR` only** (expected client errors stay out of the stream). `next.config.ts` wraps with `withSentryConfig` **only when `SENTRY_DSN` is set** (else byte-for-byte the old config — zero risk to the live build); source-map upload skipped without `SENTRY_AUTH_TOKEN`. New optional env: `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`. **Privacy (K-12): `sendDefaultPii:false` + NO Session Replay** — never ship student IPs/headers/screens to a third party by default. **Verified honestly:** `tsc`+`eslint` clean; **vitest 96/96** (no regression — no Sentry-specific tests, the dormant init is a no-op with nothing unit-testable); **a real `next build` with a dummy `SENTRY_DSN` exercised the `withSentryConfig` plugin path and compiled clean** (full route manifest emitted). **Dormant until `SENTRY_DSN`+`NEXT_PUBLIC_SENTRY_DSN` land on Vercel** (then the exit criterion — induced error appears in Sentry — is the user's to confirm with a real project). _Earlier same day_ **2026-06-04** — **Phase 6.1/6.6 — weekly progress digest** (committed `9c545d2`, **NOT pushed** — `master` now **ahead 3**: `858f56f` signed playback, `a41f6a2` docs, `9c545d2` this). **Made the email SDK real** — `npm i resend` (now a hard dep; dropped the optional-dep `@ts-expect-error` in `lib/email.ts`), so receipts **and** the new digest are live the moment `RESEND_API_KEY` lands (no `npm i` step left). **New weekly digest:** `buildWeeklyDigests(db, now)` in `services/weeklyDigest.ts` — pure audience+aggregation (role STUDENT, `emailOptOut===false`, ≥1 activity in trailing 7d; four grouped queries → lessons completed / attempts / correct / XP-sum, streak pulled inline; zero-activity students skipped so it's never "you did nothing" spam) — **no email import, fully unit-tested**. `sendWeeklyDigest()` in `lib/email.ts` (inline-HTML template: lessons, questions, accuracy %, XP, streak; dormant no-op returning `false` without the key). `/api/cron/weekly-digest` route (CRON_SECRET Bearer, mirrors `streak-rollover`) + `vercel.json` cron `0 13 * * 1` (Mon 13:00 UTC). **Honors the `/settings` `emailOptOut` toggle end-to-end** → closes the **6.6 "weekly emails" cron** (was ⛓ gated on 6.1 Resend). **vitest 90→96** (+6: aggregates, opt-out suppression, no-activity skip, 7-day window boundary, teacher-excluded, dormant send; tests pin `now` to **year-2002** so the trailing window can't catch seeded 2026 data, and assert on specific userIds not totals). `tsc`+`eslint` clean. **Still dormant until `RESEND_API_KEY` is set.** _Earlier_ **2026-06-01** — **Phase 6 dev cycle** — all committed; **features (1)–(4) pushed** to `origin/master` (prod deploy `dpl_C9ibk…` **READY**, so the settings / SSO / image migrations applied cleanly in prod and `/settings` is live), **(5) pushed too** (brand-color migration applied in prod); **(6) below committed locally** — **`git status -sb` is the source of truth for ahead/behind**. **(1) Self-serve `/settings`** (all roles): migration `add_account_settings` (User `emailOptOut`/`tutorLogOptOut`/`coppaConsentAt`); new **`account` router** (`me`/`updateProfile`/`changePassword` (bcrypt-verified)/`updatePreferences`, every write scoped to `ctx.user.id`); `/settings` page + `SettingsClient` (Profile/Password/Email/Privacy sections), gated in `proxy.ts` for any signed-in role; the **tutor stream now skips persisting message content when `tutorLogOptOut`** (rate-limit + audit still fire); Settings link added to `SidebarUserMenu`. **11 new vitest cases → suite 63/63**; `tsc`+`eslint` clean; dev-smoke: anon `/settings` → 307 `/login?next=/settings`. **(2) Google SSO (env-gated)**: migration `add_user_image_for_oauth` (`User.image` — the Auth.js Prisma adapter writes `image` on OAuth `createUser`); `auth.ts` registers a Google provider **only when `GOOGLE_CLIENT_ID`/`SECRET` are set** (`allowDangerousEmailAccountLinking` — Google verifies email so a same-email password account links instead of erroring), plus `isGoogleAuthEnabled()`; gated "Continue with Google" button on `/login` (callbackUrl routed through `/login` so existing `safeRedirect` lands the role loop-safe). **New Google users default to `STUDENT`** (admin upgrades; role-carrying Clever/ClassLink is the follow-on). Verified the **gating** (dummy creds → button + G logo render, app boots with the provider active); **the live OAuth handshake is NOT verified — needs a real Google OAuth client (user's to create: redirect URI `…/api/auth/callback/google`)**. Also wrote up **Phase 6** in `BACKEND_ROADMAP.md` (§ Phase 6, sub-phases 6.1–6.6 with sizes + exit criteria) + the Tier 7 pointer below. **(3) Block reorder across lessons** — `teacher.moveBlock({blockId,toLessonId})` (same-course, appends to target end, leaves source order sparse like `deleteBlock`, ownership on both ends, cross-course→BAD_REQUEST, same-lesson no-op) + a "Move to lesson" select in the block inspector (threaded `ContextInspector`→`BlockInspector`, optimistic local move mirroring `removeBlock`). **(4) Daily streak-rollover cron** — `expireStaleStreaks(db,now)` in `streakEngine.ts` zeroes `current` for streaks whose `lastDay` is before yesterday UTC (idempotent `updateMany`; `longest` untouched); `/api/cron/streak-rollover` (CRON_SECRET Bearer, mirrors backfill-embeddings) + a 2nd `vercel.json` cron at `5 0 * * *`. **vitest 71/71** (+6 moveBlock, +2 streak; streak test runs at a year-2001 `now` so the global sweep can't touch real data). **(5) Admin Branding (Phase 6.5 — kills the last `ComingSoon` stub)** — `Institution.brandColor` (migration `add_institution_brand_color`); `admin.branding` + `admin.updateBranding` (adminProcedure, hex-validated `^#[0-9a-fA-F]{6}$`, scoped to the admin's institution via `institutionId ?? first`); `BrandingEditor` (name + preset swatches + native colour + hex, live preview) replacing the `ComingSoon`; new `app/admin/layout.tsx` injects the institution's `--wf-accent` via a `display:contents` wrapper so the accent themes every /admin page (`router.refresh()` on save re-reads it). **vitest 76/76** (+5 branding; each test makes its own institution so the global first-institution fallback can't touch the seed). **(6) Mux completion webhook (Phase 6.1 follow-on)** — `/api/mux/webhook` (nodejs runtime) verifies the signature via `mux.webhooks.unwrap(rawBody, headers, MUX_WEBHOOK_SECRET)` and stamps `video.asset.ready` (playbackId + ready status) onto the VIDEO block by `passthrough`=blockId — instant completion vs the builder's polling fallback. Pure `muxStateFromEvent` + terminal-idempotent `applyMuxEventToBlock` in `lib/video/mux.ts`; new `MUX_WEBHOOK_SECRET` env (route refuses without it). **vitest 83/83** (+7). To activate: set the secret + point a Mux webhook at `{PUBLIC_BASE_URL}/api/mux/webhook`. **(7) Signed Mux playback (Phase 6.1)** — paid-course uploads get Mux `signed` playback policy when `MUX_SIGNING_KEY`/`MUX_PRIVATE_KEY` are set (`isMuxSignedPlaybackEnabled`); `createVideoUpload` picks signed iff the course is paid + keys present and stores `mux.policy`. New **enrollment-gated** `lesson.videoPlaybackToken` (owner/admin OR free OR enrolled → mints a 6h `signMuxPlaybackToken`; else FORBIDDEN) — the real hot-link protection. Reader `MuxVideoBody` fetches the token for signed videos + passes `tokens={{playback}}` to MuxPlayer (public unchanged); `policy` preserved through `getMuxState` + the webhook. **vitest 90/90** (+7 — access gate fully tested; the token mint itself needs the signing keys). **Dormant until signing keys are added.** **TLS finding (option 1):** the recurring prod `Warning: SECURITY` is `NODE_TLS_REJECT_UNAUTHORIZED` — NOT in any file (code/config/`.env*`), so it's a **Vercel Production env var** to remove (chip spawned; caveat: possibly a load-bearing Postgres-SSL workaround — remove → redeploy → watch logs for cert errors; if the DB breaks, set `sslmode=require` in DATABASE_URL instead of disabling verification globally). _Earlier_ **2026-05-31** — **Mux video upload** so teachers upload videos in-app instead of linking YouTube. Installed `@mux/mux-node` + `@mux/mux-player-react` + `@mux/mux-uploader-react`; lazy `src/lib/video/mux.ts` (`isMuxEnabled()` gates on `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET`, mirrors the Stripe wrapper). VIDEO block `settings` gained `source:"url"|"mux"` + `mux:{uploadId,assetId,playbackId,status,aspectRatio}` — **no migration** (open JSON). New `teacher.createVideoUpload` (mints a Mux direct-upload URL, `passthrough`=blockId, merges `source`/`mux` into settings) + `teacher.videoStatus` (polls Mux, merges status/playbackId in). Builder VIDEO inspector got a `MuxUploader` (dynamic `ssr:false`) — progress → Processing → Ready + Replace, keeping the paste-URL fallback; reader `VideoBody` renders `MuxPlayer` (dynamic `ssr:false`) for ready uploads, "processing…" placeholder otherwise. **Status via client polling** (works in local dev — no webhook yet; self-heals on reopen). **Public** playback for v1. `tsc`+`eslint` clean (BlockReader's 5 lint errors are pre-existing, just line-shifted). Browser-verified the no-keys path: uploader shows a "configure Mux" hint, paste-URL/empty video still renders, added+deleted a VIDEO block cleanly. **Needs Mux keys for the real upload→play loop** (see Blockers). Follow-ups: `/api/mux/webhook` (instant finish if the teacher closes the tab mid-process) + **signed playback** (protect paid-course videos). _Earlier_ **2026-05-30** — Phase 5 (Tier 6) kickoff: shipped a real `/admin/analytics` deep-dive, replacing the `ComingSoon` stub. New `admin.analytics` tRPC query (institution-scoped weekly time-series via `$queryRaw` `date_trunc`, period-over-period KPI deltas, subject/grade rollups, top-courses leaderboard, completion funnel) + dependency-free pure-SVG charts (`src/components/admin/AnalyticsCharts.tsx`). `tsc`+`eslint` clean; browser-verified as admin across 12/26/52-week range tabs (each re-queries server-side via `?weeks=`). Router-only — **no migration**. **Then Tier 6.4 discussions**: the block-level DISCUSSION thread (`lesson.discussionThread`/`postComment` + reader `DiscussionBody`) already existed, so the real gaps were moderation + the two hub stubs. Added `lesson.deleteComment` (author OR course-owner-teacher OR admin; audits moderated deletes as `discussion.delete_comment`), `lesson.teacherDiscussions` + `lesson.studentCommunity` aggregates, reader self-delete, a teacher moderation hub (`TeacherDiscussionsClient`), and a real `/student/community` feed — both replacing `ComingSoon` stubs. Browser-verified the whole loop as 3 roles (student post → self-delete; teacher Remove → audit row with the teacher as actor; admin audit filter). Router-only, no migration. **Then Tier 6.3 skill-tree progression**: the tree was a static visualization (mastery seeded, never moved) with fake decorative copy. Added `src/server/services/skillProgress.ts` — `computeSkillStates` (extracted from `skill.tree`, now shared) + `nudgeCurrentSkill`; every correct attempt nudges the student's *current* path skill (+0.1) via `awardCorrectAttempt`, crossing 0.8 flips it to done, unlocks the next node, and posts a `skill_mastered` notification. Replaced the fake "AI re-routes nightly / AI selected this branch" copy with honest text + a real "Continue learning →" CTA. Browser-verified: correct MCQ → Equivalent Fractions 60%→70%→80% done, 7→8/13 mastered, next skill up-next, notification in the bell. No Skill↔content mapping yet, so "current skill" is the attribution proxy (documented in the service). Router/service-only, no migration. (Verifying advanced Jordan's seeded mastery to 8/13 — `npm run db:seed` restores the baseline.) **Then validated the whole session** — ran the suites, found + fixed 3 pre-existing test-infra failures (live Stripe key flipped demo-payment tests to the Stripe path → vitest strips Stripe secrets, Playwright `webServer` forces demo mode; stale `course-builder.spec` updated for `/teacher` being a course list) → **vitest 52/52 + playwright 7/7** (`b8ab40d`). **Then Tier 6.1 PWA foundation**: `app/manifest.ts` (installable, `display:standalone`, brand colours), `public/icon.svg` (maskable brand mark), `public/sw.js` (HMR-safe SW — network-first nav → `public/offline.html`, SWR static, skips `/_next` + `/api`), prod-gated `ServiceWorkerRegister`, layout `viewport.themeColor` + `appleWebApp` + icons. Verified served artifacts + head tags. SW registration is production-only (no-op in dev); NOT full offline lesson reading yet (caching lesson data + sync is the follow-up). No migration. Prior session shipped Course Builder v2 (`d438931`, pushed). Earlier: 2026-05-22 — large session, **5 commits, all pushed** (`origin/master` @ `f88d2c2`): `c64b6e9` real analytics data + editable course metadata (`teacher.updateCourse`, editable title/tagline/subject/grade/price); `6050321` **teacher storefront** — the skipped Phase-3 item: `User.headline`+`bio` (migration `add_teacher_storefront`), public `marketplace.teacherProfile`, new `/t/[teacherId]` profile page, real `/teacher/storefront` editor (was a ComingSoon stub), marketplace "Teachers to follow" cards link through; `9d94b2e` **invoice email** — `lib/email.ts` lazy Resend client, `sendOrderReceipt()` wired into `payment.demoConfirm` + the Stripe webhook; `c362079` **Stripe checkout fixes** (see Gotchas — `externalId` collision + stale `apiVersion`); `f88d2c2` **redirect-loop fix** — `safeRedirect()` in `lib/roles.ts`. Stripe went **live test mode** (`npm i stripe`, keys in `.env.local`, Stripe CLI installed) and the **real-Stripe smoke test PASSED end-to-end**, browser-verified: test-card purchase → `checkout.session.completed` → webhook 200 → Order PAID → Enrollment created. |
| Phase | **Phases 1–4 complete.** Phase 4's last two items closed this session — real-Stripe smoke ✓ (verified end-to-end), invoice email ✓ (built; needs a real `RESEND_API_KEY` to actually send). The skipped Phase-3 **storefront** also shipped. Block reader 15/15, XP on all 7 interactive types. Next coherent work: **Phase 5 / Tier 6** — mobile/PWA, teacher + student discussions (still ComingSoon stubs), i18n, skill-tree progression, admin pages, parent self-invite. |
| Branch | `master` — in sync with `origin/master` @ `f88d2c2`. Working tree clean. |
| Dev server | `npm run dev` — port 3000, Turbopack. Postgres :5433 via Docker (`lyceum-postgres`, auto-starts with Docker Desktop; **if Docker is down every Prisma call `ECONNREFUSED`s and crashes `next dev`** — start Docker, wait for the container healthy, restart dev). App runs in **live Stripe test mode** (keys in `.env.local`). Stripe webhooks need `stripe listen --forward-to localhost:3000/api/stripe/webhook` running (Stripe CLI at `C:\Users\maind\stripe-cli`, on PATH; pass `--api-key` to skip `stripe login`). Prisma client is module-cached — after any `prisma generate`, restart dev + clear `.next/cache`. |
| Last passing | `tsc --noEmit` + `eslint` clean across every file changed this session. Storefront + the real-Stripe purchase both **browser-verified end-to-end**. **Full suite green 2026-05-30: vitest 52/52 + playwright 7/7.** Fixed 3 pre-existing test-infra issues (not feature regressions): a live `STRIPE_SECRET_KEY` in `.env.local` was flipping the demo-mode payment tests onto the Stripe path — vitest now strips Stripe secrets in `loadDotEnv()`, and the Playwright `webServer` forces an empty `STRIPE_SECRET_KEY` (demo mode); and `e2e/course-builder.spec.ts` was updated for the current `/teacher` course-list behaviour (it still expected the old hard-redirect-into-editor). **Run e2e with port 3000 free** so Playwright boots its own demo-mode server — a reused Stripe-mode `next dev` breaks buy-flow. |
| In flight | **Nothing uncommitted.** This session's `/admin/analytics` work is committed (see Last session). _History — Course Builder v2 (shipped `d438931`):_ Rebuilt `src/components/teacher/CourseBuilderClient.tsx` to the Gamma-style WYSIWYG design (Claude Design handoff `Course Builder v2.html` → `wf-builder-v2.jsx`): left **COURSE OUTLINE** rail (replaces the dead block library), center canvas renders every block **as the student sees it** with inline insert-lines + a `/` command menu, right **contextual inspector** (Block / Lesson / Course / AI tabs) + Edit↔Student preview toggle. New `teacher` mutations: **`addUnit` / `addLesson` / `updateLesson`** (mirror `addBlock` ownership pattern; `addLesson` mints a unique slug). Extended `BlockInspector` with an `embedded` mode + **Appearance/Behavior** sections (persist to `settings.appearance`/`settings.behavior`) + Delete. Canvas is a `<section>` (was `<main>` → avoid nested-main). e2e `block-library.spec.ts` → replaced by **`course-builder.spec.ts`**. **Orphaned by this change:** `AddBlockPopover.tsx` + `BlockLibrary.tsx` (no longer mounted; starter-template *insertion* UI dropped to match the design — server `addBlock({templateId})` still supports it). `tsc --noEmit` + `eslint` clean; browser-verified (render + block-select inspector + student view); `updateLesson` DB-verified (rename persisted, slug untouched, reverted). **NOT committed/pushed.** |
| Next up | **Phase 6 — Launch Readiness & Growth** (written up 2026-06-01 in [`BACKEND_ROADMAP.md`](./BACKEND_ROADMAP.md) § Phase 6). Launch gate = **6.1** activate built-but-dark features (Resend / Anthropic prod key / Stripe-Connect go-live / Mux webhook + signed playback) → **6.2** hardening (Sentry · rate-limit the tutor stream · nightly `pg_dump` + restore drill · fix the `NODE_TLS_REJECT_UNAUTHORIZED=0` smell) → **6.3** compliance (Google + Clever/ClassLink SSO · `/settings` with COPPA consent + AI-log opt-out). Post-launch = **6.4** mobile / i18n / true-offline / Branding + **6.5** live / speech / PDF. _Quick first win:_ `npm i resend` + a real `RESEND_API_KEY` (it logs-and-skips until then). |
| Blockers | Email live send (receipts + weekly digest) → just a real `RESEND_API_KEY` now (the `resend` package is installed; logs-and-skips until the key). Sentry error capture → set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` on Vercel (+ `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` for source maps); `@sentry/nextjs` wired + build-verified, dormant until the DSN lands. Real Claude path (tutor, quiz gen, course generator, marketplace AI search) → `ANTHROPIC_API_KEY` (demo fallbacks work without). Teacher payouts → the Stripe test account (`acct_1T10dQ…`) is un-activated (`charges_enabled=false`) and Connect isn't enabled; test charges work regardless, but live payouts need Dashboard activation + Connect setup. Parent self-invite token flow → still needs Resend. **Mux video upload** → needs a Mux account + `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` in `.env.local` + Vercel (Mux dashboard → Settings → Access Tokens, "Mux Video" read+write; free tier = 100K delivery min/mo + 10 videos). Without keys the VIDEO block stays paste-URL-only and the in-builder uploader shows a "configure Mux" hint. |

## § Forward plan

Prioritized work for the next 3-6 sessions. Each item has a size, a why, and concrete steps. Updated 2026-05-17 after closing block-reader coverage at 15/15.

### Tier 1 — Immediate (next session)

**1.1 Browser smoke-test the 18-commit stretch** · ~30 min if clean
- *Why now:* Nothing this session is browser-verified. 3 stacked migrations are module-cached on the running `next dev` (port 3000, PID set hours ago).
- *Steps:* (1) Kill `next dev`; (2) `rm -rf .next/cache`; (3) `npm run dev`; (4) sign in as Jordan, open `/student/lesson/multiplying-fractions` — every block type 1-15 should render against the seeded samples; (5) submit MCQ, vote on POLL, post in DISCUSSION — verify XP / streak chips appear; (6) walk teacher inspector for one of each new type to confirm settings persistence; (7) check marketplace homepage for "✓ IN LIBRARY" badging.
- *Bugs found:* file a follow-up commit per bug — small focused fixes.

**1.2 ✅ DONE — XP persistence for the 4 self-check block types** · `0d3de18`
- *Why:* AI_QUIZ / QUIZ / DRAG_MATCH / BRANCHING render correctly but their "Check" doesn't write Attempts or bump streak. Single biggest gap in the lesson-engagement loop.
- *Design decision (do first):* Per-question vs per-block attempts.
  - AI_QUIZ + QUIZ are N-question decks → per-question Attempt rows make sense (treat each question like a mini-MCQ).
  - DRAG_MATCH + BRANCHING are atomic → single per-block Attempt with `correct: bool` + maybe a `partialScore` JSON field.
  - **Recommended:** Extend `lesson.attemptBlock` to accept optional `subIndex: number?`. Encode in existing `chosenKey` string column as `"3:1"` (question 3, answer index 1) so no schema migration needed. DRAG_MATCH/BRANCHING use subIndex=null, single attempt.
- *Steps:* (1) Update `attemptBlock` Zod input + Block.type dispatch; (2) AI_QUIZ + QUIZ: each `QuizQuestionCard` gets its own mutation call on Check, awards XP per question; (3) DRAG_MATCH: "Check matches" calls mutation once with `correct = (correctCount === totalPairs)`; (4) BRANCHING: terminal-node first-visit calls mutation; (5) reader UI mirrors MCQ's XP/STREAK chips.

**1.3 ✅ DONE — Fix the duplicate SIMULATION block** · DB-only via cleanup script (no commit)
- *Why:* Cosmetic. Original seed had a placeholder SIMULATION at order 4; this session seeded a real one at order 14. Both render.
- *Steps:* via Prisma Studio or one-off script, delete the order-4 SIMULATION block on the multiplying-fractions lesson.

### Tier 2 — Phase 4 (Institution + Polish)

**2.1 ✅ DONE — Refund self-service UI** · `304dd9f`. Real-Stripe path throws NOT_IMPLEMENTED — actual stripe.refunds.create wiring lands with Tier 2.2.
- *Why:* Phase 3 wired the webhook for `charge.refunded` (flips Order to REFUNDED + deletes Enrollment). What's missing is a button for teachers to *initiate* a refund.
- *Steps:* (1) Add `payment.refundOrder({ orderId })` mutation — ownership check (teacher owns the course); calls `stripe.refunds.create({charge})` for real-mode, in demo just flips status; (2) Teacher earnings page gets a "Refund" button per PAID order; (3) Confirm dialog with order amount + buyer email; (4) Audit log entry.

**2.2 ✅ DONE — Real-Stripe smoke test** · `c362079` (2026-05-22). `npm i stripe`; `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` in `.env.local`; Stripe CLI installed (`C:\Users\maind\stripe-cli`). Full flow browser-verified: test-card purchase → Checkout Session → `checkout.session.completed` webhook → 200 → Order PAID → Enrollment. Two bugs fixed en route (constant `externalId` placeholder collided on `@unique`; stale hardcoded `apiVersion`). The test account is un-activated (`charges_enabled=false`) — test charges work regardless; live mode + Connect payouts still need Dashboard activation.

**2.3 ✅ DONE — Parent role surface** · `9c5d7dc` (foundation) + `0260cc4` (dashboard + proxy gate). Shipped in two commits across one session — under the 2-3-session estimate because we leaned on existing primitives (per-child cards mirror student-dashboard KPI strips) and skipped weekly-digest email (lands with Tier 2.5). Deferred: parent self-invite token flow (admin-only linking for v1); weekly digest notification (waits on Resend); per-child sidebar/chrome (waits until multi-kid navigation actually hurts).
- *What landed:* `ParentChild` join model (`@@unique([parentId, childId])` for idempotent upsert) + migration `add_parent_child`; `admin.parentLinks` / `linkParentToChild` / `unlinkParentFromChild` tRPC mutations with institution-scope guards; `ParentLinksManager` client component on `/admin/people` (lazy `enabled: open`, optimistic invalidate); `/parent` server-component dashboard with per-child cards (avatar + KPI strip + current courses with progress meters + recent 5 attempts); `proxy.ts` extended with `/parent → PARENT \|\| ADMIN` role gate; seed script `scripts/seed-parent-and-probe-link.ts` produces `casey.parent@cedar.test` (password `demo1234`) pre-linked to Jordan Riley.

**2.4 ✅ DONE — 1099 / annual tax export for teachers (US)** · `bd2fce3`. Note: CSV includes buyer email — review for jurisdictional PII rules before going live.
- *Why:* Marketplace teachers need this for taxes if they earn > $600/yr. Required for US compliance once we have real money flowing.
- *Steps:* (1) Server route that aggregates Order rows per teacher per calendar year; (2) CSV export endpoint (PDF can come later — needs a primitive); (3) Teacher earnings page gets a "Download 1099 data" link.

**2.5 ✅ DONE (code) — Invoice email after purchase** · `9d94b2e`. `lib/email.ts` — lazy Resend client mirroring the Stripe lazy-import: no-ops (logs + skips) without `RESEND_API_KEY` or the `resend` package. `sendOrderReceipt()` is best-effort (swallows its own errors so a receipt can never break checkout), wired into both order-paid paths — `payment.demoConfirm` and the Stripe `checkout.session.completed` webhook. Receipt is an inline-HTML template. **To go live:** `npm i resend` + a real `RESEND_API_KEY`.

### Tier 3 — Production readiness

**3.1 Error monitoring** · ~1 hour
- Sentry is the safe pick. Next.js has first-class integration. Wraps server actions, tRPC, edge.

**3.2 Email delivery infrastructure** · ~30 min (covered by 2.5 if done first)

**3.3 Database backup strategy** · ~1 hour
- Production: `pg_dump` daily cron → S3 or equivalent. Restore drill once.

**3.4 Deploy to Vercel** · ~30 min if env is documented
- Hardest part: managed Postgres provider (Neon / Supabase / Vercel Postgres). Lyceum is currently local Docker only.

**3.5 Mobile responsive audit** · ~1-2 sessions
- Phase 5 territory. Most chromes are desktop-first (grid layouts, fixed widths). Worth scoping before committing.

### Tier 4 — Block-system v2 enhancements

**4.1 ⚠ PARTIAL — Block library left rail (click-to-insert)** · drag-to-lesson deferred
- *What landed:* the previously-decorative left rail in `CourseBuilderClient.tsx` (`BLOCKS` local hardcoded constant + `draggable` HTML attr with no handler) is replaced by a real `BlockLibrary` component (`src/components/teacher/BlockLibrary.tsx`). Renders two sections — STARTERS (the 12 templates from Tier 4.4's `BLOCK_TEMPLATES`) and BLANK BLOCKS (the 15 types from `BLOCK_GROUPS`). Click → calls `teacher.addBlock` (templateId for starters, plain type for blanks) targeting the **selected lesson**. The selected lesson is whichever row the teacher most recently clicked in the builder canvas — visualised with a dark border + soft fill, similar in spirit to the block-selected glow but distinct (uses `var(--wf-ink)` border vs the accent treatment for blocks). Defaults to the first lesson on mount so the library is actionable immediately. When no lesson is selected the library shows "Click any lesson in the canvas to set the insert target." and disables every item.
- *UX wins:* templates are now permanently visible (no more hidden popover); discoverability ↑; insert into any lesson is one click instead of "open the right row's popover, pick from sub-menu".
- *Deferred (Tier 4.1 v2):* drag a template card from the rail directly onto a lesson row. Requires collapsing the 3 nested DndContexts in `CourseBuilderClient.tsx` (units / lessons-within-unit / blocks-within-lesson) into a single top-level context with prefixed draggable ids (`unit:`, `lesson-in-u_…:`, `block-in-l_…:`, `library:templateId`) and a master `onDragEnd` that dispatches on the prefix. Worth doing when teachers explicitly ask — click-to-insert covers the common-case workflow now.
- *Side cleanup:* dropped the duplicated `BlockGroup`/`BlockItem` local types + `BLOCKS` constant — `BLOCK_GROUPS` from `@/lib/blocks` is now the single source of truth for the type catalog in the builder.

**4.2 Block reorder across lessons** · ~1 session
- "Move block to lesson X" — currently you can only reorder within a lesson.

**4.3 ✅ DONE — AI_QUIZ adaptive regeneration**
- *What landed:* `generateAiQuiz` now reads the previous batch's questions from `Block.settings.generated.questions` + every `Attempt` row for the block (filtered to Tier 1.2's `"subIdx:choiceIdx"` encoding via `chosenKey contains ":"`), runs a new pure helper `computeWeakSpots(prevQuestions, attempts)` that returns per-question pass-rate stats above the noise floor (`MIN_SAMPLE_SIZE = 3`, `THRESHOLD = 0.6`), and feeds those into a new `weakSpots?: WeakSpot[]` arg on `buildQuestionGenPrompt`. When weak spots are present the prompt grows a "STUDENT PERFORMANCE — PREVIOUS BATCH" section instructing Claude to target the same underlying concept with a different surface form (different wording / numbers / setup) while staying within ±1 difficulty. First-generate path (no prior batch) skips the lookup entirely. Audit payload + return value both expose `weakSpotsUsed` so the regenerate UI can surface "adapted from 3 weak items" telemetry.
- *Tests:* 8 new cases in `test/computeWeakSpots.test.ts` covering empty attempts, all-strong, single-weak, noise-floor rejection, threshold-boundary, null chosenKey skipped (legacy Question attempts), malformed chosenKey skipped (DRAG_MATCH `"drag:N/M"` and legacy lettered keys both correctly ignored), question-order preservation. Suite is now **37 tests**.
- *Deferred:* per-question difficulty calibration (move the difficulty knob in response to pass rates — needs the GeneratedQuestion schema to carry an explicit difficulty intent the model can return); per-student personalization (current signal is class-wide, not per-learner — that's a bigger product question about whether AI quizzes should adapt per kid).

**4.4 ✅ DONE — Block templates library**
- *What landed:* new `src/lib/blockTemplates.ts` with `BLOCK_TEMPLATES` catalog (12 starters covering MCQ / true-false / Quiz / Drag-Match / Discussion / Poll / Section / Reading / AI Quiz / Speak / Live / Branching) and a `tpl<T>()` builder that enforces per-template `settings` against `SettingsFor<T>` at definition time. `teacher.addBlock` now takes an optional `templateId` — server resolves the catalog (single source of truth, clients can't smuggle arbitrary JSON) and seeds `Block.settings`. `AddBlockPopover` grew a "STARTERS" group at the top of the menu with one-click insert. 8 new vitest cases (`teacher.addBlock.test.ts`) cover catalog uniqueness, settings-seeding, type-mismatch rejection, unknown-templateId rejection, blank-block backward-compat, and cross-teacher FORBIDDEN. Suite is now **29 tests** (was 21).
- *Deferred:* AI-generated templates per teacher ("save current block as template"); custom templates per institution. Both want a `BlockTemplate` table on disk rather than the in-code catalog — defer until teachers actually ask.

**4.5 Refactor BlockSettingsShape into discriminated union** · ~1 session
- Currently a sprawling union with ~20 optional fields and a note about shared field names (e.g. `options` differs between MCQ and POLL). Discriminated union keyed by Block.type would catch shape mismatches at compile time. Data doesn't need to migrate — purely a type-level refactor.

### Tier 5 — Tech debt / known issues

**5.1 ✅ DONE — Block reader iframe sandboxing** · in BlockReader.tsx (same diff as Tier 4.5)
- *What landed:* per-type `sandbox` attribute on VIDEO, SLIDES, PDF, SIMULATION iframes. Permissions tuned per host class:
  - VIDEO (`scripts same-origin popups popups-to-escape-sandbox presentation`) — player JS + cookies, link-out to YouTube/Vimeo, HTML5 fullscreen
  - SLIDES (`scripts same-origin popups popups-to-escape-sandbox forms`) — Google Slides chrome + "save a copy" UI
  - PDF (`scripts same-origin downloads`) — browser viewer's JS + save button; no popups (a PDF should never open a new tab)
  - SIMULATION (`scripts same-origin popups popups-to-escape-sandbox forms presentation downloads`) — most permissive surface since URLs are arbitrary (PhET / Desmos / GeoGebra / random HTML widgets)
- *Notably never granted:* `allow-top-navigation` — the iframe can't navigate the parent window away from the lesson. That's the main attack vector to prevent. `allow-modals` also withheld so a compromised host can't spawn alert/confirm spam.

**5.2 ✅ DONE — Stripe webhook idempotency** · `3ac8a53`. Event-level dedup via new StripeEvent model with unique constraint on eventId; atomic insert at top of handler short-circuits replays. Operation-level guards (status checks) were already in place.

**5.3 Tighten `chosenKey` typing** · ~1 session
- Column is overloaded across attempt types. After Tier 1.2 ships, the encoding gets even denser (`"3:1"` etc). Long-term: add real `chosenIndex Int?` + `subIndex Int?` columns. Defer until analytics queries actually need structured access.

**5.4 ✅ DONE — Vitest critical-path suite** · `test/`, `vitest.config.ts`, `package.json` (`npm test` / `npm run test:watch`)
- *What landed:* Vitest 4 + 9 test files / **52 cases**, full suite in ~25-50s wall clock. Coverage:
  - `auth.signup` (4 cases) — bcrypt hash, dupe-email CONFLICT, email-lowercase, password ≥8 zod gate
  - `payment.flow` (5 cases) — createCheckoutSession → demoConfirm → Enrollment; idempotent re-confirm; already-enrolled short-circuit; free-course rejection; foreign-buyer FORBIDDEN
  - `payment.refund` (5 cases) — full PAID → REFUNDED + Enrollment drop; idempotent re-refund; cross-teacher FORBIDDEN; non-PAID rejection; ADMIN override
  - `lesson.attemptBlock` MCQ (4 cases) — correct/wrong, hintsUsed XP scaling, out-of-range rejection
  - `lesson.completeDragMatch` (5 cases) — full XP at 100%, half XP at ≥70%, 0 XP below threshold, length validation, type guard
  - `lesson.poll` (5 cases) — vote upsert, re-vote (no dupe), cross-student aggregation, anon-readable, out-of-range
  - `admin.parentLinks` (8 cases) — link by email, idempotent, lowercase normalise, unlink + idempotent, type guards, role guard, list query shape
  - `teacher.addBlock` with templateId (6 cases) — catalog uniqueness, settings seeding, type-mismatch reject, unknown-template reject, blank-block back-compat, cross-teacher FORBIDDEN
  - `computeWeakSpots` (8 cases) — pure-function smoke for the AI_QUIZ adaptive regenerate helper; empty / all-strong / single-weak / noise-floor / threshold-boundary / null + malformed chosenKey skipped / order preservation
- *Infra:* `pool: "forks"` + `fileParallelism: false` serialises DB tests; `server-only` aliased to a no-op stub so router imports work under Node; `cleanupTestUsers` pre-deletes test-owned courses (Course.author is the lone Restrict relation). Cleanup model: every test row uses email prefix `test-vitest-`; one `db.user.deleteMany({startsWith})` + cascade wipes the footprint.
- *Deferred:* DRAG_MATCH/BRANCHING completion paths' XP math could grow more cases as scoring tiers evolve.

**5.4b ✅ DONE — Playwright end-to-end smokes** · `e2e/`, `playwright.config.ts`, `npm run test:e2e` / `:e2e:ui`
- *What landed:* Playwright 1.60 + chromium-only browser. 5 spec files / **7 cases**, ~50s wall clock from cold dev-server boot. Coverage:
  - `marketplace.spec.ts` (2) — public marketplace homepage renders + login page surfaces at least one dev quick-login option
  - `auth-flow.spec.ts` (2) — dev quick-login as STUDENT writes the Auth.js JWT cookie + lands on `/student` with chrome rendered; unauthenticated `/student` hits the `proxy.ts` role gate and redirects to `/login?next=%2Fstudent`
  - `lesson-flow.spec.ts` (1) — **closes P1-41**: sign-in → open multiplying-fractions lesson → submit MCQ → "+N XP" chip renders. Walks each option in turn so it's robust to seed re-runs; logs confirm `POST /api/trpc/lesson.attemptBlock?batch=1 200` firing through the real tRPC HTTP layer.
  - `buy-flow.spec.ts` (1) — **closes the Stripe Connect demo loop**: fresh signup form → auto sign-in → open `/course/algebra-foundations` ($19) → click "Buy & start" → demoConfirm on `/demo-checkout/[orderId]` → "Pay (demo) →" → land on `/checkout/success` with `courseSlug` in URL + "You're enrolled" heading. Exercises `auth.signup` + `payment.createCheckoutSession` + `payment.demoConfirm` + Order PENDING → PAID + Enrollment creation all through the real HTTP layer.
  - `block-library.spec.ts` (1) — covers commit 6 (Tier 4.1 partial): TEACHER quick-login → builder loads → `BlockLibrary` left rail renders with "BLOCK LIBRARY" eyebrow + "STARTERS" group + at least one known template button ("4-option MCQ") + an actionable "Insert into → …" chip (proving `selectedLessonId` default-initialised). Presence-only — the click would write a real Block row that has no clean cleanup path; the mutation itself is covered by 8 vitest cases in `test/teacher.addBlock.test.ts`.
- *Why both layers:* vitest catches router/business-logic regressions in <1s but skips cookies, CSRF, Edge routing, and rendering. The 6 Playwright tests exercise exactly the boundary vitest doesn't — a regression in `auth.config.ts`, `proxy.ts`, or the JWT round-trip would slip vitest but trip e2e. And the MCQ + buy flows exercise complete user journeys (UI → mutation → award/enrollment → render) which only an e2e check can verify.
- *Cleanup model:* Playwright's `globalTeardown` (`e2e/global-teardown.ts`) wipes every `test-vitest-*` user at the end of each run — same prefix + same cascade chain as vitest's `cleanupTestUsers`. The buy-flow test's signup → User + Order + Enrollment all go away when the run ends, no matter how many specs ran. Implementation note: the teardown uses CommonJS `require()` for runtime imports because Playwright's loader treats the file as CJS (no `"type": "module"` in package.json) and trips on top-level ESM imports. Same reason it builds a fresh Prisma client off `DATABASE_URL` instead of importing the app's `@/lib/db` singleton — Playwright's loader doesn't honour the tsconfig `@/*` alias from globalTeardown context.
- *Infra:* `webServer` block auto-starts `npm run dev`; `reuseExistingServer: !CI` so iterative local runs hit the already-warm dev server. `workers: 1` + `fullyParallel: false` because tests share the dev DB and rely on the same `test-vitest-*` cleanup pattern as vitest. Chromium only — Firefox/WebKit deferred (add ~300MB for marginal coverage on our SPA-shaped surface).
- *Deferred:* cross-browser; visual-regression snapshots (Percy/Argos); DRAG_MATCH/BRANCHING/POLL flow specs (router-level vitest coverage exists; e2e adds rendering verification when the UI gets visually complex).

**5.5 ✅ DONE — AGENT_NOTES gotchas grouped by topic** · in scratchpad refresh
- *What landed:* the flat 30+ entry list under `§ New gotchas learned this session` is now `§ Gotchas (grouped)` with 14 H4 topic groups (Next.js 16, Prisma 7 + DB plumbing, Docker / Postgres on Windows, tRPC v11, tsx + dev tooling, Vitest, Auth.js v5, Stripe / Payments, Anthropic Claude SDK, Blocks system, dnd-kit, XP / Streak engine, UI / data patterns, CSV exports). Two near-duplicates (CSRF, Docker Desktop cold-boot) consolidated. Two Block entries got Tier 4.5 postscripts noting `SettingsFor<T>` + `settingsFor()` now resolve the shape-overload problem at compile time. New entry under Vitest captures the `singleFork` → `fileParallelism: false` migration and the `server-only` alias trick.
- *Deferred:* extraction to `docs/gotchas/*.md` files — the grouped inline list is searchable enough with editor folding; extract when the section grows past ~60 entries.

### Tier 6 — Stretch / Phase 5

**6.1 PWA / offline lesson reading** — ⚠ **FOUNDATION DONE 2026-05-30**. Installable PWA: `app/manifest.ts` (`/manifest.webmanifest`, standalone, ink/canvas brand colours, any+maskable SVG icon), `public/icon.svg`, layout `viewport.themeColor` + `appleWebApp` + icons (Next 16 emits the modern `mobile-web-app-capable`). Offline fallback: `public/sw.js` — a deliberately conservative service worker (same-origin GET only; **skips `/_next` + `/api`** so HMR/deploys/dynamic data are never stale; network-first navigations → cached `public/offline.html`; stale-while-revalidate for static). Registered via `src/components/pwa/ServiceWorkerRegister.tsx`, **production-only** (a SW under `next dev` serves stale chunks). **Still deferred — true offline *lesson reading*** (precaching lesson/block content + a sync strategy) is the bigger follow-up; this is the installable + offline-shell foundation only.
**6.2 i18n** — currently every string is en-US
**6.3 Skill-tree mastery flow** — ✅ **DONE 2026-05-30**. Mastery now advances from real activity: `src/server/services/skillProgress.ts` (`computeSkillStates` shared with `skill.tree` + `nudgeCurrentSkill`) bumps the student's current path skill +`MASTERY_STEP_PER_CORRECT` (0.1) on every correct attempt via `awardCorrectAttempt`; crossing 0.8 → done + next unlocks + `skill_mastered` notification. Fake "AI re-routes nightly" copy replaced with honest text + a real `/student/library` CTA. Attribution proxy = "current skill" (no Skill↔content mapping in schema yet — that mapping + per-lesson skill attribution is the future enhancement). Hooked into `awardCorrectAttempt` only (MCQ + Question quizzes); DRAG_MATCH/BRANCHING/AI_QUIZ dedicated-mutation paths don't nudge yet.
**6.4 Teacher + student discussions** — ✅ **DONE 2026-05-30**. Block-level threads (`lesson.discussionThread`/`postComment`, reader `DiscussionBody`/`CommentRow`) already shipped earlier; this pull added the rest: **moderation** (`lesson.deleteComment` — author/owner-teacher/admin, audited as `discussion.delete_comment`) + reader self-delete; the **teacher moderation hub** (`lesson.teacherDiscussions` → `TeacherDiscussionsClient`, inline Remove) replacing the `/teacher/discussions` stub; the **student community feed** (`lesson.studentCommunity` → `/student/community`) replacing that stub. Flat threads (no replies) — nested replies + pin/announce deferred. Browser-verified end-to-end across student/teacher/admin. **2026-05-31:** the teacher hub also lets the teacher **reply as the instructor** — a per-thread `ThreadComposer` posts via `lesson.postComment` (already a `protectedProcedure`, so no server change) and invalidates the feed. (Storefront pages — ✅ done 2026-05-22, `6050321`.)
**6.5 Admin pages** — people, classes, curriculum, billing, audit, integrations are all real (DB-backed). **Analytics ✅ DONE 2026-05-30** — real `admin.analytics` deep-dive: institution-scoped weekly time-series (signups / enrollments / attempts+accuracy / active learners / XP), subject + grade rollups, top-courses leaderboard, completion funnel, all with period-over-period KPI deltas; `?weeks=12|26|52` range tabs; pure-SVG charts (`AnalyticsCharts.tsx`), zero new deps, no migration. **Branding** is the lone remaining ComingSoon stub — deferred because its headline features (logo upload, sign-in background image, vanity domain) need asset storage + DNS infra that isn't wired locally; only accent-color + name would be buildable today.

### Tier 7 — Phase 6 (Launch Readiness & Growth)

The leftover work from the gap audit is now consolidated as **Phase 6** in [`BACKEND_ROADMAP.md`](./BACKEND_ROADMAP.md) (§ Phase 6 — full detail, sizes, exit criteria). Snapshot:

- **6.1 Activate built-but-dark features** (~1 session) — Resend (`lib/email.ts`) · `ANTHROPIC_API_KEY` in prod (demo fallbacks otherwise) · Stripe account activation + Connect (test charges already work) · ✅ **Mux completion webhook DONE 2026-06-02** (`/api/mux/webhook` — instant `video.asset.ready`; set `MUX_WEBHOOK_SECRET` + add the webhook in the Mux dashboard) · ✅ **signed playback DONE 2026-06-02** (paid-course videos get Mux `signed` policy + enrollment-gated `lesson.videoPlaybackToken`; **dormant until `MUX_SIGNING_KEY`/`MUX_PRIVATE_KEY` are set**). **TLS smell** = `NODE_TLS_REJECT_UNAUTHORIZED` is a **Vercel env var** (not in any file) — remove it from the prod env (task chip spawned; may be a load-bearing Postgres-SSL workaround, so redeploy + watch for cert errors).
- **6.2 Production hardening** (~1 session) — Sentry · Upstash rate-limit starting with `src/app/api/tutor/stream/route.ts` (currently unguarded) · nightly `pg_dump` + restore drill · fix the `NODE_TLS_REJECT_UNAUTHORIZED=0` prod warning. (Vercel deploy ✅ done — Tier 3.4 above is stale.)
- **6.3 Compliance** (~1–2 sessions) — ✅ **`/settings` DONE 2026-06-01** (account router + page, all roles; tutor-log opt-out honored in the stream) · ✅ **Google SSO DONE 2026-06-01 (env-gated)** — dormant until `GOOGLE_CLIENT_ID`/`SECRET` added; new Google users default STUDENT; live handshake needs a real Google client to verify. **Remaining:** Clever/ClassLink rostering SSO (role-carrying) + Email magic-link.
- **6.4 Reach & polish** (ongoing) — mobile screens + nav · `next-intl` (en/es) · true offline lesson reading (precache + attempt-sync; shell done) · ✅ **admin Branding DONE 2026-06-02** (name + accent-colour editor + `app/admin/layout.tsx` `--wf-accent` injection — **kills the last `ComingSoon` stub**; logo / sign-in bg / vanity domain still need asset storage + DNS).
- **6.5 Rich media & tooling** (ongoing) — LIVE→Zoom/Daily · SPEAK→Whisper scoring · PDF worksheet packs + admin Board report.
- **6.6 Engineering debt & deferred refactors** (opportunistic) — the Tier 4–5 carryover, now a real sub-phase: ✅ **block reorder across lessons DONE 2026-06-01** (`teacher.moveBlock` + builder Move-to-lesson select) · drag-template-from-library v2 (4.1, deferred) · `BlockSettingsShape` discriminated union (4.5, ⚠ partly mitigated by `SettingsFor<T>`) · real `chosenIndex`/`subIndex` columns (5.3, trigger = first structured-analytics query) · crons: ✅ **streak rollover DONE 2026-06-01** (`/api/cron/streak-rollover` + 2nd `vercel.json` entry) — remaining: weekly emails ⛓6.1 · nightly skill re-route · AI-insight gen ⛓6.1 (embeddings sweep already cron'd).

**6.1–6.3 gate a real launch; 6.4–6.5 are post-launch growth; 6.6 is opportunistic** (fold each item into the feature work that touches the same surface; two of its crons ride along with 6.1).

### Decision log

- **2026-05-18 — Block sub-attempts encoded in `chosenKey` string column, not a new column.** AI_QUIZ/QUIZ encode as `"subIdx:choiceIdx"`; DRAG_MATCH encodes as `"drag:N/M"`; BRANCHING as `"branch:<nodeId>"`. Trade-off: column is overloaded across 5 distinct encoding schemes now, but no migration and analytics queries don't yet need structured access. **Migration trigger:** when an analytics query asks for "% correct on question 3 of AI_QUIZ X" we add real `chosenIndex Int?` + `subIndex Int?` columns + a one-shot backfill. Tracked as Tier 5.3.
- **2026-05-18 — DRAG_MATCH and BRANCHING got their own dedicated mutations** (`completeDragMatch`, `completeBranching`), NOT a 4-shape input to `attemptBlock`. Cleaner per-shape validation; ~150 LOC of router code in 3 mutations is more readable than a 4-way dispatch with 4 different optional inputs.
- **2026-05-18 — Webhook dedup via dedicated `StripeEvent` model with `eventId @unique`.** Considered: (a) operation-level guards only (already in place — `if status === "PENDING"` etc.) or (b) atomic insert dedup. Picked (b) because: real money is involved (worth at-most-once at the event boundary, not just operation); doubles as audit trail of every webhook received; cheap (single index check). Race-safe because the insert is atomic — concurrent deliveries lose to the first one.
- **2026-05-18 — 1099 CSV route at `/api/teacher/1099` (no `.csv` in the URL).** Considered `/api/teacher/1099.csv/route.ts` for URL prettiness; Next.js handles literal dots in folder names inconsistently across versions. Filename in browser save dialog comes from `Content-Disposition` anyway, so the URL doesn't need it. Pattern to follow for future export routes.
- **2026-05-18 — Refund self-service: demo mode flips Order + drops Enrollment in `$transaction`; real-Stripe mode throws `NOT_IMPLEMENTED`.** Considered: silently use the demo flip in real mode. Rejected — would refund the buyer in our DB without actually moving money in Stripe, which is worse than throwing. Real-Stripe wiring is one Stripe API call away (`stripe.refunds.create({charge})`) but needs the charge id resolved via session → payment_intent → latest_charge. Lands with the Tier 2.2 smoke test.
- **2026-05-18 — Parent role v1: dedicated `ParentChild` join model, admin-managed linking, no self-invite token flow.** Considered: (a) `User.parentIds: String[]` — rejected because the relation is bidirectional and we want symmetric queries (parent → kids and kid → parents); (b) self-invite token where a parent signs up with `?token=…` and auto-links — rejected for v1 because it needs Resend (Tier 2.5 blocker) and an extra signup-with-token route. Picked admin-managed because schools control the parent→student mapping anyway (FERPA-adjacent: the institution decides who can see whose grades). Self-invite is queued for after Tier 2.5 ships.
- **2026-05-18 — Parent dashboard reads directly via Prisma in the server component, no tRPC route.** Considered: an `parent.children` tRPC query mirroring `admin.parentLinks`. Rejected because no client component consumes the data — extracting a router is dead code until a future client-side parent widget needs the same shape. Extract when the second consumer appears (likely the weekly-digest preview pane).
- **2026-05-20 — Course publishing via one `teacher.setCourseStatus` mutation, not a `publish`/`unpublish` pair.** A single mutation taking `status: "DRAFT" | "PUBLISHED"` handles both directions — symmetric, idempotent (re-sending the current status is a no-op write + no audit row), one ownership check. Audited with `course.publish` / `course.unpublish` kinds (the latter newly added to the closed `AuditKind` union in `audit.ts` — adding any audit event means editing that union). Considered gating publish on having ≥1 unit/lesson — rejected for v1: teachers publish incrementally and no other builder mutation gates on content completeness. Note `course.bySlug` deliberately does NOT filter by status (so the builder's "Preview as student" link works on a draft); only the marketplace surfaces (`marketplace.featured` / `search` / `aiSearch` / `recommendedFor`, teacher list) filter `status: "PUBLISHED"`.
- **2026-05-20 — Role-scoped nav lives in `MarketChrome` via a server-fed `role` prop, not client `useSession()`.** `MarketChrome` is the only chrome on public routes (`/`, `/course/*`), so it is the only one every role + anon sees — the gated chromes (Student/Teacher/Admin) cannot leak because `proxy.ts` already gates their route trees. The viewer's role is computed server-side (`auth()` in the page) and passed as a prop rather than read client-side, which avoids a loading-flash where the bar renders anon nav then pops to role nav. `ROLE_NAV` is a per-role config object kept inside `MarketChrome.tsx` (single consumer — no separate lib file).
- **2026-05-22 — Teacher storefront: public `/t/[teacherId]`; `User.headline`+`bio` only.** Storefront state for v1 is just those two columns — brand color, custom `/t/handle` URL, cover photo, pinned courses, referral codes are all deferred. The public profile is `marketplace.teacherProfile` (a `publicProcedure` — a storefront is a public marketing surface). Course renames via `teacher.updateCourse` deliberately do NOT touch the course `slug`: the slug is the permanent URL and rewriting it on rename would break student bookmarks / share links.
- **2026-05-22 — Stripe `externalId` placeholder must be unique, not a constant.** `createCheckoutSession` inserts the Order before the Stripe Checkout Session exists, so it needs a placeholder for the `@unique externalId` column (overwritten later with the real session id). A constant (`"stripe_pending"`) collides the instant a second order is pending — and one never-completed order wedges the constraint for ALL future checkouts. Use `stripe_pending_${crypto.randomUUID()}`, same shape as the demo path's `demo_${uuid}`.
- **2026-05-22 — No `apiVersion` pin on the Stripe client.** `new Stripe(key)` with no config object — the SDK uses its own default API version. A hardcoded `apiVersion` string only stays valid for the SDK build it shipped with; a stale one throws "Invalid Stripe API version" at construction.
- **2026-05-22 — `safeRedirect()` (`lib/roles.ts`) is the single source of truth for post-login destinations.** A bare `next` param loops when it's role-forbidden (`/signup` as a teacher → `/student` → proxy rejects → `/login?next=/student` → …). `safeRedirect(role, next)` honors `next` only when `canRoleAccess(role, next)` AND it's a same-site path; else → `homeForRole(role)`. Used by both auth pages + both auth form components. `canRoleAccess` mirrors the `proxy.ts` gate by hand — keep them in sync.

---

### What's now real (vs. v0 prototype)
- **DB**: Postgres 16 in Docker, port 5433, volume `lyceum_pg_data`. Prisma 7.8.0 with `@prisma/adapter-pg`.
- **Schema**: `prisma/schema.prisma` — Identity + Catalog + Skills + Progress + light Social/Commerce + Auth.js tables (Account / Session / VerificationToken).
- **Seed**: `npm run db:seed` (idempotent). 1 institution (Cedar Middle), 1 admin (`admin@cedar.test`), 5 cedar teachers + 3 marketplace teachers, 1 student (Jordan), 4 classmates, 6 courses, 3 paths, 13 skills + 18 edges, 3 badges, partial mastery, 3 enrollments, 3 notifications, 2 reviews.
- **Auth.js v5**: split config (edge-safe + full). Real **bcrypt password auth** for signed-up users; dev-quick-login (no password) gated to `NODE_ENV === "development"` + only for seeded users (those with `passwordHash: null`). JWT session with `id` + `role` claims; Prisma adapter for User/Account. `QuickLoginButton` handles CSRF via `signIn()`.
- **AI tutor streaming pattern (Phase 2)**: server uses `client.messages.stream({...})` (NOT `client.beta.messages.stream`) on Node runtime, iterates `for await (const event of stream)`, emits `content_block_delta` `.text_delta` events as NDJSON. Client uses `fetch().body.getReader()` + `TextDecoder` + manual `\n` split (NOT EventSource, since EventSource has no POST). System prompt + lesson context are both inside `system: [...]`; cache breakpoint goes on the lesson-context block (stable across turns). Adaptive thinking with `effort: 'low'` keeps the tutor snappy; raise effort for tougher pedagogy when telemetry shows we need it.
- **Payments (Phase 3 — demo + Stripe Connect)**: two-mode design driven by `STRIPE_SECRET_KEY` presence. `isStripeEnabled()` is the single switch; `src/lib/payments/stripe.ts` is a lazy dynamic-import wrapper so the `stripe` npm package is optional. Schema: `Order` (PENDING → PAID → REFUNDED, with `grossCents` / `feeCents` / `netCents` / `provider`+`externalId`) and `StripeAccount` (per-teacher Connect Express; unique on `teacherId`). Router: `payment.createCheckoutSession` (rejects free courses + already-enrolled; creates Order(PENDING) then returns Stripe URL or `/demo-checkout/[orderId]`), `payment.demoConfirm` (gated to original buyer + demo provider; flips PAID + upserts Enrollment in one tx), `payment.teacherEarnings` (lifetime + MTD aggregates + recent orders + Connect status), `payment.startConnectOnboarding` (real Stripe Express accountLinks or fabricated demo account). Webhook at `/api/stripe/webhook` handles `checkout.session.completed` + `account.updated` + signature verify. Platform fee = `STRIPE_PLATFORM_FEE_BPS` (default 1500bps = 15%); teacher net routed via `transfer_data.destination` when their Connect account is payouts-enabled. Audit row written on checkout start + completion. `EnrollPanel` routes paid courses to `createCheckoutSession`; the old "Phase 3 coming soon" hint is gone.
- **Signup flow** (`/signup`): tRPC `auth.signup` mutation creates User with bcrypt-hashed password (cost 12), then auto-signs-in via `signIn("credentials", ...)`. Validates: email format, password ≥ 8 chars, role ∈ {STUDENT, TEACHER}, no duplicate emails. ADMIN and PARENT roles are admin-provisioned (Phase 4).
- **Proxy (`src/proxy.ts`)**: role-gated. Unauthed → 307 to `/login?next=...`; wrong role → 307 to `/login?error=ForbiddenForRole`; right role → 200.
- **tRPC v11 routers**: `marketplace`, `course`, `student`, `lesson`, `skill`, `teacher`, `admin`. `protectedProcedure` enforces session; `studentProcedure`/`teacherProcedure`/`adminProcedure` enforce role. Server caller via `getServerCaller()`. Cross-teacher isolation: `teacher.course` rejects courses not owned by `ctx.user.id` (admin bypasses).
- **All 11 routes wired to DB + auth**:
  - `/` — public; featured + paths + teachers + recommended all from DB
  - `/course/[slug]` — public; full DB read; 404 on miss; reviews from DB
  - `/login` — picks any seeded user; one-click sign-in via `signIn()`
  - `/student` — STUDENT/ADMIN; dashboard reads enrollments, XP sum, streak, mastery, badges, leaderboard
  - `/student/skill-tree` — node states (done/now/unlocked/locked) computed from `Mastery` levels + prereq edges; mastery threshold = 0.8; "current" node = highest-mastery non-done
  - `/student/lesson/[lessonId]` — questions from DB; `lesson.attempt` writes `Attempt` + awards XP via `XPEvent`, session-gated
  - `/teacher` → redirects to course editor
  - `/teacher/courses/[slug]/edit` — TEACHER/ADMIN; loads owned course w/ units + lessons; cross-teacher access gives 404
  - `/teacher/courses/new` — AI generator (UI only; real outline gen lands in P2)
  - `/teacher/analytics` — KPIs from `Enrollment`/`Attempt` aggregations; funnel buckets from `progressPct` thresholds; biggest-drop auto-detected
  - `/admin` — ADMIN only; KPIs from User/Class counts; teacher activity from `User where role=TEACHER`; curricula from `Enrollment.groupBy(courseId)`; institution name from DB
- **Demo "Switch role" links removed** — sidebar now has a `SidebarUserMenu` with email + role + Sign out.
- **Still decorative (acknowledged)**: admin heatmap (Math.sin), engagement chart (Math.sin), AI insights cards (hardcoded text), AI generator outline regeneration (string-shuffle), AI tutor chat (1 canned response). All become real in Phase 2.
- **New mutations wired this session** (every marketplace CTA now does something real):
  - `path.enroll` — bulk-enrolls in every free course in a path, returns `{ enrolled, saved, firstLessonSlug }`. Paid courses in the path are deferred to Phase 3 (`saved` counts them).
  - `course.addToLibrary` — for free courses creates an Enrollment row without redirecting; for paid courses returns `{ saved: true }` placeholder until Phase 3 wishlist table lands.
  - `teacher.toggleFollow` — idempotent, writes/deletes `Follow` row; rejects self-follow.
  - `teacher.followState` / `teacher.followerCount` — read queries used by the Follow button for optimistic updates.
  - UI: `<PathEnrollButton>`, `<FollowButton>` (optimistic via tRPC utils), updated `<EnrollPanel>` for "Add to library" with success flash.
  - Verified: 7-test gauntlet — pure free path enrolls 1/saves 0; mixed path enrolls 1/saves 2 paid; follow toggles correctly; addToLibrary returns `saved: false` for free (real enrollment) or `saved: true` for paid (placeholder).

- **Earlier engine work**:
  - `services/streakEngine.ts` — UTC-day boundary, idempotent per day, milestone detection (7/14/30/60/100), auto-bonus XP & badge & notification on milestone
  - `routers/notification.ts` — list, markRead, markAllRead
  - `components/layouts/NotificationBell.tsx` — popover with unread badge, time-ago, icon-by-kind
  - `components/course/EnrollPanel.tsx` — real `course.enroll` mutation wired to button, paid-course gating, redirect on success
  - `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` + per-segment `loading.tsx`
  - `components/ui/Skeleton.tsx` — animated placeholder primitive
- **Sidebar pages built (13)** so no more dead links:
  - **Real DB-backed:** `/admin/people` (role filter chips + counts), `/admin/classes` (Class table with teacher + student counts), `/admin/curriculum` (institution-wide enrolled courses with mean progress), `/admin/billing` (real Institution.plan + seats + activeUsers), `/teacher/students` (cross-course enrolled student roster with mean completion + XP), `/student/progress` (XP/streak/level/badges header above coming-soon), `/teacher/earnings` (real earnings KPI strip above coming-soon).
  - **Coming-soon (via shared `<ComingSoon>` primitive in `components/ui/`):** `/student/community`, `/teacher/storefront`, `/teacher/discussions`, `/admin/analytics`, `/admin/branding`. `/admin/integrations` is a concrete catalog of integrations with Connect/Manage buttons.
- **Viewport width fixed**: marketplace + course detail + root loading all moved from `maxWidth: 1280` → `1600`. At 1920×1080 the marketplace content now spans the visible area instead of sitting in a 1280px column with ~600px of dead margins.
- **No more hardcoded `const FOO = [...]` arrays in `src/app/**/*.tsx`**. (Allowed: structural constants like step labels, BLOCK type metadata, role enum.)

### Phase 1 checklist diff
- [x] P1-01 Postgres via Docker
- [x] P1-02 Prisma schema (Prisma 7 — URL in `prisma.config.ts`, not schema)
- [x] P1-03 Seed (idempotent)
- [x] P1-04 Env validation (`src/lib/env.ts`)
- [x] P1-05 Auth.js v5 — split config (`auth.config.ts` edge-safe + `auth.ts` Prisma)
- [x] P1-06 Login page with dev quick-login + per-role demo accounts
- [x] P1-07 Role-gated proxy.ts (NB: Next.js 16 renamed `middleware.ts`→`proxy.ts`)
- [x] P1-08 Demo "Switch role" links removed; SidebarUserMenu with sign-out replaces them; `getDemoUser` shortcuts gone — routers use `ctx.user.id`
- [x] P1-09 tRPC v11 bootstrap with `protectedProcedure`/`studentProcedure`/`teacherProcedure`/`adminProcedure`
- [x] P1-10 TRPCProvider + SessionProvider in root layout
- [x] P1-11 marketplace router (featured/paths/teachers/recommendedFor/search)
- [x] P1-12 marketplace page on DB
- [x] P1-16 course router (bySlug/reviews/enroll)
- [x] P1-17 course detail on DB
- [x] P1-19 student router + dashboard on DB
- [x] P1-22 lesson router + attempt mutation + XP engine
- [x] P1-25 skill tree → DB (`skill.tree` query computes node state from Mastery + prereq edges)
- [x] P1-26 + P1-27 teacher course builder → DB (`teacher.course` query, cross-teacher 404 isolation)
- [x] P1-29 teacher analytics → DB (`teacher.analytics` aggregates Enrollment + Attempt; funnel buckets + biggest-drop detection)
- [x] P1-30 + P1-31 admin dashboard → DB (`admin.overview` aggregates User/Class/Enrollment/Attempt counts; institution + teacher + curricula real)
- [x] P1-18 Real enrollment flow — `<EnrollPanel>` client component calls `course.enroll` mutation, redirects to first lesson on success, surfaces `PAYMENT_REQUIRED` for paid courses
- [x] P1-21 Streak engine — `src/server/services/streakEngine.ts` bumps streak on every correct attempt (idempotent per day); awards +25 bonus XP and "hot-streak" badge on milestone days (7/14/30/60/100); writes a notification on badge earn
- [x] P1-32 Notifications panel — `notification.list` / `notification.markRead` / `notification.markAllRead` routers; `<NotificationBell>` popover with unread badge, mark-all-read action, time-ago labels, icon mapping by `kind`
- [x] P1-33/34/35 Loading + error + 404 shells — `app/{loading,error,not-found}.tsx` at root, plus per-segment `loading.tsx` for `/student`, `/course/[slug]`, `/teacher`, `/admin`. `<Skeleton>` component in `components/ui/`.
- [x] P1-13 Topic chip URL filtering — `MARKETPLACE_TOPICS` in `src/lib/marketplace.ts` (single source of truth for slug+label); `marketplace.featured.topic` input now translates via `topicWhere()` (subject match for most; OR title-`contains` for "test-prep"); page reads `?topic=`, flips active chip to `wf-chip--accent` and toggles back to `/` on second click; adds a "FILTER: <Label> ×" pill + contextual empty state when nothing matches.
- [x] P1-14 Filter popovers — reusable `Popover` + `PopoverOption` primitive in `src/components/ui/Popover.tsx` (click-outside, Esc, chip trigger, `aria-haspopup`/`aria-expanded`). `MarketplaceFilters` client component wires Grade · Subject · Price popovers into URL params (`?grade=&subject=&price=`), preserves orthogonal params (notably `topic`) on every update, toggles the active value off on second click, exposes a "CLEAR FILTERS" affordance. Format / Length / Rating chips kept as disabled placeholders (need data we don't collect yet). Section header concatenates all active dimensions: "Top picks for Grade 6 · ELA / Reading · Free".
- [x] P1-15 Header search Combobox — `HeaderSearchCombobox` client component in `src/components/marketplace/HeaderSearchCombobox.tsx`. Reuses the existing `marketplace.search` ILIKE query, 220ms debounce, ≥2-char min, top-6 results + overflow note. ARIA: role=combobox + listbox + activedescendant. Keyboard: ↑/↓ navigate, Enter goes to highlight (or first), Esc closes. Click-outside closes. `placeholderData` keeps the dropdown stable between keystrokes.
- [x] P1-28 Drag-drop builder — `@dnd-kit/{core,sortable,utilities}` installed; `teacher.reorderUnits` + `teacher.reorderLessons` + `teacher.reorderBlocks` all persist on drop. Three levels of nested DndContexts: outer (units), per-unit (lessons), per-lesson (blocks). Drag handle = the `drag` icon at every level, PointerSensor activation distance 6px. **Block CRUD + per-block inspector also on top of P1-28:** `teacher.addBlock` / `teacher.updateBlock` / `teacher.deleteBlock` mutations. Each lesson row gets a "+ block" popover (full 15-type catalog) + count badge + inline sortable block list with × delete. Clicking a block selects it (orange-bordered with accent-soft glow); right-hand inspector pane swaps from the course-scoped default to a per-block editor. Universal `label` + `notes` fields ship for every type; **type-specific fields** dispatch on `block.type` — VIDEO (url, caption), READING (markdown body), MCQ (stem + dynamic 2–6 options with single-correct radio). Row hint summarises type-specific state inline (URL host for VIDEO, "N words" for READING, "N opts · 1 ✓" for MCQ). Settings is `Json` and the editor is forward-compatible (spreads existing keys before save). `BLOCK_GROUPS` + `findBlockMeta` extracted to `src/lib/blocks.ts`. Drag-from-block-library-to-lesson is still v2 polish.
- [ ] P1-40..41 Final pass + Playwright smoke test
- [ ] P1-13 Topic chip URL filtering (basic stub written; not wired)
- [ ] P1-14 Real popovers for filter bar
- [ ] P1-15 Header search → Combobox
- [ ] P1-18 Real enrollment flow (mutation written; not wired into UI yet)
- [ ] P1-21 Streak engine (still seed-based; cron not in)
- [ ] P1-25 Skill tree → DB
- [ ] P1-26..29 Teacher (course builder + analytics) → DB
- [ ] P1-30..31 Admin → DB
- [ ] P1-32 Notifications panel
- [ ] P1-33..38 Loading/error/empty states + drop demo links
- [ ] P1-40..41 Final pass

### Gotchas (grouped)

> Add new gotchas under the matching topic group below. If none fits,
> spin up a new H4 group. Keep entries terse but complete — the goal is
> "could a future session resolve this in 30s without re-debugging?"
> When a gotcha gets resolved by a later refactor, leave the entry in
> place with a postscript pointing at the resolution; the historical
> context is useful when the resolution itself needs revisiting.

#### Next.js 16
- **Renamed `middleware.ts` → `proxy.ts`.** Same API, same `matcher` config; just the filename. `middleware.ts` still loads but logs a deprecation warning.
- **`notFound()` returns HTTP 200 (not 404) for streamed responses in dev.** Documented at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`. The not-found.tsx UI still renders and a `<meta name="robots" content="noindex">` is injected. Status is 404 in production non-streamed responses. Don't try to "fix" by throwing — this is intentional. If a true 404 status is needed in dev (e.g., for tests), set the response status manually in the page.
- **Avoid literal dots in Next.js route folder names.** `app/api/foo/bar.csv/route.ts` is flaky across Next versions — some interpret `.csv` as a file extension and serve unexpectedly. Use a dotless folder (`app/api/foo/bar/`) and set the filename in `Content-Disposition: attachment; filename="..."`. Browser save dialog uses the header, not the URL.
- **Client components must not render time / locale / browser-capability values during SSR — hydration mismatch.** A `"use client"` component renders on the server AND the browser; any value that differs between the two desyncs the trees ("server rendered HTML/text didn't match … this tree will be regenerated on the client"). Three traps, all hit + fixed here (`b913ac8`, `5c553e0`): (1) **`Date.now()` / `new Date()` in render** — including `useState(() => Date.now())`, whose initializer runs in both passes. Start the state `null`, set the real clock in a post-mount `useEffect`, render a stable placeholder until then. (2) **`toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` / `Intl.*`** — these format in the *runtime's* locale + timezone, and Node ≠ browser. Pin the locale: `toLocaleDateString("en-US", …)` (Lyceum's UI is en-US throughout). Date-only is then deterministic; date+time still drifts on timezone — render those post-mount instead. (3) **`typeof window` branches in render**, including feature detection in `useMemo` — `useMemo` runs during the SSR render, so it returns the server's `false`/`null`. Detect in a `useEffect` and store the result in state. Rule of thumb: a value that can't be identical in `node` and in `chrome` must not influence the first render. Safe without any action: values rendered only after a `useQuery` resolves (client-only), or only after a user interaction. Verify via the e2e dev-server log — a clean run has zero `hydration-mismatch` lines.

#### Prisma 7 + DB plumbing
- **Prisma client is module-cached at first import — `prisma generate` does NOT hot-reload a running dev server.** Saw this as `Unknown field 'stripeAccount' for include statement on model 'User'` at runtime even though tsc passed and the generated `node_modules/.prisma/client/schema.prisma` was current. The Node process loaded `@prisma/client` once at startup; a later regenerate doesn't replace the in-memory module. Fix: kill `next dev`, optionally `rm -rf .next/cache`, restart. Add to the schema-change checklist: (1) edit `schema.prisma` → (2) `npx prisma migrate dev --name X` (auto-runs generate) → (3) **restart `next dev`** → (4) verify.
- **Schema additions need schema + Prisma generate + DB migration — all three.** Caught this when route handler 404'd on `db.tutorSession` — the model was typed in the planned schema notes but never migrated. Same three-step every time: edit `schema.prisma` → `npx prisma generate` (no DB needed; makes types resolve) → `npx prisma migrate dev --name X` (DB needed; writes the SQL). The generate step alone is enough for tsc to pass, but runtime will still 404 without the migration.
- **Prisma 7** breaking changes vs. 6: URL goes in `prisma.config.ts`; `PrismaClient` requires an `adapter` (we use `@prisma/adapter-pg`); seed command is configured under `migrations.seed` in `prisma.config.ts`.
- **tsvector via raw SQL, not Prisma.** Prisma doesn't model `tsvector` or GIN indexes — use `prisma migrate dev --create-only`, then hand-edit the generated `migration.sql` to append `ADD COLUMN ... tsvector GENERATED ALWAYS AS (to_tsvector(...)) STORED` and `CREATE INDEX ... USING GIN`. `prisma migrate deploy` then applies it. Application code queries via `db.$queryRaw\`SELECT ... ts_rank(...) ORDER BY score DESC LIMIT 1\``.
- **`plainto_tsquery` ANDs all terms.** For natural-language questions like "how does the pizza model work", AND semantics misses chunks that contain "pizza" + "model" but not "work". The fix: tokenize the query in JS (alpha ≥3 chars), OR them with `|`, and call `to_tsquery('english', 'pizza | model | work')`. `ts_rank` then naturally rewards chunks containing more terms. Went from 1/4 → 5/5 hit rate with this change.
- **No course attempts currently linked to enrollments for analytics**: `attempts.where { lesson: { unit: { courseId } } }` works because lessons join via Unit. The Attempt model itself doesn't have an `enrollmentId`. Fine for Phase 1; if we add per-attempt cohort filtering later, consider denormalizing.
- **`Course.author` is the one User-relation without `onDelete: Cascade`.** Every other User-owned relation cascades (Enrollment, Order, Attempt, XPEvent, Streak, ParentChild, BlockVote, etc.) so wiping a User pulls everything downstream with it. `Course.author` defaults to `Restrict` — deleting a teacher mid-flight in prod is intentionally hard, but it bites test cleanup: `db.user.deleteMany({where: {email starts-with ...}})` fails with `Foreign key constraint violated on Course_authorId_fkey` if any test teacher owns a course. Fix in `test/helpers.ts:cleanupTestUsers`: delete test-owned courses (`db.course.deleteMany({where: {author: {email: starts-with ...}}})`) *before* the user delete. If you add another `User`-relation later, check its `onDelete:` — anything Restricted needs the same pre-delete step.

#### Docker / Postgres on Windows
- **Docker Desktop cold-boots in ~60–90s.** Don't trust `docker compose up -d` immediately after launching `Docker Desktop.exe`; poll for `docker ps` returning exit 0 first (we poll up to 60s).
- **Native Postgres install at `C:\Program Files\PostgreSQL\18`** is incomplete (only postgis DLLs). Use Docker.

#### tRPC v11
- **tRPC v11 + superjson**: must pass `transformer: superjson` in BOTH the server `initTRPC.create({ transformer })` and the client `httpBatchLink({ transformer })`. Easy to forget the client side.
- **`teacher.course` slug routing**: route param is named `[courseId]` for legacy reasons but actually contains the slug. We pass it through as `slug` to tRPC. Don't rename the folder mid-flight; existing links from chromes hardcode `algebra-foundations`.

#### tsx + dev tooling
- **`tsx` standalone** doesn't load `.env.local` automatically and doesn't honor TS path aliases. Use `tsx --env-file=.env.local --env-file=.env` and relative imports (`../src/lib/db`) in scripts.
- **Stale `next dev` processes survive** between Bash invocations on Windows. If a port-3000 conflict happens, kill via PowerShell:
  ```pwsh
  Get-Process node | ? { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "next" } | Stop-Process -Force
  ```
- **`Edit` with `replace_all: true` is dangerous when the same identifier serves two roles.** Hit this renaming `AiQuizQuestion → QuizQuestionCard`: the name was BOTH a type alias and a component function. `replace_all` renamed both, then the new code referenced the now-gone type name. Pattern: do narrow renames first, or split distinct identifiers up front. When renaming a component shared by two callers, give the **type** a different clean name (`QuizQuestion`) from the **component** (`QuizQuestionCard`).

#### Vitest
- **Vitest 4 removed `poolOptions.forks.singleFork`** but the typed `InlineConfig` doesn't expose any replacement, so re-adding the top-level `singleFork: true` breaks tsc. The supported replacement for "serialize DB-backed tests" is **`test.fileParallelism: false`** (top-level) + `pool: "forks"`. Files now run one at a time inside one worker process — same effect, fewer races on shared-DB cleanup.
- **`server-only` import throws under plain Node.** The npm package's default export throws `"This module cannot be imported from a Client Component module"` whenever it runs outside Next.js's `react-server` condition. Tests legitimately import server modules. Fix: alias `server-only` to a no-op stub (`test/stubs/server-only.ts` with `export {};`) via vitest's `resolve.alias`. Same trick lets tsx probes import the tRPC app router instead of going around it. The existing tsx probes intentionally went around tRPC for the same reason — until we needed proper router-level testing, the workaround was easier than the stub.

#### Playwright
- **Use a single chromium browser, not the full matrix.** `npx playwright install chromium` is ~150MB; the full install with firefox + webkit is ~450MB for marginal coverage on an SPA-shaped surface. Add the others when a real cross-browser regression bites.
- **`webServer.reuseExistingServer: !process.env.CI`** is the sweet spot. Locally, you run `npm run dev` once + iterate Playwright runs against the warm server; CI launches a fresh one per job. Without this flag, every local run cold-boots Next dev (~30-60s overhead).
- **Stripe module-not-found warnings during e2e are noise, not failures.** `src/lib/payments/stripe.ts` does `await import("stripe")` inside a try/catch — the lazy dynamic import is intentional (Stripe is optional in demo mode). Next dev warns about the unresolved import at compile time but the page renders fine. Don't try to "fix" by installing stripe just for tests; if it ever bites, the suppress is `// @ts-expect-error` already in place.
- **`workers: 1` + `fullyParallel: false` is mandatory** for our setup because tests share the dev DB. Parallel workers would race the `test-vitest-*` email-prefix cleanup. Same constraint as vitest's `fileParallelism: false` — both runners need it for the same reason.
- **Auth.js v5 dev quick-login is gated to `NODE_ENV === 'development'`.** Playwright runs against `npm run dev` so the gate is open. If we ever run e2e against a production-built server (`npm run build` + `npm start`), the quick-login buttons won't exist and the auth-flow test fails — would need an alternative path (real bcrypt sign-in with seeded password, or a test-only credentials backdoor).
- **Playwright's config loader treats `playwright.config.ts` / `globalTeardown.ts` as CommonJS** unless package.json sets `"type": "module"`. Top-level `import { x } from "..."` in those files throws `SyntaxError: Cannot use import statement outside a module` at config-load time. Fix: write the file with `import type` only at the top and use `require()` for runtime imports. Same reason `globalTeardown` can't import `@/lib/db` (the tsconfig path alias isn't resolved in this loader context) — build a fresh Prisma client off `DATABASE_URL` directly using `dotenv` to load `.env.local`.
- **`testMatch: "**/*.spec.ts"`** is required once you add non-spec `.ts` files (helpers, globalTeardown, etc.) under `testDir`. Without it Playwright scans every `.ts` in `e2e/` and tries to run the teardown as a test (silent no-op, but noise in the test count).

#### Auth.js v5
- **+ Edge runtime gotcha:** the proxy runs on Edge by default. The Prisma adapter pulls in Node's `crypto` and explodes there. **Fix:** split config into `auth.config.ts` (edge-safe, no adapter, no Credentials provider, just session callbacks) and `auth.ts` (full, with `PrismaAdapter` and `Credentials`). Proxy imports `authConfig` and calls `NextAuth(authConfig).auth` locally; everything else imports `auth` from `auth.ts`.
- **Credentials needs `session.strategy: "jwt"`.** Database sessions don't work with Credentials providers — Auth.js refuses to write a Session row. JWT is fine because we stamp `id` and `role` onto the token in the `jwt({ token, user })` callback at sign-in.
- **CSRF + form-actions:** `<form action="/api/auth/callback/credentials">` POSTs without CSRF and get rejected with `?error=MissingCSRF`. Use the client-side `signIn()` helper from `next-auth/react` instead — it fetches the CSRF token transparently. Implemented in `QuickLoginButton`. For server-side curl smoke tests, fetch `/api/auth/csrf` first and include the token + cookie jar.
- **Sign-out flow**: `/api/auth/signout` GET shows a confirm page with a "Sign out" button. Or call `signOut({ callbackUrl: "/login" })` from a client component (used in `SidebarUserMenu`).
- **Custom session shape** (adding `role`/`id`): augment in `src/types/next-auth.d.ts` (NOT `next-auth.d.ts` at project root — must live somewhere TS includes; `tsconfig.include` already has `**/*.ts`).
- **JWT user-id staleness after re-seed**: when the seed runs with `upsert`, user IDs stay stable. But if someone deletes and re-creates the User row (e.g., resetting test data), existing JWT cookies will point to a defunct id and tRPC procedures error with "user not found". Force re-sign-in or wipe the auth cookie.
- **Password auth boundary** (`src/lib/auth.ts`): the `authorize` callback has four branches:
  1. User has `passwordHash` + password submitted → bcrypt compare
  2. User has `passwordHash` + NO password submitted → reject (prevents quick-login bypass)
  3. User has no `passwordHash` + NO password + dev mode → allow (demo seed users)
  4. Anything else → reject. The "no password but real user" case is the critical one — without that check, the original quick-login would let anyone in as any registered user.
- **Seeded admin**: `admin@cedar.test` (Pat Hooper) — added in seed.ts, role ADMIN, attached to Cedar Middle. Use for admin-view smoke tests.
- **Post-login redirects go through `safeRedirect()` (`lib/roles.ts`), never a bare `next`.** A `next` the signed-in role can't reach loops forever: teacher hits `/signup` → redirect `/student` → `proxy.ts` rejects → `/login?next=/student` → redirect `next` → … `ERR_TOO_MANY_REDIRECTS`. `safeRedirect(role, next)` honors `next` only when `canRoleAccess(role, next)` and it's same-site, else → `homeForRole(role)`. Applied in `login/page.tsx`, `signup/page.tsx`, `LoginForm`, `SignupForm`.

#### Stripe / Payments
- **Stripe SDK lazy import.** `getStripe()` does `await import("stripe")` inside a `try`, returns `null` on failure — so demo mode runs without the package and callers either throw (misconfig) or fall back. `stripe` IS a real dependency now (installed 2026-05-22). The `// @ts-expect-error` that sat on the dynamic import was **removed** — once the package is installed tsc resolves the import and the directive becomes an "unused `@ts-expect-error`" *error*. ⚠️ `lib/email.ts` still carries that `@ts-expect-error` on `import("resend")`; when `resend` gets installed, remove that one too (same reason).
- **Stripe client: no `apiVersion` pin.** Construct with `new Stripe(key)` — no config object — so the SDK uses its own default API version. A hardcoded `apiVersion` string only stays valid for the SDK build it shipped with; once you `npm i` a newer SDK a stale pin throws **"Invalid Stripe API version"** at construction.
- **`Order.externalId` is `@unique` — placeholders must be unique too.** `createCheckoutSession` inserts the Order (PENDING) before the Checkout Session exists, then overwrites `externalId` with the real session id. The placeholder is `stripe_pending_${crypto.randomUUID()}`, NOT a constant — a constant collides the moment a second order is pending and one never-completed order wedges the constraint for every future checkout.
- **Stripe webhook + Edge** — same trap as Anthropic + Prisma. `stripe.webhooks.constructEvent` needs Node `crypto.timingSafeEqual`. Hard-code `export const runtime = "nodejs"` on `app/api/stripe/webhook/route.ts`.
- **Stripe webhook needs the raw request body** for signature verification. Next.js App Router gives you the raw bytes via `await req.text()` (NOT `await req.json()` — JSON parsing changes the byte stream and the HMAC fails). Do the text read once at the top.
- **`payment_intent_data.transfer_data.destination` is the gate for routing money** to the teacher's Connect account at charge time. If you forget this, the platform collects 100% and you owe the teacher manually. Guarded by `course.author.stripeAccount?.payoutsEnabled` so we only attempt the transfer when Stripe says the account is ready.
- **`client_reference_id` ↔ orderId** is the cleanest webhook ↔ DB join. Pass `order.id` as `client_reference_id` on the checkout session; webhook reads it back from `session.client_reference_id`. Metadata works too but `client_reference_id` is indexed by Stripe and shows up in their dashboard.
- **Atomic-insert dedup pattern for webhooks**: when a webhook handler has monetary side effects, dedup at the EVENT BOUNDARY (not just the operation boundary) by inserting a row with a unique constraint on the provider's event id BEFORE any side effects. P2002 (unique violation) → return 200 immediately. Race-safe because the insert is atomic — concurrent deliveries of the same event lose to the first one. Doubles as a full audit trail. Used in `/api/stripe/webhook` with the `StripeEvent` model.
- **`course.enroll` for paid courses returns `PAYMENT_REQUIRED` (HTTP 402)** until Phase 3 Stripe Connect lands. UI handles this gracefully: shows the error string in the EnrollPanel and disables the button. When wiring Stripe, replace the throw with a Stripe Checkout session creation + redirect.

#### Anthropic Claude SDK
- **Anthropic SDK + Edge** is the same trap as the Prisma adapter — uses Node `crypto`, blows up on Edge. The streaming route hard-codes `export const runtime = "nodejs"` for this reason.
- **Don't try to feed Anthropic `content_block_delta` deltas straight into the browser as SSE.** Custom NDJSON (one JSON object per line, `text/x-ndjson` content type) is simpler and works with plain `fetch` — EventSource doesn't support POST so it's not usable here. `X-Accel-Buffering: no` header keeps Nginx/Vercel from buffering chunks.
- **Anthropic structured outputs vs. Zod 4** — the SDK accepts a plain JSON-Schema object on `output_config.format.schema`. Importing `zod-to-json-schema` or `@anthropic-ai/sdk/helpers/zod` is the cleanest path, but Zod 4's internal type tree changed (`$ZodType` vs `z.ZodType`) which broke the shipped Stainless helper for us. We hand-rolled a 30-line `zodToJsonSchema` for the subset of Zod we actually use (object, array, string, number, optional, default) — it produces the exact dialect Anthropic wants (`additionalProperties: false`, `required: [...]`). Don't try to feed nested zod schemas with `.min()/.max()` string length constraints; structured outputs reject them.

#### Blocks system
- **`Block.settings.options` is shape-overloaded across block types.** MCQ stores `McqOption[]` (`{text, correct}[]`); POLL stores plain `string[]`. The router discriminates by `Block.type` and the typed Reader/Inspector components narrow per-block — but if you read `settings.options` without knowing the type, you'll crash on a missing `.correct` field. Always check `Block.type` before reading. **Update (Tier 4.5):** `lib/blocks.ts` now exports `SettingsFor<T extends BlockType>` (mapped type) + `settingsFor(type, raw)` helper that returns the narrow shape. Lesson router + BlockReader's high-value bodies have been migrated; the shape mismatch is now caught at compile time.
- **`BlockSettingsShape` is a growing union with per-type narrowing.** It has fields for 15 block types stored on the same JSON column. When adding the next type: **don't reuse a field name with a different shape across types** (POLL/MCQ both use `options` with different element shapes — this works only because router + inspector + reader all dispatch by `Block.type` first). **Update (Tier 4.5):** the discriminated `SettingsFor<T>` catalog in `lib/blocks.ts` enforces per-type shape at compile time. The wide `BlockSettingsShape` (still in `BlockInspector.tsx`) stays as a backward-compat alias for the inspector's polymorphic draft state — that's the one consumer that legitimately needs the wide shape.
- **`Attempt.chosenKey` is dual-purpose.** Legacy Question-based attempts use lettered keys (`"A"`, `"B"`, …). Block MCQ attempts use **stringified positional indices** (`"0"`, `"1"`, …) — POLL's BlockVote does the same. After Tier 1.2 added sub-attempts, the encoding extended further: AI_QUIZ/QUIZ encode as `"subIdx:choiceIdx"`, DRAG_MATCH as `"drag:N/M"`, BRANCHING as `"branch:<nodeId>"`. When you eventually need cross-attempt analytics, decide on a normalization (split into `chosenKey String?` + `chosenIndex Int?` + `subIndex Int?`, or write a view that resolves all five encodings). Tracked as Tier 5.3.
- **WebSpeech API needs feature detection on the client only** — both `window.speechSynthesis` and `window.SpeechRecognition`/`webkitSpeechRecognition` are guarded with `typeof window !== "undefined"`. Firefox lacks SpeechRecognition entirely (provide a text-input fallback); some browsers throw on `recognizer.abort()` after stop (wrap in try/catch). The recognizer instance lives in a `useMemo`-shaped ref since `useRef` would be more conventional but the ref-shaped object pattern works without an extra import. **Update (hydration sweep, `5c553e0`):** the `typeof window` feature-detect must run in a `useEffect`, NOT `useMemo` — `useMemo` executes during the SSR render and returns the server's `null`/`false`, so any render branching on it mismatches on hydration. `SpeakBody` now detects in an effect and stores the recognition ctor + TTS-availability in state (see the Next.js 16 hydration entry).
- **Time-aware components need a `setInterval` to stay fresh** — LIVE block has 3 phases (scheduled / live / ended) that flip based on `Date.now()`. Without a tick, the page can sit on "starts in 12m" forever. `setInterval(setNow(Date.now()), 30_000)` + cleanup on unmount keeps it accurate enough for class-scale events without burning re-renders. Don't use `requestAnimationFrame` — overkill, and you lose tab-throttling. **Update (hydration sweep, `5c553e0`):** `now` must START as `null`, not `Date.now()` — `useState(() => Date.now())` runs its initializer on the server too, so the first client render disagrees. The block holds a static placeholder until a post-mount effect sets the clock; the `setInterval` then keeps it ticking (see the Next.js 16 hydration entry).
- **`<input type="datetime-local">` has no timezone** — it gives "YYYY-MM-DDTHH:mm" in local time. Convert to canonical ISO with timezone at the storage seam: `new Date(localValueString).toISOString()`. Read back by decomposing into local-time components for the input. Don't try to use ISO strings directly in the input — it won't accept them.
- **Iframe `sandbox` permissions are per-type, not one-size-fits-all** (BlockReader VIDEO / SLIDES / PDF / SIMULATION). The reflex of "just use `sandbox=''` everywhere" silently breaks teacher-pasted YouTube / Google Slides embeds — both need `allow-scripts allow-same-origin` to render their chrome. Per-type tokens in BlockReader.tsx; the cross-cutting rule is **never grant `allow-top-navigation`** (an embed should never be able to pull the parent away from `/student/lesson/...`) and **never grant `allow-modals`** (cheap spam vector). Popups should use `allow-popups-to-escape-sandbox` so the new tab opens unsandboxed onto the real product page (a sandboxed YouTube tab is unusable). When adding a new media block type, copy from the type closest in trust profile — SIMULATION is the most permissive baseline.

#### dnd-kit
- **Click-to-toggle headers.** Out of the box, attaching `useSortable`'s `listeners` to the entire row swallows clicks — the unit header `<button>` stops toggling expand/collapse. Two fixes that work together: (a) attach `listeners`/`attributes` only to a separate drag-handle element (the leading `drag` icon, not the header button), and (b) set `PointerSensor({ activationConstraint: { distance: 6 } })` so a sub-6px movement registers as a click on whatever was under it, not the start of a drag. Without (b), even a clean click on a non-handle element occasionally arms the drag.
- **Nested sortable contexts.** Lessons inside an expanded unit live in their own `<DndContext>` (one per unit), not the outer units context. If they shared the outer context, dragging a lesson would compute drop targets against the entire flat ID space — which means a lesson could land "between" two units and corrupt both lists. One context per logical sortable, with a fresh `onDragEnd` closure that knows which unit's lessons it's reordering.
- **Drop targets without a sortable parent**: `useDroppable({id})` works standalone (no `SortableContext` required), pairs with `useDraggable({id})` items, and `onDragEnd(event)` gives you `active.id` + `over.id`. For pool/slot patterns (like DRAG_MATCH), encode source vs target in the id prefix (`pool-N` / `placed-N` / `slot-N`) so one dragEnd handler can route all transitions.
- **`DndContext` needs an explicit `id` or it hydration-mismatches.** Without an `id`, dnd-kit derives its internal `aria-describedby` host ids from a module-level counter that increments per context — and the count drifts between the SSR pass and the client (`DndDescribedBy-1` server vs `-2` client), so every `useSortable` element mismatches on that attribute. Pass a stable, unique `id` to every `DndContext`: `id="dnd-units"`, `id={`dnd-lessons-${unitId}`}`, `id={`dnd-blocks-${lessonId}`}`. Fixed `b913ac8`.

#### XP / Streak engine
- **Streak engine boundary**: `bumpStreak()` treats the UTC date as canonical "day". Phase 2 should pull the user's timezone (`User.timezone` column) and compute boundary per-user.

#### UI / data patterns
- **Sidebar Library link** was pointing to `/student/lesson/multiplying-fractions` — a specific lesson. Fixed to `/student/library` which lists the user's enrollments with progress meters. If you change the sidebar nav array in `StudentChrome.tsx`, double-check the href points to a real list/index page, not a deep link.
- **Marketplace enrollment-state pattern**: `course.myEnrolledIds()` returns a single `string[]` of course IDs the viewer owns (empty for anon — publicProcedure). Page-level intersection (`new Set(ids)` + `.has(course.id)` per card) avoids N+1 per-card queries. Reuse this for any list surface that needs per-row enrollment-aware UI; don't fetch enrollment status per card.
- **Per-block fresh-data updates after mutation**: POLL/DISCUSSION mutations return the fresh tallies/thread in the same shape as their corresponding query, so the client can `utils.lesson.X.setData({...}, res)` to skip a follow-up refetch. The query's `enabled` option gates fetches when settings are invalid (e.g. POLL with <2 options).

#### CSV exports
- **CSV exports need UTF-8 BOM for Excel compat.** Excel on Windows + macOS Numbers don't auto-detect UTF-8 in CSVs without the BOM (`﻿`); non-ASCII characters render as mojibake. Just prefix the response body with `"﻿"` (or the literal BOM char). The browser still saves the file fine; only Excel cares.
- **RFC-4180 CSV escaping is 4 lines worth doing** (quote any field containing `,`/`"`/`\n`/`\r`, double-up embedded quotes). Course titles like `"Algebra: Foundations, Patterns & More"` and buyer names like `"O'Brien, Patrick"` break naive `.join(",")`. Don't pull a dep for this.

---

## § Project context (one-pager)

- **What:** Lyceum, a K-12 personalized learning platform. Three audiences: students, teachers (creators), institution admins.
- **Where:** `C:\Users\maind\OneDrive\Documents\project\lyceum\` (NOT `edtech-platform/` — that's a different project at the same root).
- **Design source:** `C:\tmp\edu_design\education-platform\project\wf-*.jsx` — original wireframes. Fetched once, cached locally. The fetch URL `https://api.anthropic.com/v1/design/h/xSTLYaTRaHfb3oF6l6B8ig` is dead.
- **Brand:** "Lyceum". Serif wordmark + dark square logomark.
- **Two-color AI/gamification system:** orange `--wf-accent` (#ff5b1f) for gamification (XP, streaks, badges); purple `--wf-ai` (#6b3df5) for every AI feature. Don't mix.
- **Status:** UI prototype only. Every list/stat is hardcoded. Audit in [`BACKEND_ROADMAP.md`](./BACKEND_ROADMAP.md).

---

## § Locked decisions

These are settled. Do not revisit unless you have a strong concrete reason.

### Stack
- **Framework:** Next.js **16.2.6** (App Router, Turbopack). NOT 15. See `node_modules/next/dist/docs/` for current API — training data is stale.
- **React:** 19.2.4
- **TypeScript:** strict mode
- **Styling:** Tailwind **v4** (`@theme inline` block in `globals.css`) + design-token CSS variables (`--wf-*`) + inline styles for one-off layout. No Tailwind config file — v4 reads tokens from CSS.
- **Fonts:** Inter Tight (sans), JetBrains Mono (mono), Fraunces (serif via `--font-serif-stack`). All loaded in `app/layout.tsx` via `next/font/google`.
- **Icons:** inline SVG via `<Icon name="...">` from `src/components/wf/primitives.tsx`. 25 icon names in `IconName` union — DO NOT add lucide-react or other icon lib; extend the union instead.
- **Package manager:** **npm** (not pnpm; pnpm not installed on this machine).
- **Sandbox:** Windows; bash via Git Bash. Use forward-slashes in paths when shelling out, but absolute Windows paths in tools.

### Stack (Phase 1 — proposed, lock when starting)
- **DB:** Postgres 16. Local via Docker; cloud later (Neon recommended).
- **ORM:** **Prisma** (mature with Next.js, good DX). Drizzle was considered — rejected because Prisma's tooling pays off here.
- **Auth:** **Auth.js v5** (NextAuth) with the Prisma adapter. Clerk was considered — rejected because we need parent/student/teacher/admin roles and Clever SSO later, easier to control end-to-end.
- **API:** **tRPC v11** with TanStack Query v5. Pure Route Handlers were considered — rejected because we have one client (web) and want end-to-end types.
- **Validation:** Zod (paired with tRPC).
- **Dates:** date-fns (NOT moment, NOT dayjs).
- **AI:** Anthropic SDK (`@anthropic-ai/sdk`) — Claude Sonnet 4.7 default. Server-side only. Streaming via SSE.
- **Vector store (Phase 2):** pgvector extension on the same Postgres. NOT a separate service yet.
- **Storage:** Cloudflare R2 (S3-compatible) for files; **Mux** for video. Skip both until Phase 1.
- **Payments (Phase 3):** Stripe + Stripe Connect.

### Code conventions
- **Server Components by default.** Only add `"use client"` when actually needed (state, effects, browser APIs). Most chromes are already client because of `usePathname()` — leave them.
- **Data flow:**
  - Server components: fetch directly via `await db.x.findMany()` or by calling `trpc.x.y.fetch()` from a server-side caller.
  - Client components: `trpc.x.y.useQuery()` / `useMutation()`.
  - **Never** call Prisma from a client component.
  - **Never** put secrets in a `"use client"` file.
- **Hardcoded `const FOO = [...]` arrays in pages → migrate to `prisma/seed.ts`** as the source of truth, then replace usage with a tRPC query.
- **All mutations are tRPC mutations.** No `<form action={serverFn}>` for now — keep one pattern.
- **Per-route loaders:** if a page does multiple queries, put them in `app/.../loaders.ts` and call from the server component. Client subtrees use `useQuery`.
- **Auth check pattern:** in tRPC procedures use `protectedProcedure` (asserts session exists). Role-gated procedures: `studentProcedure`, `teacherProcedure`, `adminProcedure`, `parentProcedure`. Implement once, reuse everywhere.
- **Error handling:** tRPC throws `TRPCError({ code: 'NOT_FOUND' | 'FORBIDDEN' | ... })`. Client renders error.tsx for thrown / falls back via TanStack Query's `error`.
- **Loading states:** every dynamic route gets a `loading.tsx`. Client subtrees use Suspense + skeletons (`<Skeleton>`).
- **Empty states:** every list query renders an explicit empty card, not "0 items".
- **No `any`.** No `@ts-ignore` without an inline justification comment.
- **Don't add an emoji unless the user asks.**

### File / folder layout (target)
```
lyceum/
  src/
    app/                              # routes (already in place)
    components/
      wf/primitives.tsx               # design primitives (Icon, Btn, Card, …)
      layouts/{Student,Teacher,Admin,Market}Chrome.tsx
      ui/                             # higher-level shared (DataTable, EmptyState, Skeleton, …)
    lib/
      db.ts                           # Prisma client singleton
      auth.ts                         # Auth.js config
      env.ts                          # zod-validated process.env
      trpc/
        server.ts                     # createTRPCRouter, protectedProcedure, etc.
        client.tsx                    # <TRPCProvider>, trpc react hooks
        react.ts                      # createTRPCReact
      ai/
        claude.ts                     # Anthropic client + helpers
        prompts/
          tutor.ts
          generator.ts
          insights.ts
      utils/
        date.ts
        xp.ts                         # XP curve, level calc
    server/
      routers/
        _app.ts                       # appRouter
        course.ts
        lesson.ts
        student.ts
        teacher.ts
        admin.ts
        tutor.ts
        marketplace.ts
        notification.ts
      services/                       # cross-cutting business logic
        xpEngine.ts
        streakEngine.ts
        masteryEngine.ts
  prisma/
    schema.prisma
    seed.ts
    migrations/
  AGENT_NOTES.md                      # this file
  BACKEND_ROADMAP.md
```

---

## § Database schema (Phase 1 sketch)

Refine this when actually writing `schema.prisma`. Names are committed; types may shift.

### Identity
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  firstName     String?
  avatarUrl     String?
  role          Role      @default(STUDENT)
  institutionId String?
  institution   Institution? @relation(fields: [institutionId], references: [id])
  classId       String?       // primary class (students)
  class         Class?     @relation(fields: [classId], references: [id])
  createdAt     DateTime   @default(now())
  // auth.js relations
  accounts      Account[]
  sessions      Session[]
  // domain
  enrollments   Enrollment[]
  attempts      Attempt[]
  xpEvents      XPEvent[]
  streak        Streak?
  badges        UserBadge[]
  notifications Notification[]
  tutorSessions TutorSession[]
  consents      ConsentRecord[]
  // teacher
  authoredCourses Course[]   @relation("CourseAuthor")
  follows       Follow[]    @relation("Follower")
  followers     Follow[]    @relation("Followed")
}

enum Role { STUDENT TEACHER ADMIN PARENT }

model Institution {
  id        String  @id @default(cuid())
  name      String
  plan      String  @default("FREE")
  seats     Int     @default(0)
  users     User[]
  classes   Class[]
}

model Class {
  id            String @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String   // "6B"
  teacherId     String
  students      User[]
  // ...
}
```

### Catalog
```prisma
model Course {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  tagline     String?
  description String   @db.Text
  thumbnailUrl String?
  authorId    String
  author      User     @relation("CourseAuthor", fields: [authorId], references: [id])
  subject     String   // "math"
  grade       String   // "6"
  status      CourseStatus @default(DRAFT)
  price       Int      @default(0)   // cents; 0 = free
  rating      Float?
  ratingCount Int      @default(0)
  enrollCount Int      @default(0)
  units       Unit[]
  reviews     Review[]
  enrollments Enrollment[]
  paths       PathCourse[]
  publishedAt DateTime?
  updatedAt   DateTime @updatedAt
}

enum CourseStatus { DRAFT PUBLISHED ARCHIVED }

model Unit {
  id        String  @id @default(cuid())
  courseId  String
  course    Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  order     Int
  title     String
  subtitle  String?
  lessons   Lesson[]
}

model Lesson {
  id            String @id @default(cuid())
  unitId        String
  unit          Unit   @relation(fields: [unitId], references: [id], onDelete: Cascade)
  order         Int
  title         String
  durationMin   Int?
  isPreview     Boolean @default(false)
  videoUrl      String?
  blocks        Block[]
  questions     Question[]
  attempts      Attempt[]
}

model Block {
  id        String  @id @default(cuid())
  lessonId  String
  lesson    Lesson  @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  order     Int
  type      BlockType   // VIDEO READING SLIDES PDF QUIZ MCQ SPEAK AI_QUIZ SIM BRANCHING DRAG POLL DISCUSSION LIVE
  settings  Json
}

enum BlockType { VIDEO READING SLIDES PDF QUIZ MCQ SPEAK AI_QUIZ SIMULATION BRANCHING DRAG_MATCH POLL SECTION DISCUSSION LIVE }

model Question {
  id        String   @id @default(cuid())
  lessonId  String
  lesson    Lesson   @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  order     Int
  stem      String   @db.Text
  difficulty Int     @default(2)   // 1-5
  answers   Json     // [{ key, text, correct }]
  hints     Json?    // string[]
  attempts  Attempt[]
}
```

### Progress
```prisma
model Enrollment {
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  courseId  String
  course    Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  enrolledAt DateTime @default(now())
  lastActivityAt DateTime?
  completed Boolean @default(false)
  @@unique([userId, courseId])
}

model Attempt {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  questionId  String
  question    Question @relation(fields: [questionId], references: [id])
  lessonId    String
  lesson      Lesson   @relation(fields: [lessonId], references: [id])
  chosenKey   String?
  correct     Boolean
  hintsUsed   Int      @default(0)
  timeMs      Int
  createdAt   DateTime @default(now())
}

model XPEvent {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  points    Int
  source    String   // "quiz_correct", "lesson_complete", "streak_bonus", ...
  refId     String?  // lesson/question/etc
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
}

model Streak {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id])
  current   Int      @default(0)
  longest   Int      @default(0)
  lastDay   DateTime?
}

model Badge {
  id    String  @id @default(cuid())
  slug  String  @unique  // "hot_streak"
  name  String
  icon  String  // wf icon name
  rule  Json    // { type: "streak", days: 7 }
  users UserBadge[]
}

model UserBadge {
  userId  String
  user    User  @relation(fields: [userId], references: [id])
  badgeId String
  badge   Badge @relation(fields: [badgeId], references: [id])
  earnedAt DateTime @default(now())
  @@id([userId, badgeId])
}

model Mastery {
  userId  String
  user    User    @relation(fields: [userId], references: [id])
  skillId String
  level   Float   // 0-1; Bayesian estimate
  updatedAt DateTime @updatedAt
  @@id([userId, skillId])
}
```

### Social / commerce / safety
```prisma
model Path { id String @id @default(cuid()); slug String @unique; title String; courses PathCourse[] }
model PathCourse { pathId String; courseId String; order Int; @@id([pathId, courseId]) }

model Review { id String @id @default(cuid()); userId String; courseId String; rating Int; body String; createdAt DateTime @default(now()) }
model Follow { followerId String; followedId String; createdAt DateTime @default(now()); @@id([followerId, followedId]) }

model Notification { id String @id @default(cuid()); userId String; kind String; title String; body String?; href String?; readAt DateTime?; createdAt DateTime @default(now()) }

model TutorSession { id String @id @default(cuid()); userId String; lessonId String?; createdAt DateTime @default(now()); messages TutorMessage[] }
model TutorMessage { id String @id @default(cuid()); sessionId String; role String; content String @db.Text; citations Json?; createdAt DateTime @default(now()) }

model ConsentRecord { id String @id @default(cuid()); userId String; kind String; granted Boolean; grantedAt DateTime; signerEmail String? }
model AuditLog { id String @id @default(cuid()); actorId String?; kind String; payload Json; createdAt DateTime @default(now()); @@index([kind, createdAt]) }
```

---

## § Environment variables (lock when needed)

```
# .env.local
DATABASE_URL=postgresql://lyceum:lyceum@localhost:5432/lyceum
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ANTHROPIC_API_KEY=
# later
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
RESEND_API_KEY=
```

Validate via `src/lib/env.ts` with `zod`. **Never** read `process.env.X` directly outside that file.

---

## § Phase 1 checklist — "Make it real" (4-6 wk)

Granular tasks. Tick as completed. Each has: file targets · acceptance · gotchas.

### Setup
- [ ] **P1-01** Add Postgres locally (Docker compose).
  - File: `docker-compose.yml` (new)
  - Acceptance: `psql` connects; `DATABASE_URL` in `.env.local`
  - Gotcha: pick port 5433 (not 5432) so it doesn't fight any existing pg.

- [ ] **P1-02** Install Prisma + initial schema.
  - `npm i prisma @prisma/client && npx prisma init`
  - Files: `prisma/schema.prisma`, `src/lib/db.ts`
  - Schema scope: only the **Identity + Catalog + Progress** models above (not the social/commerce yet).
  - Acceptance: `npx prisma migrate dev --name init` succeeds; `db.user.findMany()` works in a script.
  - Gotcha: Prisma client singleton pattern needed for Next.js HMR — global `globalThis.prisma`.

- [ ] **P1-03** Seed script.
  - File: `prisma/seed.ts`
  - Migrate every hardcoded array currently in `src/app/page.tsx`, `src/app/course/[slug]/page.tsx`, `src/app/student/page.tsx`, `src/app/student/lesson/[lessonId]/page.tsx`, `src/app/student/skill-tree/page.tsx`, `src/app/teacher/courses/[courseId]/edit/page.tsx`, `src/app/teacher/courses/new/page.tsx`, `src/app/teacher/analytics/page.tsx`, `src/app/admin/page.tsx`.
  - Specifically migrate: `FEATURED`, `PATHS`, `TEACHERS`, `RECOMMENDATIONS`, `COURSES` (4 hardcoded slug entries with their full units/lessons/learn/aiHint).
  - Add: 1 institution "Cedar Middle", 5 teachers, 1 student "Jordan Riley", 1 class "6B".
  - Acceptance: `npx prisma db seed` produces 4 courses + 24 units + ~38 lessons + 1 student + 5 teachers.
  - Gotcha: keep the same slugs (`fractions-decimals-percents`, `algebra-foundations`, etc.) so existing routes don't break during the migration.

- [ ] **P1-04** Env validation.
  - File: `src/lib/env.ts`
  - `import { z } from "zod"; export const env = z.object({...}).parse(process.env);`
  - Acceptance: importing `env` from anywhere gives typed access.

### Auth
- [ ] **P1-05** Auth.js v5 with Prisma adapter.
  - `npm i next-auth@beta @auth/prisma-adapter`
  - Files: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
  - Providers: Email magic link (Resend) **+** Google OAuth.
  - Acceptance: `/login` page shows providers; magic link works in dev (logs to console); session cookie set; `auth()` server-side returns user.
  - Gotcha: Auth.js v5 syntax differs from v4 — read `node_modules/next-auth/README.md` not training data.

- [ ] **P1-06** Login/signup pages.
  - Files: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`
  - Use `<MarketChrome>` minus the marketplace-specific bits, OR a dedicated `(auth)` layout.
  - Acceptance: can sign up, get magic link, become a session. Role on signup defaults STUDENT.

- [ ] **P1-07** Role-gated middleware.
  - File: `src/middleware.ts`
  - Rule: `/student/*` requires session; `/teacher/*` requires role TEACHER/ADMIN; `/admin/*` requires role ADMIN.
  - Acceptance: signed-out user hitting `/student` redirects to `/login?next=/student`. Student hitting `/admin` gets 403.
  - Gotcha: middleware can't import Prisma. Read role from JWT claim, not DB.

- [ ] **P1-08** Replace fake "Switch role ↗" links with real role check.
  - Files: `src/components/layouts/{Student,Teacher,Admin}Chrome.tsx`
  - Behaviour: only show the link if user has that role; admin sees all; demo students don't see "Admin view".
  - Acceptance: a STUDENT account doesn't see admin/teacher links.

### tRPC
- [ ] **P1-09** Bootstrap tRPC v11.
  - `npm i @trpc/server @trpc/client @trpc/react-query @tanstack/react-query zod superjson`
  - Files: `src/lib/trpc/server.ts`, `src/lib/trpc/react.ts`, `src/lib/trpc/client.tsx`, `src/server/routers/_app.ts`, `src/app/api/trpc/[trpc]/route.ts`
  - Procedures to define: `publicProcedure`, `protectedProcedure`, `studentProcedure`, `teacherProcedure`, `adminProcedure`.
  - Acceptance: a sample `appRouter.healthcheck` returns "ok" via `trpc.healthcheck.useQuery()` in a client component.
  - Gotcha: superjson transformer is non-default in v11; configure on both server & client to round-trip Dates / Decimals.

- [ ] **P1-10** Wrap root layout with `<TRPCProvider>`.
  - File: `src/app/layout.tsx`
  - Acceptance: hooks work in any client component.

### Marketplace wiring
- [ ] **P1-11** `marketplace.ts` router.
  - Endpoints:
    - `marketplace.featured(input: { grade, subject, limit })` → courses
    - `marketplace.paths()` → multi-course paths
    - `marketplace.teachers(input: { limit })` → top teachers
    - `marketplace.recommendedFor(input: { userId? })` → 3 items (uses Phase-1 stub: just returns next-up enrolled lessons)
    - `marketplace.search(input: { q })` → simple `ILIKE` for now; pgvector in Phase 2
  - Acceptance: each returns seeded data shaped exactly like the existing hardcoded arrays.

- [ ] **P1-12** Replace `FEATURED`, `PATHS`, `TEACHERS`, `RECOMMENDATIONS` consts in `src/app/page.tsx`.
  - Strategy: convert page.tsx into a server component (drop top-level `"use client"`), do parallel `await trpc.x.fetch()`, pass to client subcomponents that need interactivity (the AI search input).
  - Move state-bearing pieces to a child `<MarketplaceSearch />` client component.
  - Acceptance: page renders identically; killing the seed script empties the listings.

- [ ] **P1-13** Topic chip filtering.
  - URL: `/?topic=stem` → server component reads `searchParams`, passes to `marketplace.featured`.
  - Acceptance: chip click navigates with topic param; page filters.

- [ ] **P1-14** Filter bar real popovers.
  - File: new `src/components/ui/Filter.tsx` using `cmdk` or `@radix-ui/react-popover`.
  - Acceptance: Grade/Subject/Format/Price/Length/Rating each filter results.

- [ ] **P1-15** Header search becomes a Combobox.
  - Hits `marketplace.search` with debounce.

### Course detail wiring
- [ ] **P1-16** `course.ts` router.
  - `course.bySlug(slug)`, `course.curriculum(courseId)`, `course.reviews(courseId)`, `course.enroll(courseId)`.
  - Acceptance: all 4 seeded courses load real data; unknown slug → 404 (use Next's `notFound()`).

- [ ] **P1-17** Replace `COURSES` const in `src/app/course/[slug]/page.tsx`.
  - Convert to async server component; `const course = await trpc.course.bySlug.fetch({ slug })`. Curriculum unit open/close becomes a small client child.
  - Acceptance: identical render; 404 on bogus slug.

- [ ] **P1-18** Enrollment flow (free courses only this phase).
  - `course.enroll` mutation: insert `Enrollment` if not exists; redirect to `/student/lesson/[firstLesson]`.
  - Acceptance: clicking "Enroll & start" creates a row, redirects, lesson loads, "Continue learning" on dashboard now shows that course.

### Student dashboard wiring
- [ ] **P1-19** `student.ts` router.
  - `student.dashboard()` returns: greeting (name, date in user TZ), continue (last 3 enrollments), todaysPlan, skillMastery, dueThisWeek, weekStreak, xpStats, leaderboard, badges.
  - Acceptance: all panels populate.

- [ ] **P1-20** Replace hardcoded arrays in `src/app/student/page.tsx`.
  - Same pattern: server component for fetching, client subcomponents for interactive bits (AI Tutor card input, plan "Start" button).
  - Acceptance: refresh persists "Start" plan-row state.

- [ ] **P1-21** XP / streak engine.
  - File: `src/server/services/xpEngine.ts`, `streakEngine.ts`
  - Awarded on: correct quiz answer (+20), lesson complete (+50 - hintsUsed*5), streak day (+25 bonus on day 7/14/30).
  - Streak: write last-active day on any lesson activity; cron rolls over at midnight.
  - Acceptance: completing a quiz visibly bumps the XP chip via TanStack Query invalidation.

### Lesson wiring
- [ ] **P1-22** `lesson.ts` router.
  - `lesson.byId(id)`, `lesson.start(id)`, `lesson.attempt({ questionId, chosenKey, hintsUsed, timeMs })`, `lesson.complete(id)`, `lesson.toc(lessonId)`.
  - Acceptance: attempt records correct/wrong; complete advances next lesson.

- [ ] **P1-23** Replace `LESSONS` and `STEPS` const in `src/app/student/lesson/[lessonId]/page.tsx`.
  - TOC steps now real lesson steps from DB. "Next question" loads next from server.
  - Pizza pie still a static visual aid for Phase 1 (real drag = Phase 2).
  - Acceptance: completion + XP toast + dashboard updates.

- [ ] **P1-24** Hardening: enrollment gating.
  - Lesson route 403s if user not enrolled in course (or lesson `isPreview=true`).

### Skill tree wiring
- [ ] **P1-25** `skill.ts` router + `Skill`, `SkillEdge`, `Mastery` tables.
  - Returns nodes with computed user state (done/now/unlocked/locked) based on prerequisites.
  - For Phase 1, mastery = simple completion (>= 80% accuracy on questions for that skill).
  - Acceptance: completing a lesson advances the tree visibly.

### Teacher
- [ ] **P1-26** `teacher.ts` router.
  - `teacher.myCourses()`, `teacher.course(id)`, `teacher.upsertUnit`, `teacher.upsertLesson`, `teacher.upsertBlock`, `teacher.publish(courseId)`, `teacher.analytics({ courseId?, range })`.
  - Acceptance: editing a course persists to DB; publishing flips status; analytics returns real counts.

- [ ] **P1-27** Course builder real persistence + autosave.
  - File: `src/app/teacher/courses/[courseId]/edit/page.tsx`
  - Replace `COURSES` const with query. Toggle changes call `teacher.upsertBlock` debounced 800ms. Header "Saved 14s ago" reads from a save-status atom.
  - Acceptance: refresh keeps changes.

- [ ] **P1-28** Drag-drop with `@dnd-kit/core`.
  - Reorder units, reorder lessons within a unit, drop blocks from library into a unit.
  - Acceptance: order persists.

- [ ] **P1-29** Teacher analytics page real data.
  - Replace KPI strip, line chart, funnel, course performance with real aggregate queries.
  - "Export CSV" → server route streams CSV.
  - Acceptance: numbers move when seed adds new attempts.

### Admin
- [ ] **P1-30** `admin.ts` router.
  - `admin.kpis(institutionId, term)`, `admin.heatmap(...)`, `admin.teachers(...)`, `admin.curricula(...)`, `admin.compliance(...)`, `admin.invite(email, role, classIds)`.
  - Acceptance: KPIs reflect seed; heatmap from `Mastery` table; "Invite teacher" sends real email.

- [ ] **P1-31** Replace hardcoded arrays in `src/app/admin/page.tsx`.

### Notifications
- [ ] **P1-32** Bell panel with real notifications.
  - `notification.list({ limit, unreadOnly })`, `notification.markRead`.
  - Add seed: 3 sample notifications.
  - Acceptance: bell shows red dot when unread; click opens panel; mark-as-read removes dot.

### Cross-cutting
- [ ] **P1-33** `loading.tsx` for every dynamic route. Skeleton screens matching layout.
- [ ] **P1-34** `error.tsx` and `not-found.tsx` at root + per route as needed.
- [ ] **P1-35** Empty states component + use everywhere a list could be empty.
- [ ] **P1-36** Replace `Date.now()`-based hardcoded "Tuesday · May 8" in dashboard with real date.
- [ ] **P1-37** Avatar initials → real avatar URL or fallback to initials helper.
- [ ] **P1-38** Drop "Switch role ↗" demo links once auth is live.
- [ ] **P1-39** Add `next/image` for any future real thumbnails (don't add now if no images).
- [ ] **P1-40** TypeScript strict pass: `npx tsc --noEmit` clean.
- [x] **P1-41** Playwright smoke test for auth → open lesson → submit MCQ → see XP rise. Lands in `e2e/lesson-flow.spec.ts` as part of the Tier 5.4b Playwright suite — uses dev quick-login + walks each MCQ option until one earns XP, asserting the green "+N XP" chip + "✓ Correct" feedback. (Enrollment isn't exercised — the seeded student is already enrolled in multiplying-fractions; the buy-flow spec is deferred to its own session.)

### Phase 1 done criteria
- A new user can sign up, get magic link, land on `/student`, browse `/`, click a course, enroll, complete a quiz, see XP increase, see streak start, see "Continue learning" populate.
- A teacher can edit their course, reorder units, publish, see analytics with real numbers.
- An admin can see KPIs from real seed, click into a class.
- Zero hardcoded `const ARRAY = [...]` in `src/app/**/*.tsx`. (Allowed: structural constants like `STEPS` shape definitions, BLOCK type metadata.)
- `npx tsc --noEmit` clean. `npm run build` succeeds.

---

## § Phase 2 checklist — "AI everywhere" (3-4 wk)

- [x] **P2-01** Anthropic SDK wrapper — `src/lib/ai/claude.ts`. Lazy-init, returns `null` when no key so fallback path can branch. Default model = `claude-opus-4-7` (per claude-api skill).
- [x] **P2-02** Tutor chat — `src/app/api/tutor/stream/route.ts` (Node runtime). NDJSON stream of `{type:'start'|'delta'|'cite'|'done'|'error'}` events. Uses `client.messages.stream({...})` with `thinking: {type:'adaptive', display:'summarized'}`, `effort: 'low'`, `cache_control: ephemeral` on the lesson context block (system prompt + lesson stem cached → ~90% cheaper from turn 2 onward). Persists user message before streaming starts; assistant message after final event. Graceful demo fallback (keyword-matched canned text streamed token-by-token) when `ANTHROPIC_API_KEY` is unset — clearly labels itself "demo tutor" in the output.
- [x] **P2-05** AI course generator — `src/server/routers/generator.ts` + `src/lib/ai/prompts/courseGenerator.ts`. Three mutations: `outline` (brief + settings → structured outline), `regenerateUnit` (swap one unit while keeping neighbors), `saveAsCourse` (write Course + Units + Lessons rows). Uses Anthropic's structured outputs (`output_config.format` with a `json_schema` produced by a small hand-rolled `zodToJsonSchema`). Demo fallback returns a real outline shape; settings panel + brief textarea are editable on `/teacher/courses/new`. Save creates DRAFT course owned by signed-in teacher and routes to the editor.
- [x] **P2-08** AI marketplace search — `marketplace.aiSearch` mutation. Public (anyone can search). Takes a free-form learning goal + uses top-40 published courses as the catalog → returns `{summary, estTimeLabel, items: [{kind, slug?, title, why}]}`. Hero search input on `/` calls it; results render inline below the input as a numbered curated path of course/lesson/tip cards. Each item links to its course/lesson page. Soft-degrades to keyword scoring + tip fallback when the AI call fails or no `ANTHROPIC_API_KEY` is set.
- [x] **P2-09** Remaining AI buttons wired —
  - **`skill.whyThisPath`** explains the personalized path in 2-3 sentences referencing the student's mastery count + current focus + recent accuracy. Rendered as a `<Card>` popover next to the "Why this path?" button on `/student/skill-tree`.
  - **`teacher.suggestFix({ stuckLabel, dropPct })`** returns 2-3 single-sentence remediation ideas for a drop-off point. PATTERN insight card on `/teacher/analytics` calls it and renders the bulleted list inline.
  - **`teacher.sendNudge({ atRiskCount, daysSilent })`** drafts a re-engagement email (subject + body, `{{firstName}}` placeholder). AT-RISK insight card shows the draft inline with a disabled "Send (Phase 4)" button.
  - **`generator.generateQuestions({ lessonId, count })`** — teacher-only, owner-gated. Sanity-filters AI output to enforce exactly-one-correct. Inspector UI on the course builder picks a lesson + count.
- [x] **P2-12** Audit log — `AuditLog` model (append-only, kind+actor+payload JSON, lessonId/courseId pointers, `redactedAt` for retention). `audit({ kind, payload, ... })` helper in `src/lib/audit.ts` sanitizes secret-looking keys and truncates strings >4000 chars. Hooked into every AI mutation (`ai.tutor`, `ai.course_outline`, `ai.regenerate_unit`, `ai.generate_questions`, `ai.marketplace_search`, `ai.why_path`, `ai.suggest_fix`, `ai.send_nudge`). New `/admin/audit` page lists the last 100 events with kind filters in the sidebar. Admin sidebar gained an "Audit log" nav item. The admin compliance card's "AI tutor logging Enabled" line is now actually true.
- [x] **P2-11** Rate limiting — `src/lib/rateLimit.ts` exports `checkAIQuota({ actorId })` (throws `TRPCError.TOO_MANY_REQUESTS`) and a `checkAIQuotaSoft` variant for non-tRPC routes like `/api/tutor/stream` (returns `{ ok, message }`). Tiered: **per-actor 10/min · 60/hr · 300/day**, **anonymous 4/min · 30/hr · 100/day**. Uses the AuditLog table itself as the counter store (rolling window via `COUNT(*) WHERE createdAt > now() - interval`) so we don't need Redis/Upstash. Hooked at the **start** of every AI mutation so denied calls *don't* write to the audit table (this matters — otherwise an attacker could artificially inflate someone else's quota by spamming their actor). The tutor stream route returns `HTTP 429` with `Retry-After: 60` header.
- [x] **P2-03 / P2-04** Citation retrieval — `LessonChunk` table (id, lessonId, page, section?, content) + a Postgres `tsvector` `searchable` generated column with a GIN index added via raw SQL in the migration (Prisma can't model tsvector natively). `src/lib/ai/citations.ts` exports `findCitation({ query, lessonId })` which tokenizes the user's question into ≥3-char alpha lexemes and runs an OR-joined `to_tsquery` ranked by `ts_rank` against the GIN index. **5-of-5 hit rate** in the smoke test — each natural-language question routes to its semantically-correct chunk. Tutor stream replaces the hardcoded `p. 142` with the real page + section, persists the structured citation on the `TutorMessage` row, and logs `citationMatched + citationPage + citationScore` to `AuditLog`. Demo seed = 15 chunks across the 3 hardcoded lesson slugs (`npm run db:seed-chunks`). pgvector + dense embeddings (e.g., Voyage AI) can swap in behind the same `findCitation` signature in P3+ without changing any caller.
- [x] **P2-07** AI insight generation (on-demand, 24-hour DB cache). New `Insight` model with `audience` ("teacher"/"admin") + `scope` ("TEACHER:<userId>" / "ADMIN:<institutionId>") + `kind` (PATTERN/OPPORTUNITY/AT_RISK for teachers; STRENGTH/WATCH/TEACHER for admins) + `expiresAt`. Two tRPC procedures: **`insight.forTeacher` / `insight.forAdmin`** (read-only, returns the freshest cached batch or `null`); **`insight.regenerateTeacher` / `insight.regenerateAdmin`** (gathers real stats, calls Claude with structured outputs, replaces cache atomically in a transaction). Real demo fallbacks that compose insights from the same stat inputs. Teacher analytics + admin overview now read these — first visit auto-generates, "↻ Refresh" button is always available. Caches are invalidated atomically per scope on regenerate, so a teacher can't see stale rows mid-update. Real cron driver = future Phase 4 work; the surface area is now ready for it (just call `insight.regenerateTeacher` for each TEACHER row nightly).
- [ ] **P2-03** pgvector setup; index lesson content for citations.
- [ ] **P2-04** Tutor citation tool — Claude tool-use returns real `Cited: course, unit, page`.
- [ ] **P2-05** AI course generator: prompt → outline → save.
- [ ] **P2-06** Per-item ✦ regenerate (real, not " (rev)" suffix).
- [ ] **P2-07** AI insights nightly cron for teacher analytics + admin dashboard.
- [ ] **P2-08** AI search on marketplace: semantic search returning a curated path.
- [ ] **P2-09** "Why this path?" / "Hint from AI" / "Generate 5 more questions".
- [ ] **P2-10** Skill tree nightly re-routing job.
- [ ] **P2-11** Rate limiting per user (Upstash) + cost cap.
- [ ] **P2-12** Audit log every tutor message (FERPA promise).

## § Phase 3 — Creator economy (2-3 wk)
- [ ] Stripe Connect onboarding for teachers.
- [ ] Paid course checkout (Stripe Checkout).
- [ ] Reviews, follows, storefronts.
- [ ] Webhook for `payment_intent.succeeded`.
- [ ] Earnings dashboard at `/teacher/earnings`.

## § Phase 4 — Institution (2-3 wk)
- [ ] Admin sub-pages (people, curriculum, classes, integrations, billing) all real.
- [ ] Clever / ClassLink SSO.
- [ ] Board report PDF generation.
- [ ] Consent records, audit log, retention cron.

## § Phase 5 — Mobile + polish (ongoing)
- [ ] Implement `StudentDashboardMobile`, `LessonMobile`, `MarketplaceMobile` from `wf-student.jsx` and `wf-marketplace.jsx`.
- [ ] Service-worker offline mode.
- [ ] Speech recognition for "Speak" blocks.
- [ ] Discussions, live sessions.
- [ ] Parent portal.
- [ ] i18n (en/es/fr).

---

## § Common patterns — copy-paste reference

### Prisma client singleton
```ts
// src/lib/db.ts
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

### tRPC server skeleton
```ts
// src/lib/trpc/server.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const createContext = async () => ({ db, session: await auth() });
const t = initTRPC.context<typeof createContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});
export const teacherProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "TEACHER" && ctx.user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
// ...studentProcedure, adminProcedure, parentProcedure same shape
```

### Server-side loader from a server component
```tsx
// src/app/page.tsx (server component)
import { createCaller } from "@/server/routers/_app";
import { createContext } from "@/lib/trpc/server";
export default async function Page() {
  const trpc = createCaller(await createContext());
  const [featured, paths, teachers] = await Promise.all([
    trpc.marketplace.featured({ grade: "6", subject: "math", limit: 4 }),
    trpc.marketplace.paths(),
    trpc.marketplace.teachers({ limit: 4 }),
  ]);
  return <MarketplaceClient featured={featured} paths={paths} teachers={teachers} />;
}
```

### Mutation with optimistic invalidate
```tsx
"use client";
const utils = trpc.useUtils();
const enroll = trpc.course.enroll.useMutation({
  onSuccess: async (_, { courseId }) => {
    await utils.student.dashboard.invalidate();
    router.push(`/student/lesson/${firstLessonId}`);
  },
});
```

---

## § Gotchas (DO NOT FORGET)

1. **Next.js 16, not 15.** AGENTS.md in this repo's root says: "this version has breaking changes — read the relevant guide in `node_modules/next/dist/docs/` before writing any code." Specifics that have already bitten me:
   - `params` is `Promise<{ slug: string }>` — must `await` (or `use(params)` in client components).
   - `searchParams` is also a Promise.
   - `PageProps<'/route/[slug]'>` and `LayoutProps<'/route'>` are now globally available helpers (no import).
   - Defaults: dev runs Turbopack.

2. **Tailwind v4, not v3.** No `tailwind.config.ts`. Theme tokens are in `globals.css` under `@theme inline { --color-x: ... }`. Don't try to add a config file.

3. **Inline styles vs. utility classes.** Existing code uses inline `style={{...}}` heavily for layout (matches the wireframe's pixel-precise design). Don't refactor to Tailwind utilities — keep the same pattern for new code unless adding genuinely shared widgets, which go into `components/ui/` as `.wf-*` CSS classes.

4. **Two-color AI/gamification system.** Orange = gamification, purple = AI. Never mix. When adding a new feature, decide which bucket and use the corresponding token.

5. **Don't recreate primitives.** Anything you'd want from a UI lib (button/card/icon/avatar/meter) is already in `src/components/wf/primitives.tsx`. Add icon names to the union; don't `npm i lucide-react`.

6. **Test routes after every change** with the smoke loop:
   ```bash
   for url in "/" "/student" "/student/skill-tree" "/student/lesson/multiplying-fractions" "/course/algebra-foundations" "/teacher/courses/algebra-foundations/edit" "/teacher/courses/new" "/teacher/analytics" "/admin"; do
     status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$url")
     echo "$status $url"
   done
   ```

7. **Two color modes claimed in scaffold but only light implemented.** Don't promise dark mode until a separate explicit task.

8. **Mobile screens documented but NOT built.** `StudentDashboardMobile`, `LessonMobile`, `MarketplaceMobile` exist in `wf-*.jsx` source — defer to Phase 5.

9. **The 4 hardcoded course slugs are referenced by the rest of the app.** Don't rename them during seeding (`fractions-decimals-percents`, `algebra-foundations`, `geometry-origami`, `math-olympiad-prep`).

10. **The 3 hardcoded lesson slugs similarly.** (`multiplying-fractions`, `water-cycle`, `bridge-to-terabithia`).

11. **Seed must be idempotent.** Use `upsert` in `prisma/seed.ts` so re-running doesn't duplicate.

12. **Auth.js v5 API differs from v4** — use the docs in node_modules.

13. **Don't add a service unprompted.** Mux, R2, Stripe, Resend each cost money & require keys. Implement scaffolds, but only enable behind env flags & explicit user OK.

14. **`mem0` MCP exists at project scope** for cross-session memory. Useful for storing decisions like "we picked Prisma over Drizzle" so a future session doesn't relitigate.

15. **`mcp__plugin_claude-mem_mcp-search`** has all prior session observations. If resuming and confused, run `mcp__plugin_claude-mem_mcp-search.smart_search` for the topic.

16. **playwright screenshots save to `lyceum/screenshots/` only** — root-level dirs are blocked.

17. **Bash on this machine is Git Bash**, so things like `find /` traverse Windows drives but `cd C:\path` won't work — use forward slashes or quoted Windows paths.

---

## § Quick wins (do before backend if time-pressed)

From BACKEND_ROADMAP.md but tracked here for ticking:

- [ ] **QW-01** Persist Today's plan / lesson selections / course builder state to **localStorage** (key prefix `lyceum.v1.*`), so refresh keeps state.
- [ ] **QW-02** Real `Date.now()` in dashboard greeting.
- [ ] **QW-03** Client-side keyword-matched mock tutor (3-4 keyword triggers, varied responses).
- [ ] **QW-04** Replace `Math.sin` analytics chart + heatmap with seeded deterministic fixtures that look like real data.
- [ ] **QW-05** `<Suspense>` + skeleton screens on the dashboard so it *feels* like loading data.
- [ ] **QW-06** Wire chips and filters to client-side filtering of the hardcoded arrays.
- [ ] **QW-07** Mock route guards: a no-op `useSession` that reads from localStorage; redirects to a fake `/login` if no role.

---

## § Decision log

| When | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 2026-05-09 | Use Next.js 16.2.6 scaffold | Latest stable, AGENTS.md says read docs | — |
| 2026-05-09 | Tailwind v4 | What scaffold gave us; tokens in `globals.css` work great with the WF token system | v3 |
| 2026-05-09 | Inline styles for layout | Wireframe design is pixel-precise; matches source `wf-*.jsx` 1:1 | Pure Tailwind utilities |
| 2026-05-09 | One brand: "Lyceum" with serif L logomark | From wireframes | — |
| 2026-05-09 | New project, NOT inside `edtech-platform/` | User explicitly requested | Reuse edtech-platform |
| 2026-05-09 (planned) | Postgres + Prisma | Mature DX with Next.js, migrations included | Drizzle (less tooling), Supabase-only (lock-in) |
| 2026-05-09 (planned) | Auth.js v5 | Need full role model + Clever later; Clerk overkill long-term | Clerk |
| 2026-05-09 (planned) | tRPC v11 | One client, end-to-end types | REST handlers, GraphQL |
| 2026-05-09 (planned) | Anthropic Claude | Already integrated in this Code env | OpenAI, local models |
| 2026-05-09 (planned) | pgvector for embeddings (P2) | Same DB, no new service | Pinecone, Weaviate |
| 2026-05-09 (planned) | Cloudflare R2 | S3-compatible, cheaper egress | S3 direct |
| 2026-05-09 (planned) | Mux for video | Adaptive streaming + offline + captions out of box | Self-host HLS, Cloudflare Stream |

---

## § What to update each session

Before stopping, update:
1. **Resume scratchpad** — last session, branch, what's in flight, blockers.
2. **Phase checklist** — tick what's done.
3. **Decision log** — add anything settled.
4. **Gotchas** — anything new that bit you and would bite again.
5. **mem0** memory_store with `kind: "decision"` for any architecture choice that should survive across machines.

If you change file layout, update **§ File / folder layout (target)**.

If a "locked decision" turns out wrong, mark it superseded in the Decision log — don't silently change.
