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

### R1 · Prod TLS verification disabled — **USER-OWNED** · Status: OPEN
`NODE_TLS_REJECT_UNAUTHORIZED=0` on Vercel Production. Full steps +
verification checklist: `KNOWN_ISSUES.md` §S1-1. Per policy Claude never
edits Vercel env vars — the user runs this. After the user confirms removal
+ redeploy: smoke a DB page, the tutor stream, and a demo checkout on prod,
then mark DONE here and in KNOWN_ISSUES.

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
  **12 surfaces**.) — the big R20 continuation; extend
  namespace-by-namespace.
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
- **R38 · Accessibility pass** · Status: v1 DONE (cont.41 — `Icon` now
  renders `aria-hidden` [decorative; accessible name comes from the
  wrapping control], `Toggle` is a `role=switch` with `aria-checked` +
  `aria-label` [both ToggleRow callsites pass their visible label].
  Remaining: per-callsite aria-labels on icon-only buttons + non-color
  status companions [StatusPill, plan rows, week strip].) — WCAG-AA
  baseline schools ask for.
- **R39 · Free-response XP reconciliation** (R33 v2) — a teacher score
  override doesn't touch the XP awarded at submit. Decide the policy
  (re-award the delta when the override crosses the 60 pass line, or
  freeze) and reconcile the XPEvent ledger.
- **R40 · Public-route integration tests** — sitemap / robots / .ics / OG
  metadata are only smoke-checked via build artifacts. Add request-level
  tests: .ics 404 on a self-paced course, sitemap excludes DRAFT courses,
  robots disallows /api, course generateMetadata returns the canonical.

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
