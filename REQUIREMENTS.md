# Requirements — Review Backlog

> Source: full project review, **2026-06-12** (schema, all tRPC routers, auth/
> payments/webhooks, crons, AI surfaces, main UI pages). This is the working
> backlog from that review. **How to work it:** pick the highest OPEN item,
> run the normal cycle (build → tsc/eslint/vitest/build [+ playwright on
> push via CI] → commit per logical unit → AGENT_NOTES), then update the
> item's Status inline (`OPEN` → `DONE <sha>`). Don't re-audit what's in
> "Verified clean" below.
>
> Priorities: **P0** money/security/correctness now · **P1** launch-blocking
> UX/product · **P2** product depth · **P3** strategic bets.

---

## P0 — money / security / correctness

### R1 · Prod TLS verification disabled — **USER-OWNED** · Status: DONE (verified 2026-06-16, cont.55)
`NODE_TLS_REJECT_UNAUTHORIZED=0` on Vercel Production — the user removed it.
**Verified from prod runtime telemetry** (not just "should be"): across 7
days of live traffic (Jun 9–16, confirmed 200s on `/api/auth/session` +
`notification.list`) the Node `"…makes TLS connections… insecure"` warning
that the flag prints on every cold start appears **zero** times. The absence
is conclusive, not suppressed: process warnings ARE enabled in prod (the
`pg-connection-string` `verify-full` notice fires), so if the flag were set
its warning would show. Postgres connects with full cert verification. Read
the runtime logs via the Vercel MCP; never read the `DATABASE_URL` value.
Residual TLS-posture hardening tracked as R54. (Update `KNOWN_ISSUES.md`
§S1-1 to resolved.)

### R54 · Pin `sslmode=verify-full` in prod `DATABASE_URL` — **USER-OWNED** · Status: OPEN
Surfaced while verifying R1 (cont.55). The Neon connection string uses an
sslmode of `prefer`/`require`/`verify-ca`, which current `pg` /
`pg-connection-string` treat as `verify-full` (strict) — secure today, and
the source of the benign `(node:4) Warning: SECURITY …` in prod logs
(`node_modules/pg-connection-string/index.js:216`). In the next major (pg v9
/ pg-connection-string v3) those aliases adopt weaker libpq semantics. **Fix
(user-owned — it's the Vercel `DATABASE_URL` secret):** append
`sslmode=verify-full` to the prod connection string so strict verification is
pinned regardless of future driver defaults. Not urgent; posture already
secure. No code change.

### R2 · Razorpay orders fall into the demo-refund path · Status: DONE (see git log "refund correctness")
**Where:** `payment.refundOrder`, `src/server/routers/payment.ts` (~line 578).
**Bug:** the guard is `isStripeEnabled() && order.provider === "stripe"`. A
PAID **razorpay** order (and a stripe order when the env key is absent)
falls through to the demo branch: DB flips REFUNDED + enrollment deleted,
**but no actual refund is issued at the provider** — the student paid, lost
access, kept no money. **Fix:** only `provider === "demo"` orders may take
the demo branch; razorpay/stripe orders throw a clear "issue the refund from
the provider dashboard" error. **Accept:** vitest — refundOrder on a
razorpay-provider order throws; demo order still refunds.

### R3 · Razorpay dashboard refunds never sync back · Status: DONE (cont.29 — refund.processed/payment.refunded branch + shared revokePaidOrder; partial refunds revoke fully, matching the stripe branch)
**Where:** `src/app/api/razorpay/webhook/route.ts` handles paid events only.
A refund issued in the Razorpay dashboard leaves Order=PAID + enrollment
intact forever. **Fix:** handle `refund.processed` (and `payment.refunded`):
resolve `refund.entity.payment_id` → payment (authed GET via
`lib/payments/razorpay.ts` fetch helper) → `notes.orderId` / reference_id →
Order; then REFUNDED flip + enrollment removal + enrollCount decrement (R4)
in one tx. Idempotent via the StripeEvent ledger + `status === "PAID"` gate.
Mirror the stripe `charge.refunded` branch shape. **Accept:** vitest with a
mocked payment fetch; replay-delivery is a no-op.

### R4 · Refunds don't decrement `Course.enrollCount` · Status: DONE (see git log "refund correctness")
**Where:** stripe webhook `charge.refunded` branch and `payment.refundOrder`
both `enrollment.deleteMany` without touching the counter
(`ensureEnrollment` increments on the way in — `src/server/services/enrollment.ts`).
Honest-counters doctrine breaks on every refund; the number drifts up
permanently. **Fix:** `removeEnrollment(db, userId, courseId)` sibling
service — delete + decrement only when a row was actually deleted (never
below 0); wire into both refund paths (+ R3 when it lands). **Accept:**
vitest — paid→refund round-trip leaves enrollCount where it started.

### R5 · Tutor stream history is unbounded + client-trusted · Status: DONE (see git log "tutor hardening")
**Where:** `src/app/api/tutor/stream/route.ts` `RequestSchema` — `history`
caps at 40 items but item `content` has **no length cap** (only the new
`message` is `.max(4000)`), and the Claude call replays client-supplied
history verbatim (a client can inject fake `assistant` turns; 40×huge
strings amplify token cost). **v1 fix (shipped):** truncate each history
item server-side (`.transform(slice 8000)`) — truncation, not rejection,
because legit assistant turns can exceed 4k chars. **v2 (optional, note):**
rebuild history from `TutorMessage` rows instead — but that gives
`tutorLogOptOut` users per-message amnesia, so it needs a product decision.

### R6 · Anonymous AI quota is one GLOBAL bucket · Status: DONE (cont.29 — ctx.anonKey = sha256(ip+secret) per-caller bucket, stamped into audit payload; global ceiling 20/150/500 stays as backstop)
**Where:** `src/lib/rateLimit.ts` — anon callers count rows
`where actorId: null`, i.e. **all anonymous users share one** 4/min ·
30/hr · 100/day budget platform-wide. One crawler exhausts AI search for
every logged-out visitor (cheap DoS), and legit anon traffic already
throttles itself collectively. **Fix:** key anon quota by hashed IP
(`x-forwarded-for` first hop + salt) stored in the audit payload, or an
in-memory/Upstash counter. Keep the global cap as a second ceiling.

---

## P1 — launch-blocking UX / product

### R7 · Mobile reflow for student-facing pages · Status: DONE (cont.29 utilities + cont.30 second pass: course detail [`.wf-two-col--wide`] + lesson reader [`.wf-reader-cols` — drops outline rail ≤1100px, tutor rail ≤900px] + both loading skeletons. /browse and /student/library were already auto-fill responsive. Stragglers for a later polish: /student/progress KPI row, community grid, reader-internal 1fr-1fr blocks)
Chrome/nav is responsive (`useMediaQuery` in all five `*Chrome` layouts) but
**page content is not**: `globals.css` has zero `@media` rules and grids are
hardcoded (`repeat(4, 1fr)` marketplace `src/app/page.tsx:370`,
`repeat(3,1fr)` paths, fixed `1fr 320px` student dashboard, etc.). India-
first launch = phones first. **Scope (first pass):** marketplace home,
/browse, course detail, student dashboard, lesson reader. **Approach:**
shared responsive utilities in globals.css (`.wf-grid-cards { grid-template-
columns: repeat(auto-fill, minmax(240px, 1fr)) }`-style) + collapse fixed
two-column layouts under ~720px; clean at 360px wide. Don't boil the ocean —
R20 (tokenization) is the structural fix; this pass just makes the top
screens usable.

### R8 · Delete the 3 fake UI remnants on /student · Status: DONE (cont.29 — dead search span removed [real search lives in StudentChrome]; "Your week" driven by Attempt/LessonProgress days; badge "of 47" → real earned/total counts)
`src/app/student/page.tsx`: **(a)** ~line 63 — the "search" bar is a dead
`<span>` (no input, no handler): wire it to the existing semantic search
(`HeaderSearchCombobox` / `marketplace.semanticSearch`) or remove it;
**(b)** ~line 366 — "Your week" fills every circle up to today
(`filled = i <= todayIdx`) regardless of real activity: derive per-day
activity from `Attempt`/`LessonProgress` createdAt this ISO week (add to
`student.dashboard` payload); **(c)** ~line 540 — badge count "of 47" is
hardcoded: return `db.badge.count()` in the dashboard payload.

### R9 · Author can review their own course · Status: DONE (cont.30 — authorId guard in submitReview + test)
`course.submitReview` is enrollment-gated only — a teacher can enroll in
their own free course and 5-star it. Add `course.authorId === ctx.user.id →
FORBIDDEN` + test. (Marketplace trust = the product's currency.)

### R10 · Password reset + email verification · Status: DONE (cont.31 — requestPasswordReset [no-enumeration, anon rate-limited, single live token] / resetPassword [1h TTL, single-use, marks email verified] / verifyEmail [24h TTL, sent at signup]; pages /forgot-password /reset-password /verify-email; login link gated on isEmailEnabled. Mail dormant until RESEND_API_KEY lands)
No forgot-password flow; signup never verifies the address. The
`VerificationToken` table exists, unused. Gate on `RESEND_API_KEY` like
every other integration (hidden link when email is dormant). Includes:
reset-request page, tokened reset page, verification email on signup with a
"verified" nudge (don't hard-block login on it for K-12 friction reasons).

### R11 · Signup age/consent gate (COPPA / India DPDP) · Status: DONE-v1 (cont.32 — age band select for students, parent-email required for under-13 [server-enforced], consent checkbox stamps coppaConsentAt; ageBand/parentEmail columns via migration signup_consent_fields. v2 = VERIFIABLE parental consent — email the parent a confirm link; needs legal sign-off on mechanism)
`User.coppaConsentAt` exists but signup collects nothing. Minimum: age band
at signup; under-threshold requires parent email + consent checkbox; stamp
`coppaConsentAt`. India DPDP needs verifiable parental consent for <18 —
needs a product/legal decision on mechanism; capture parent email now so the
upgrade path exists.

---

## P2 — product depth

### R12 · Assignment model + "Due this week" · Status: DONE (cont.30 — migration 20260612044208; assignment router create/listMine/delete/lessonOptions; /teacher/assignments page + nav; dashboard card live with done-state + lesson links; markComplete awards bonus XP once via XPEvent source "assignment_complete". v2 ideas: class-scoped targeting, notifications on post, overdue nudges)
`student.dashboard` returns hardcoded `assignments: []` ("No Assignment
model exists yet") and the dashboard card renders an empty state shaped for
it. Schema: `Assignment(id, teacherId, classId?/courseId?, lessonId?,
title, instructions, dueAt, xp)` (+ per-student done state — or compute from
`LessonProgress` when lesson-linked). Teacher UI to post/list; student card
links into the lesson; XP on completion through the existing award pipeline.
The single most-requested K-12 primitive; the UI is already waiting.

### R13 · "Today's plan" generator · Status: DONE (cont.32 — deterministic in student.dashboard: done-today rows → due assignments → next uncompleted lesson of top course → weakest-skill practice → streak saver; first actionable = "now"; items carry hrefs and TodaysPlan's Start navigates. Honesty fix riding along: fake "AI-curated · 35 min" annot + dead Customize button removed)
`student.dashboard.todaysPlan` is hardcoded `[]`. Deterministic v1 service
(no AI needed): next lesson of most-recent in-progress course → weakest
`Mastery` skill drill → due assignment (R12) → streak-saver if streak at
risk. 3–5 items, tested. The dashboard already renders `TodaysPlan` when
non-empty.

### R14 · Real recommendations · Status: DONE (cont.31, commit says "R13" — enrolled users get unowned courses from their subjects/grades, rating-ranked, top-rated fill; `personalized` flag keeps homepage copy honest. v2: weight by weak skills)
`marketplace.recommendedFor` ignores the user (top-rated only; honest copy
admits it). Personalize: subjects/grades from enrollments + weak skills from
attempt accuracy → matching published courses; fall back to top-rated for
anon.

### R15 · ⌘K command palette · Status: DONE (cont.31 — global CommandPalette in root layout: ⌘K/Ctrl-K, debounced semanticSearch + safe nav jumps, arrow/enter/esc keyboard nav. v2: role-aware links, lessons, "ask tutor")
Header search exists per-chrome; a global cmd-K palette (courses, lessons,
"ask tutor", nav) is cheap differentiation — wire R8(a) into it.

### R16 · Typed attempt columns (KNOWN_ISSUES S2-3) · Status: DONE (cont.31 — chosenIndex/subIndex Int? + backfill migration for the 3 choice encodings; write side populates both; drag/branch stay NULL by design. KNOWN_ISSUES S2-3 marked resolved)

### R17 · Course thumbnail imagery story · Status: DONE-v1 (cont.32 — subjectGlyph watermark over the gradient fallback on cards + course hero, zero assets; real thumbnailUrl still wins. v2 = AI cover art at publish, cached to blob storage)
Gradient fallback is tasteful but uniform. Options: per-subject illustration
set, or AI-generated course art at publish time (cache to blob storage).

---

## P3 — strategic bets

- **R18 · Design-system tokenization** · Status: PILOT DONE (cont.33 —
  /student + TodaysPlan fully converted to Tailwind utilities over the
  existing `@theme inline` token map; `--color-warn` added so the map covers
  the whole wf palette. **The conversion template:** Tailwind classes for
  static styles, inline `style` only for dynamic values, shared `wf-*`
  classes untouched [they're unlayered so they beat utilities in the
  cascade]; row-divider conditionals become `last:border-b-0`. Convert other
  hot paths as they're touched.) — thousands of inline `style={{}}`
  objects are why mobile + theming are hard. Migrate hot paths to Tailwind
  classes / shared primitives as they're touched (R7 first). Prereq for any
  serious redesign.
- **R19 · Persona-split visual language** · Status: PILOT DONE (cont.34 —
  `st-*` persona layer in globals.css [st-card hover lift, st-pop press,
  st-pulse streak ritual; all off under prefers-reduced-motion] applied to
  the dashboard: 34px week circles with today pulsing until first activity,
  bigger streak figure, honest level-progress bar fed by stats.levelInto/
  levelSpan. **cont.36: lesson-complete celebration moment done** — emoji
  pops in via st-celebrate keyframe, XP chip + Continue button get
  st-pop. **cont.37: library + skill-tree done** — st-card lift on course
  cards + tree nodes, st-pop on CTAs. Remaining: chrome nav.) — student
  surfaces go game-like
  (big, tactile, motion, streak ritual — Duolingo/Brilliant energy);
  teacher/admin stay information-dense. Sharpest available differentiation
  vs incumbents.
- **R20 · i18n + Hindi/vernacular** · Status: PILOT DONE (cont.33 — `hi`
  locale live in the cookie-based next-intl setup; /student dashboard +
  TodaysPlan extracted [second surface after /student/progress]; date header
  + week letters localize; LocaleToggle in the dashboard header; catalogs
  parity- AND ICU-compile-tested. **v1 limit:** tRPC-built strings [plan
  item titles, assignment due labels] stay English — fix is tag-based
  client rendering or request-scoped getTranslations in routers.
  **cont.36: lesson reader extracted** — LessonReader namespace [en/es/hi]
  covers the completion + empty cards + primary action buttons.
  **cont.37: library + skill-tree extracted** — Library [ICU plural] +
  SkillTree namespaces. 6 surfaces done; next: chrome nav, /browse,
  course detail, teacher/admin [tracked as R30].) — string extraction first
  (next-intl), Hindi pilot, then regional. Huge India differentiator.
- **R21 · Board alignment** · Status: DONE (cont.34 — `Course.board`
  column [cbse/icse/state/ib/cambridge] with seed backfill in the
  migration; Board chip on the shared homepage+/browse filter row via
  catalogWhere; card tag line + course-hero breadcrumb show it; teachers
  set it via a validated Board select in the builder details panel.
  v2: board-aware search/recs weighting.) — CBSE/ICSE/state-board tags on
  Course + filters/search facets; it's how Indian parents actually shop.
- **R22 · Offline-first lessons** · Status: DONE-v1 (cont.35 — visited
  lessons were already cached by the SW's navigate handler; new "Save
  offline" control on library cards pre-caches EVERY lesson of a course
  via a PRECACHE_LESSONS message handler [MessageChannel progress,
  same-origin /student/lesson/ allowlist, SW v3]. Offline attempts queue
  via the existing offlineAttemptQueue. Known limit: videos stream-only —
  a low-bandwidth no-autoload mode is the remaining leg.) — extend the
  existing service worker to
  pre-cache enrolled-course reader content; low-bandwidth mode (no video
  autoload).
- **R23 · WhatsApp notification channel** · Status: SCAFFOLD DONE (cont.36 —
  `lib/whatsapp.ts` mirrors the dormant-Resend pattern: env-gated on
  WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID, Meta Graph Cloud API over
  fetch [no SDK], fire-safe senders streak_reminder / assignment_due /
  parent_weekly_digest + E.164 normalizer. Lights up when keys land. Still
  TODO when live: wire the senders into the streak-rollover cron + the
  assignment post + a parent-digest cron, and capture opt-in consent.) —
  streak nudges, assignment due, parent weekly digest. India table stakes.
- **R24 · AI moat expansions** · Status: syllabus-paste DONE-v1 (cont.33 —
  optional paste box on the AI builder [replaced the three dead chips];
  rides GenerationJob.input into the skeleton prompt as a source-of-truth
  section, topics→units / subtopics→lessons; 20K-char cap; unit chunks
  inherit structure via the skeleton so token cost is flat. v2: feed a
  trimmed syllabus slice into unit chunks for terminology fidelity.
  **Free-response auto-grading DONE (cont.34):** FREE_RESPONSE block —
  teacher prompt + private rubric, AI-graded 0-100 with feedback/
  strengths/improvements via completeStructured (keyword-heuristic demo
  grade keyless), Attempt rows carry typed freeText/aiFeedback/score
  columns, ≥60 awards XP; v2 = teacher review surface over the stored
  answers. **Adaptive difficulty:** already live via AI_QUIZ weak-spot
  regeneration. **Citations tutor:** already live (findCitation).
  R24's list is now covered end-to-end.) —
  syllabus-paste → full unit drafts;
  free-response auto-grading; adaptive difficulty on quiz decks; the
  citations-backed tutor as the schools-trust story.
- **R25 · Cohort/live delivery mechanics** · Status: DONE-v1 (cont.36 —
  sessionStartsAt + sessionJoinUrl columns; teacher.updateCourse format
  select + schedule fields [self_paced clears them]; builder datetime +
  link inputs shown only when scheduled; detail-page LiveScheduleCard
  [server-formats in IST, join link enrolled-only]; seed cohort demo.
  v2: calendar invites, recurring sessions, attendance.) — `Course.format`
  ("live" | "cohort") exists with zero scheduling/meeting machinery.
- **R26 · Parent self-service linking** · Status: DONE (cont.35 — family
  codes: student generates a 6-char single-use code in Settings → Family
  [VerificationToken `parentlink:` namespace, 7-day expiry,
  regenerate-replaces]; parent redeems on /parent [replaced the COMING
  SOON stub]; same ParentChild row as the admin flow; possession = the
  authorization, so no email infra needed — codes travel by WhatsApp.
  v2: notify the child when a parent links.) — invite-token flow (parent
  links their own kid); admin-only today (`admin.linkParentToChild`).
- **R27 · Earnings-export polish** · Status: DONE (cont.35 — route renamed
  to `/api/teacher/earnings-export`; the CSV was already currency-neutral
  [currency column + minor-units÷100], so only naming + 1099 copy
  changed. Gotcha: a route rename leaves stale `.next/{dev/,}types`
  validators — clear them or tsc fails on ghosts.) — `/api/teacher/1099`
  is US-framed on an INR product. Cosmetic.
- **R28 · Stripe dormant-path polish** · Status: DONE-v1 (cont.35 —
  `payment_method_types: ["card"]` dropped from both Checkout creates so
  Stripe picks dynamic methods from dashboard config. Refunds stay
  dashboard-driven by design — the charge.refunded webhook already syncs
  order/enrollment state; an API-initiated refund button is a
  wake-Stripe-up follow-up.) — drop `payment_method_types:
  ["card"]` (let Stripe pick dynamic methods) and wire real Stripe refunds
  via the API when the international phase wakes Stripe up.

---

## P4 — post-marathon backlog (R29+), from the 2026-06-14 review pass

The original R1–R28 board is cleared (R1 = user-owned TLS, the only OPEN).
This is the NET-NEW backlog surfaced by a fresh review after the marathon —
pick the highest item and work the normal cycle. Ordered by trust/impact.

- **R29 · Lesson-reader honesty pass** · Status: DONE (cont.38 — killed
  the fake `p. 142` citation [real ones come from findCitation on streamed
  replies]; `<XPChip value={120}>` → live `xpEarned`; fake `stepStateFor`
  TOC progress → neutral authored-steps list; removed dead Pin/Notes/Offline
  header buttons. Reader header is now honest.) (P0-trust) — fabricated
  elements on the highest-trust surface, same de-vanity discipline as R8.
- **R30 · i18n breadth** · Status: IN PROGRESS (cont.38 +Nav/Browse/
  CourseDetail; cont.39 +TeacherNav/AdminNav chrome navs — **11 surfaces
  localized** en/es/hi. Remaining: deeper teacher/admin page bodies +
  tRPC-built strings [plan titles, assignment due labels — need
  request-scoped getTranslations or tag-based client rendering].
  cont.40: +TeacherCourses page body [first teacher page-body surface] —
  **12 surfaces**. cont.43: +AdminDashboard [first admin body] +
  TeacherAnalytics — **14 surfaces**; the static JSX is localized but the
  KPI/funnel labels these pages render still come from tRPC in English —
  that ceiling is now tracked as **R41**.) — the big R20 continuation;
  extend namespace-by-namespace.
- **R31 · Wire the WhatsApp senders** (unblocks the day R23's keys land) —
  connect `lib/whatsapp.ts` to the streak-rollover cron (streak_reminder),
  the assignment post (assignment_due), and a new parent-digest cron
  (parent_weekly_digest); capture an opt-in + a phone column on User.
- **R32 · SEO / discovery** · Status: DONE (cont.38 — `app/sitemap.ts`
  [static + PUBLISHED courses + non-hidden teacher storefronts, best-effort
  on DB error], `app/robots.ts` [allow catalog, disallow authed app+API,
  sitemap ref], root `metadataBase` + title template + default OG/Twitter,
  course `generateMetadata` [canonical + OG image from thumbnailUrl] +
  schema.org Course JSON-LD [rating/price/provider]. Build renders
  sitemap.xml with all 6 courses + robots.txt. v2: dynamic OG images,
  per-locale alternates.) — was zero SEO surface; pure growth lever.
- **R33 · Free-response teacher review** · Status: DONE (cont.39 —
  `teacher.freeResponseSubmissions` [own courses, ADMIN all] +
  `overrideFreeResponse` [course-ownership gated]; Attempt gains
  `scoreOverride`/`reviewedAt` [migration], finalScore = override ?? AI;
  /teacher/grading page + Grading nav. v1: overriding doesn't claw back
  XP earned at submit.) (R24 v2) — answers + AI scores persisted but no
  teacher surface read them.
- **R34 · Live/cohort v2** · Status: DONE-v1 (cont.40 — `Course.sessionRecurrence`
  [weekly/biweekly/monthly] drives an iCalendar RRULE; `lib/calendar.ts`
  builds the .ics served from `/api/course/[slug]/calendar`; schedule card
  gains 'Add to calendar' + a 'Repeats weekly' label; builder Repeats
  select. Pure-builder test. Remaining v2 leg: attendance tracking.) (R25
  v2) — calendar invite + recurring sessions done; attendance is the
  remaining piece.
- **R35 · Parent dashboard polish** · Status: DONE (cont.39 — `/parent`
  XP sum is now a single `xPEvent.groupBy` aggregate keyed by child id
  [was loading every XPEvent row per child]; parent.linkWithCode writes a
  `parent.linked` notification to the child [R26 v2]. Test asserts the
  notification.) (R26/perf)

---

## P5 — post-P4 backlog (R36+), from the 2026-06-15 review pass

P4 is essentially cleared (R29/R30[partial]/R32/R33/R34/R35 done; R31
blocked on WhatsApp keys). New net-new findings from a fresh audit:

- **R36 · Notification surfacing** · Status: DONE (cont.41 — bell now in
  the shared `SidebarUserMenu` [student/teacher/admin, every page;
  `dropUp`/`dark` props for the sidebar-bottom + dark-admin placement],
  `ParentHeader`, and `MarketChrome` top bar [signed-in only]; dashboard
  duplicate removed. R35's child-notify is now visible everywhere.)
  (P0-trust)
- **R37 · Global locale switcher** · Status: DONE (cont.41 — LocaleToggle
  in the shared `SidebarUserMenu` [all 3 sidebar roles, every page],
  `ParentHeader`, and `MarketChrome` top bar [anonymous-friendly — locale
  is cookie-based]; removed the 2 duplicate page-level toggles. The 12
  i18n surfaces are now reachable app-wide.)
- **R38 · Accessibility pass** · Status: v2 DONE (cont.41 Icon/Toggle
  baseline; cont.42 labelled the remaining icon-only/placeholder-only
  controls — tutor send button + tutor question input, command-palette
  search, block-search. Audited the rest as already-covered: builder drag
  handles [Reorder unit/lesson], browse search [aria], AI-outline
  regenerate/settings, and reader correctness [✓/✗ glyphs + check icons +
  "Correct"/"Not quite" text, not colour-only]. Long-tail full-surface
  sweep stays under R38.) — WCAG-AA baseline schools ask for.
- **R39 · Free-response XP reconciliation** (R33 v2) · Status: DONE
  (cont.42 — `reconcileFreeResponseXp` service: teacher override is
  authoritative, so crossing the 60 pass line either way writes a single
  delta XPEvent keyed to the *attempt* [block.id isn't unique], idempotent
  across re-overrides + clear-to-AI. Streaks/badges left as-earned. Submit
  award now refId=attempt.id and shares FREE_RESPONSE_XP/PASS constants.
  Student gets a grade_updated notification when XP moves. 3 reconcile
  tests.)
- **R40 · Public-route integration tests** · Status: DONE (cont.42 —
  `test/publicRoutes.test.ts`: sitemap includes PUBLISHED / excludes DRAFT
  / leaks no app routes; robots disallows /api + app + sitemap ref; .ics
  404s on unknown/draft/session-less + valid recurring VEVENT on a live
  course; course canonical metadata set for published, empty for
  draft/unknown. generateMetadata logic extracted to `lib/seo.ts` so it's
  testable without the page's server-only graph.)

---

## P6 — post-P5 backlog (R41+), from the 2026-06-15 review pass

P5 cleared (R36–R40 all done). This pass scanned the mature tree for the
next genuine gaps — not rehashed debt (KNOWN_ISSUES is clean: only S1-1 /
R1 remains, user-owned). **Verified-absent before listing:** Sentry/error
tracking already exists (`instrumentation.ts` + `sentry.*.config.ts`), so
observability is **not** a gap.

- **R41 · Locale-aware tRPC display strings** — the i18n ceiling. Routers
  build UI labels in English (`admin.overview` KPI labels `k.l`,
  `teacher.analytics` funnel `s.label` + KPI labels, status strings), so a
  fully-translated page still shows English *data* labels. R30 can only
  reach so far until routers return stable i18n keys (+ params) instead of
  baked English and the components translate. Scope first to the dashboard
  KPI/funnel labels localized in cont.43.
  · **Status: DONE-v1 (cont.44** — `admin.overview` + `teacher.analytics`
  emit a stable `key` per KPI + funnel stage [English `l`/`label` kept as
  fallback]; dashboards translate by key via a literal-`t()` record. KPI
  titles + drop-off funnel labels now localize. **Tail DONE (cont.45)** —
  the `meta`/delta unit-strings now ship as structured `{key, params}` and
  render via `t()` with ICU plurals; `teacher/students`' KPI strip (a third
  consumer of `analytics.kpis`) localized too. No English left in the
  dashboard KPI data.)
- **R42 · Router test coverage: generator + skill** — both have ZERO
  caller-level tests (only the worker `processOutlineJob` and the
  `skillProgress` service are covered). Untested at the tRPC boundary:
  generator job create/status/saveAsCourse (incl. authz) and
  `skill.tree`/`nudge`. Add caller tests mirroring the lesson/teacher
  suites.
  · **Status: DONE (cont.44** — `test/skill.test.ts` [pure
  `computeSkillStates` all-states + `skill.tree` router with a seeded
  A→B→C chain + user-scoped stats] and `test/generator.test.ts` [outline
  demo, getJob/cancelJob ownership, generateQuestions authz, saveAsCourse
  with `after()` stubbed]. 13 tests.)
- **R43 · Account deletion + data export (DPDP/COPPA erasure &
  portability)** — R11 shipped consent gating but there's no way to delete
  an account or export a user's data (confirmed: `account.ts` has neither).
  For a children's-data product under India DPDP + COPPA, right-to-erasure
  and data portability are legal obligations. Needs a cascade-aware delete
  (anonymise-vs-hard-delete decision) + a JSON export of the user's rows.
  · **Status: DONE (cont.44** — `account.exportData` [JSON bundle] +
  `account.deleteAccount` [anonymise PII + tombstone email + `deletedAt` +
  drop OAuth/sessions; refuse teachers with content/sales; type-DELETE
  confirm]. Hard-delete was rejected because the Order buyer FK cascades
  into the teacher's sale record. `auth.ts` refuses deleted users;
  `User.deletedAt` migration; Settings "Your data" card; 3 tests. Active
  JWTs aren't server-revocable [client signs out] — noted.)
- **R44 · Transactional email activation** — password reset, email
  verification, weekly digest, and purchase receipts are all BUILT but
  dormant (no `RESEND_API_KEY`; `email.ts` no-ops), so "forgot password"
  silently does nothing for real users in prod. Needs the Resend key + a
  verified sending domain (user-owned ops) then a smoke of each path.
  · **Go-live checklist (yours to run; the code is ready — one env var is
  the only gate):**
  1. **Verify a sending domain** at resend.com (add the DKIM/SPF/DMARC DNS
     records it gives you for `lyceum.app`). The senders use
     `receipts@`/`account@`/`hello@lyceum.app` — the domain must be verified
     or Resend rejects the send.
  2. **Set `RESEND_API_KEY`** on Vercel (Production). `isEmailEnabled()`
     flips true the moment it's present; no redeploy of code needed beyond
     picking up the new env (redeploy to apply).
  3. **Smoke all five senders** after deploy: receipt (`sendOrderReceipt`
     via a demo checkout), reset (`requestPasswordReset`), verify
     (signup), parental consent (`R47` under-13 signup → parent inbox),
     weekly digest (`/api/cron/weekly-digest`). Each logs a skip line when
     dormant — confirm those stop.
  4. **If `from` addresses bounce**, point them at your verified domain in
     `lib/email.ts` (`FROM_ADDRESS`/`ACCOUNT_FROM_ADDRESS`/
     `DIGEST_FROM_ADDRESS`). That's the only code touch, and only if the
     domain differs from `lyceum.app`.
- **R45 · Mobile reflow stragglers** (R7 tail) — `/student/progress` KPI
  row, the community grid, reader-internal 1fr-1fr blocks, and the
  admin/teacher dashboards' fixed `repeat(6,1fr)`/`repeat(5,1fr)` KPI grids
  + multi-column card rows overflow on phones. A focused responsive pass.
  · **Status: DONE-v1 (cont.44** — 9 fixed KPI/stat grids [admin + teacher
  dashboards, admin analytics, teacher earnings, parent, /student/progress,
  3 loading skeletons] switched to `repeat(auto-fit, minmax(140px, 1fr))`
  so they wrap on phones, fill identically on desktop. **Tail DONE
  (cont.45)** — community feed grid + teacher/students KPI strip reflowed;
  the reader's drag-match `1fr auto 1fr` is an intentional paired layout
  that fits, left as-is.)

---

## P7 — post-P6 backlog (R46+), from the 2026-06-15 review pass

P6 effectively cleared (R41/R42/R43/R45 done in cont.44; **R44** transactional
email is the only carry-over, user-owned). Net-new gaps, each grounded in the
code. (Verified-absent: error tracking/Sentry already exists.)

- **R46 · Login brute-force protection** — `lib/auth.ts` credentials
  `authorize()` bcrypt-compares with **no attempt counter or lockout**. The
  signup/password-reset router IS rate-limited, but the login path isn't, so
  password-guessing against a known email is unthrottled. Add per-email + per-IP
  attempt throttling on the credentials path (reuse the rate-limit infra).
  · **Status: DONE (cont.46** — `lib/loginRateLimit.ts` counts
  `auth.login_failed` AuditLog rows [8/email, 30/IP over 15 min, no
  migration]; `authorize()` bails before DB/bcrypt when throttled + records
  failures incl. for unknown emails. 3 tests.)
- **R47 · Verifiable parental consent (R11 v2, COPPA)** — under-13 signups
  capture `parentEmail` but consent is self-attested; the actual VPC flow (email
  the parent a confirm link before the child account activates) is unbuilt. A
  real COPPA obligation; the token/gate/schema are buildable now, with the email
  *send* riding on R44.
  · **Status: DONE-v1 (cont.46** — `User.parentConsentAt` migration;
  under-13 signup always mints a 7-day `pconsent:` token + dormant-emails
  the parent; `auth.confirmParentalConsent` stamps consent + burns the
  token; `/parental-consent` confirm page; `account.me` exposes
  `awaitingParentalConsent` via pure `lib/parentalConsent`. 3 tests. Hard
  access gate [block lessons until confirmed] is the v2 step.)
  · **v2 (cont.47)** — `ParentalConsentBanner` soft nudge on the student
  dashboard for an unconfirmed under-13 learner. Deliberately NOT a hard
  block: the confirm email is dormant until R44, so gating lessons would
  lock every under-13 account out permanently. The enforced gate waits on
  live email.
- **R48 · Dashboard query performance** — `admin.overview` + `teacher.analytics`
  each fan out 6–10 findMany/aggregate calls and pull full Attempt rows into
  memory to compute accuracy (`attempts.findMany({select:{correct}})` then
  filter in JS). At scale that's large row transfers + unindexed scans. Push the
  accuracy/active-count math into DB aggregates + add covering indexes; consider
  a short-TTL cache.
  · **Status: DONE-v1 (cont.46** — `admin.overview` accuracy now two
  `attempt.count` queries instead of `findMany`+JS-filter [no N-row
  transfer, identical result]. `teacher.analytics` keeps its rows — it
  needs them for the daily series. Covering indexes + caching remain the
  deeper tail.)
  · **deeper (cont.47)** — added composite `@@index([institutionId, role])`
  on User for the institution-scoped overview counts + the Attempt→User
  join filter. Short-TTL caching is the remaining tail.
- **R49 · E2E coverage for the paid checkout flow** — the Playwright suite
  covers login + an MCQ + the marketplace shell, but NOT the business-critical
  buy→enroll→gated-access path end-to-end (only unit-tested in
  `payment.flow`/`pathCheckout`). Add a spec driving demo-checkout → enrollment
  → gated lesson access.
  · **Status: ALREADY COVERED (cont.47 — review correction).** `e2e/
  buy-flow.spec.ts` already drives signup→buy→demoConfirm→enrolled and runs
  in CI (the P7 review missed it — `tail`-ing the e2e log hid it among the 7
  cumulative passes). The success page only renders after demoConfirm
  creates the Enrollment in a tx, and that same row is the reader's
  `ensureEnrollment` gate — so reaching it IS the gated-access proof. An
  explicit "in your library" re-check was tried + reverted (the heavy
  course-page render flaked under full-suite load).

---

## P8 — post-P7 backlog (R50+), from the 2026-06-15 review pass

P7 cleared (R46–R49). The feature backlog is genuinely exhausted — the only
carry-overs are **R44** (email) and **R1** (TLS), both user-owned. This pass
hunts net-new gaps, each grounded in the code.

- **R50 · Security response headers** · **Status: DONE-v1 (cont.48** — none
  were set [verified: no `headers()` in `next.config.ts`, none in
  `proxy.ts`]. Added HSTS + `X-Content-Type-Options` + `X-Frame-Options:
  SAMEORIGIN` + `Referrer-Policy` + `Permissions-Policy`
  [`microphone=(self)` for the SPEAK block; camera/geo denied]; confirmed
  served via `next start` + curl. **Tail:** a real CSP — deferred because
  the app styles via inline `style={{}}` + emits JSON-LD via
  `dangerouslySetInnerHTML`, so it needs nonces/refactor; start report-only.)
- **R51 · Rate-limit account creation + public mutations** — `auth.signup`
  and `auth.confirmParentalConsent` have NO throttle (only
  `requestPasswordReset` does), so a bot can mass-create accounts. Extend
  the AuditLog-counter pattern (R46 / `checkAIQuota`) to signup, keyed per
  IP (the anon `ctx.anonKey` already exists for this).
  · **Status: DONE (cont.49** — `lib/signupRateLimit.ts`: signup writes an
  `auth.signup` row stamped with `anonKey`; `isSignupThrottled` caps 20/IP
  per hour and skips when there's no IP scope (tests never throttle). 3
  tests.)
- **R52 · i18n breadth to 100%** (the long R30 tail) — chrome, dashboards,
  and tRPC labels are localized, but ~15 page bodies are still English:
  teacher students/earnings/grading/discussions/paths/storefront; admin
  people/classes/curriculum/audit/billing/teachers; student
  library/skill-tree. Mechanical, namespace-by-namespace, no new
  infrastructure — just unfinished breadth.
  · **Status: IN PROGRESS (cont.49 +`TeacherEarnings` [+ rewrote its
  dev-jargon "What ships next" card into an honest payout note]; cont.50
  +`TeacherStudents`; cont.51 +`AdminPeople` [role chips/plurals + ICU
  counts] +`AdminClasses`). Remaining: ~11 page bodies — teacher
  grading/discussions/paths/storefront, admin curriculum/audit/billing/
  teachers, student library/skill-tree. cont.52 +`TeacherGrading` [first
  CLIENT component, via `useTranslations` in GradingClient + SubmissionRow;
  also fixed stale post-R39 copy that claimed overrides don't change XP].
  cont.53 +`TeacherDiscussions` [second CLIENT component — the 381-line
  moderation hub: rich-text empty state via `t.rich`, ICU-plural comment
  counts, locale-aware relative-time formatter] + finished student
  library/skill-tree [already localized bar a few hardcoded stragglers:
  the `GRADE` card label, the `Mastery:` node tooltip, and the
  done/unlocked/locked state chips]. Remaining: ~6 — teacher
  paths/storefront, admin teachers[client]/curriculum/audit/billing. The
  client-component i18n pattern is proven [next-intl `useTranslations`,
  `t.rich` for inline emphasis]. cont.54 +`AdminTeachers` [third client
  component — accounts table + Razorpay payout-link form; locale-aware
  date that keeps en-IN order for en] +`AdminCurriculum` +`AdminBilling`
  [server pages; ICU-plural seats/students]. cont.56 +`TeacherPaths`
  +`TeacherStorefront` [the last two teacher client components — finishes
  the entire teacher surface]. **Remaining: 1 — admin audit only** [its 21
  `KIND_LABELS` audit event-type labels + chrome (`timeAgo`, filters,
  `[deleted user]`/`system`); a focused finale, after which R52 is done and
  a fresh P9 review is due]. **cont.57 +`AdminAudit` — every page R52 ever
  enumerated is now localized.** ⚠️ **The P9 review then found R52's scope
  was too narrow:** whole surfaces were never listed and are still English —
  the auth flow (login/signup/forgot/reset/verify), the entire course builder
  (`CourseBuilderClient`/`BlockInspector`/`BlockLibrary`/`AddBlockPopover`),
  the lesson **reader blocks** (`BlockReader` — learner-facing!), `/settings`,
  `teacher/assignments`, `admin/branding`+`integrations`+`analytics`,
  `teacher/students/[id]`, the `/` home, `t/[teacherId]`, checkout,
  `parent`/`parental-consent`, `student/community`. So **R52-as-scoped is
  DONE, but i18n is NOT at 100%** — the real remainder is tracked as **R55**
  (P9). Honest > checkbox.)
- **R53 · Test coverage for the thin routers + cron handlers** —
  `insight` + `parent` routers have ~1 caller test each, and the
  `/api/cron/*` route handlers (streak-rollover, weekly-digest, ai-insights,
  backfill-embeddings) have no handler-level test of the auth gate +
  happy/again path. Lock the cron `CRON_SECRET`/Bearer gate especially —
  it's a public endpoint that spends money (OpenAI).
  · **Status: DONE-v1 (cont.49** — `test/cronAuth.test.ts` locks the cron
  gate via streak-rollover [the cheap DB-only cron]: 500 unset / 401
  wrong-or-missing Bearer / 200 only with the correct token; the other
  crons share the identical check. cont.50: +`test/insight.test.ts`
  [forTeacher cache read + teacher-only authz + health]; `parent` was
  already covered by `parentSelfLink.test`. R53 fully done.)

---

## P9 — post-R52 review (2026-06-17)

R52 closed every page it enumerated, but the enumeration was incomplete (see
the ⚠️ on R52). Comparing `next-intl` usage against the 43 `page.tsx` routes
+ their client components surfaced the real remainder. The product is
otherwise feature-complete — the feature board has been exhausted since P7 —
so the genuine net-new work is: finish i18n for real, plus two small
hardening tails.

### R55 · Finish i18n for real — the surfaces R52 never enumerated · Status: IN PROGRESS (cont.58–78 — public surface + block catalogs + the ENTIRE CourseBuilderClient (CourseBuilder ns = 161) + the BlockInspector shell + batch-1 per-type editors (BlockInspector ns = 83) done; remaining: BlockInspector complex/Video editors + teacher-courses pages + admin tools)
`<html lang>` is already locale-correct (`getLocale()` in the root layout)
and the catalogs + parity harness exist, so this is pure breadth, same
`useTranslations`/`getTranslations` + C:\tmp splice-script pattern as R52.
Ordered by learner/public impact:
1. **Auth flow** (HIGH — public, every user): **DONE.** `login` + `signup`
   (cont.58, LoginPage/SignupPage ns; dev demo panel left English) + the
   recovery flow `forgot`/`reset`/`verify` + parental-consent confirm
   (cont.59, AuthRecovery ns in `PasswordResetForms.tsx`, 5 components). The
   whole auth surface is localized.
2. **Lesson reader blocks** (HIGH — learner-facing): `BlockReader.tsx` imports
   zero next-intl; the block affordances (check/submit/next/feedback across
   READING/QUIZ/POLL/SPEAK/DRAG_MATCH/BRANCHING/AI_QUIZ/FREE_RESPONSE) are
   English. Authored *content* stays as-authored — only UI chrome is in scope.
   **NOTE: ~3,654 lines / ~16 block types / 100+ strings — this is a
   multi-part job, NOT one cycle. Split by block type (core interactive
   blocks — READING/MCQ/POLL/FREE_RESPONSE/QUIZ — first; locale-aware times
   in LIVE). Each body component is its own fn → its own `useTranslations`.
   The block-type *labels* (`meta.label` from `@/lib/blocks` BLOCK_GROUPS)
   are a separate sub-item, shared with the builder.** **Part 1 DONE
   (cont.60):** fallback(ComingSoonBlock) + READING + MCQ[unique strings] +
   SLIDES + PDF + POLL + FREE_RESPONSE → appended 30 keys to the EXISTING
   `LessonReader` ns (owned by LessonClient). **Part 2 (remaining):** the
   **quiz family** — QUIZ/AI_QUIZ + MCQ's feedback strings (Sign in / streak
   / offline) which are shared *verbatim* across all three (do them together
   so the keys wire once), + LIVE (locale-aware relative times) + BRANCHING +
   DRAG_MATCH (shares streak/offline w/ the quiz family) + SECTION +
   DISCUSSION. **Part 2a DONE (cont.61):** SPEAK + SIMULATION (+20 keys;
   both self-contained). **Part 2b DONE (cont.62):** the whole **quiz
   family** — MCQ (now finished) / QUIZ / AI_QUIZ / DRAG_MATCH (+18 keys;
   resolved the shared streak/offline entanglement via `replace_all` once
   all 6 sub-components had `t`). **Part 2c DONE (cont.63):** BRANCHING + DISCUSSION (+ locale-aware
   `relativeTime`) + SECTION (+24 keys). **LIVE DONE (cont.64) → `BlockReader`
   is FULLY localized** (all ~16 block types + sub-components, en/es/hi). The
   only lesson-reader remainder is the block-type *labels* (`meta.label` from
   `@/lib/blocks` BLOCK_GROUPS) — shared with the course builder, so do them
   together.**
3. **Learner/public pages**: `/settings` **DONE (cont.65** — Settings ns,
   ~52 keys, all-roles account page) + `parental-consent` **DONE (cont.59)**.
   + the `/` **home DONE (cont.66** — Marketplace ns, ~43 keys, the biggest
   public page: discovery + role hero + 3 rich strings). + the **smaller
   public pages DONE (cont.67)** — `t/[teacherId]` public storefront
   (PublicStorefront ns), `student/community` (Community ns; `t`→`thread`
   map rename), `parent` + ParentHeader + LinkChildForm (ParentDashboard ns),
   `checkout/success` (CheckoutSuccess ns). 4 ns / ~57 keys; 2 `t.rich`
   (checkout `inLibrary`, community `empty`); ICU plurals for
   course/student/follower/comment counts; locale-aware relative-times
   threaded via the shared `TFn` param. **Only tail: `demo-checkout/[orderId]`**
   — demo-only payment page (prod uses Stripe-hosted checkout), low priority.
   **Marketplace data-catalog labels DONE (cont.68)** — the
   grade/subject/topic/price/length/rating/format/board/sort *option* labels
   (`@/lib/marketplace`) now translate via a new `MarketplaceCatalog` ns
   (52 keys, keyed by the stable value/slug) + a `MarketplaceFilters` ns
   (filter/sort chrome); wired into the home (chips + featured header),
   `MarketplaceFilters`, `MarketplaceSort`. **`CourseCard` + course-detail
   page DONE (cont.69)** — `CourseCard` made to take pre-translated `labels`
   + `boardLabel` props (it stays a hook-free leaf, so the home/`BrowseClient`
   callers resolve via a new `CourseCard` ns + `boardLabelKey` helper);
   `/course/[slug]` page-body stragglers finished (breadcrumb Grade + board,
   Not-yet-rated, By [rich], Updated [locale date], unit/lesson ICU plurals →
   +6 keys on the existing `CourseDetail` ns). **Course-detail sub-components
   DONE (cont.70) → the ENTIRE learner/public surface is now localized.** The 4
   leaf components got 4 new ns: `EnrollPanel` (buy/enroll CTA + the "includes"
   feature list; map-var `t`→`label` rename), `CurriculumAccordion` (Unit +
   lesson-count ICU plural + FREE PREVIEW), `CourseReviewForm` (rate/stars-aria
   plural/placeholder), `LiveScheduleCard` (made **`async` + `getTranslations`**;
   the module-level recurrence map became message keys). Then the **block-type
   labels** (`@/lib/blocks` BLOCK_GROUPS) — do those alongside the builder.
4. **Course builder** (teacher power tool): **block catalogs + the 2 pickers
   DONE (cont.71)** — `BlockCatalog` ns (4 groups + 16 block-type labels, keyed
   by type), `BlockTemplates` ns (12 starters × label+description, keyed by id),
   `BlockPicker` ns (chrome); wired into `AddBlockPopover` + `BlockLibrary` (the
   data modules keep their English labels as the AI-prompt/server fallback;
   map-var `t`→`tmpl` to free the translator). **`CourseBuilderClient` FRAME
   DONE (cont.72)** — the 4002-line file is multi-part (like BlockReader was);
   the **top bar + outline rail** (`BuilderTopBar` + `OutlineRail` + the sortable
   unit/lesson rows) are localized behind a new `CourseBuilder` ns (~33 keys:
   save/publish, the edit/student view toggle, status badge, unit/lesson CRUD +
   dnd arias + delete confirms, ICU unit/lesson counts + `~N hr`). **Inspector
   Block/Lesson/AI tabs DONE (cont.73)** — `ContextInspector` (tab bar + block
   header, reusing `BlockCatalog` for the block-type label), `LessonPanel`,
   `AIPanel` (the quiz generator + tips); +25 keys on the `CourseBuilder` ns.
   **Course tab DONE (cont.74)** — `CoursePanel` (stats) + `CourseDetailsEditor`
   (the full course-settings form; board/format select options mapped through
   the `MarketplaceCatalog` ns); +30 keys → **the whole inspector rail is
   localized.** **Canvas chrome DONE (cont.75)** — `BuilderCanvas` (empty
   states, lesson header, add-block CTAs, chips) + `CommandMenu` (the "/" block
   picker) + `SortableBlock`/`BlockToolbar`/`ToolbarIcon` (drag arias, TURN-INTO
   menu, dup/delete — `ToolbarIcon` got a `danger` prop so its glyph no longer
   keys off the literal title) + `metaLine` (block meta summaries via a `t`
   param), reusing `BlockCatalog` for type labels/groups; +31 keys. **Block
   previews + error toasts DONE (cont.76)** — the per-type **`BlockBody`** preview
   chrome (empty/fallback states, AI-quiz status, source labels, option
   letters/CORRECT, scenario choices) via `useTranslations("CourseBuilder")` on
   `BlockBody`/`OptionCards`, plus the **13 main-component error toasts** (in-scope
   `t` with a `{msg}` param); authored block content untouched. +45 keys → **the
   whole 4002-line `CourseBuilderClient` is now localized (CourseBuilder ns =
   161).** **`BlockInspector` shell DONE (cont.77)** — the 2647-line file's
   frame (eyebrow, close/deselect, CONTENT/LABEL/notes fields, save states,
   move-to-lesson, delete, the Saved toast) + the shared `AppearanceSection`
   (option layout, accent, option toggles) + `BehaviorSection` (adaptive/AI-hints/
   required/retake + XP) under a new `BlockInspector` ns (32 keys; block-type
   label via `BlockCatalog`; map-var `t`→`target` to free the translator).
   **Editors batch 1 DONE (cont.78)** — Reading/Mcq/Slides/Pdf/Poll/Speak/
   Simulation/FreeResponse/Discussion/Section (+51 keys → BlockInspector ns = 83;
   shared option-array chrome factored into reused keys). Remaining in
   `BlockInspector`: the complex array editors (`Quiz`/`AiQuiz`/`Branching`/
   `DragMatch`/`Live`) + the `Video` editor. Then `teacher/courses/new`
   `/new/ai` `/[courseId]/edit` + `teacher/assignments` (`AssignmentsClient`) +
   `teacher/students/[id]`.
5. **Admin power tools**: `admin/branding` (`BrandingEditor`),
   `admin/integrations`, `admin/analytics` (`AdminInsights`/`AnalyticsCharts`).
Big but mechanical — chunk a surface or two per cycle (ICU plurals +
locale-aware dates where present). This is the honest "100%".

### R56 · Localize page `<title>` metadata · Status: OPEN · LOW
Every page sets a static `metadata = { title: "X · Lyceum" }`, so the browser
tab stays English even when the body localizes. Convert user-facing routes to
async `generateMetadata` + `getTranslations`. Low priority (tab title, not
content); bundle opportunistically with R55 per route.

### R57 · Content-Security-Policy (the R50 tail) · Status: OPEN · MED-LOW
R50 shipped HSTS/X-Frame/etc. but no CSP, because the app styles via pervasive
inline `style={{}}` and emits JSON-LD via `dangerouslySetInnerHTML` — a real
CSP needs a nonce strategy or a refactor away from inline styles. Start
**report-only** to measure violations before enforcing. Genuine hardening, a
real chunk of work, not urgent.

### Verified clean in the P9 pass (don't re-audit)
- `<html lang={locale}>` is set from `getLocale()` (root layout) — the lang
  attribute is correct for a11y/SEO across en/es/hi.
- KNOWN_ISSUES **S1 tier is clear** (S1-1 prod TLS verified removed
  2026-06-16; S1-2/S1-3 resolved).
- Unchanged user-owned carry-overs: **R44** (transactional email), **R54**
  (`sslmode=verify-full` pin), **R31** (WhatsApp keys — blocked).

---

## Verified clean on 2026-06-12 — don't re-audit without cause

- **AuthZ:** every teacher/admin mutation re-checks ownership
  (`authorId !== ctx.user.id` + ADMIN bypass) — teacher.ts, admin.ts,
  payment.ts, lesson.ts all consistent. proxy.ts role-gates page routes.
- **Webhooks:** Stripe + Razorpay + Mux verify signatures before any side
  effect; refuse outright when the secret is unset; event-dedup via the
  `StripeEvent` ledger (insert-before-act, P2002 → 200).
- **Crons:** all `/api/cron/*` refuse without `CRON_SECRET` AND a matching
  Bearer token. QStash job route verifies `upstash-signature`.
- **PII routes:** `/api/student/report` self-scoped (no userId param),
  `/api/admin/board-report` admin+institution-scoped,
  `/api/teacher/earnings-export` self-scoped.
- **AI surfaces:** all behind `checkAIQuota` + audited (`ai.*` AuditLog).
- **Honest data:** `student.dashboard` returns real rows or empty states
  (no fabricated plans/skills/assignments); ratings/enrollCount recomputed
  from rows (invariant test `test/honestRatings.test.ts`).
- **Env:** centralized validated access in `lib/env.ts` (two documented
  exceptions).
