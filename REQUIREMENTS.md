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

### R10 · Password reset + email verification · Status: OPEN
No forgot-password flow; signup never verifies the address. The
`VerificationToken` table exists, unused. Gate on `RESEND_API_KEY` like
every other integration (hidden link when email is dormant). Includes:
reset-request page, tokened reset page, verification email on signup with a
"verified" nudge (don't hard-block login on it for K-12 friction reasons).

### R11 · Signup age/consent gate (COPPA / India DPDP) · Status: OPEN
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

### R13 · "Today's plan" generator · Status: OPEN
`student.dashboard.todaysPlan` is hardcoded `[]`. Deterministic v1 service
(no AI needed): next lesson of most-recent in-progress course → weakest
`Mastery` skill drill → due assignment (R12) → streak-saver if streak at
risk. 3–5 items, tested. The dashboard already renders `TodaysPlan` when
non-empty.

### R14 · Real recommendations · Status: OPEN
`marketplace.recommendedFor` ignores the user (top-rated only; honest copy
admits it). Personalize: subjects/grades from enrollments + weak skills from
attempt accuracy → matching published courses; fall back to top-rated for
anon.

### R15 · ⌘K command palette · Status: OPEN
Header search exists per-chrome; a global cmd-K palette (courses, lessons,
"ask tutor", nav) is cheap differentiation — wire R8(a) into it.

### R16 · Typed attempt columns (KNOWN_ISSUES S2-3) · Status: OPEN
`Attempt.chosenKey` overloads 5 string encodings; add `chosenIndex`/
`subIndex` int columns + backfill **before** building any analytics that
parses answers.

### R17 · Course thumbnail imagery story · Status: OPEN
Gradient fallback is tasteful but uniform. Options: per-subject illustration
set, or AI-generated course art at publish time (cache to blob storage).

---

## P3 — strategic bets

- **R18 · Design-system tokenization** — thousands of inline `style={{}}`
  objects are why mobile + theming are hard. Migrate hot paths to Tailwind
  classes / shared primitives as they're touched (R7 first). Prereq for any
  serious redesign.
- **R19 · Persona-split visual language** — student surfaces go game-like
  (big, tactile, motion, streak ritual — Duolingo/Brilliant energy);
  teacher/admin stay information-dense. Sharpest available differentiation
  vs incumbents.
- **R20 · i18n + Hindi/vernacular** — string extraction first (next-intl),
  Hindi pilot, then regional. Huge India differentiator.
- **R21 · Board alignment** — CBSE/ICSE/state-board tags on Course +
  filters/search facets; it's how Indian parents actually shop.
- **R22 · Offline-first lessons** — extend the existing service worker to
  pre-cache enrolled-course reader content; low-bandwidth mode (no video
  autoload).
- **R23 · WhatsApp notification channel** — streak nudges, assignment due,
  parent weekly digest. India table stakes; needs WhatsApp Business API.
- **R24 · AI moat expansions** — syllabus-paste → full unit drafts;
  free-response auto-grading; adaptive difficulty on quiz decks; the
  citations-backed tutor as the schools-trust story.
- **R25 · Cohort/live delivery mechanics** — `Course.format` ("live" |
  "cohort") exists with zero scheduling/meeting machinery behind it. Either
  build (schedule + meet links + calendar) or hide the formats until real.
- **R26 · Parent self-service linking** — invite-token flow (parent links
  their own kid); admin-only today (`admin.linkParentToChild`).
- **R27 · Earnings-export polish** — `/api/teacher/1099` is US-framed
  (`dollars()`, "1099") on an INR product. Rename to earnings export,
  format via `lib/currency.ts`. Cosmetic.
- **R28 · Stripe dormant-path polish** — drop `payment_method_types:
  ["card"]` (let Stripe pick dynamic methods) and wire real Stripe refunds
  via the API when the international phase wakes Stripe up.

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
  `/api/admin/board-report` admin+institution-scoped, `/api/teacher/1099`
  self-scoped.
- **AI surfaces:** all behind `checkAIQuota` + audited (`ai.*` AuditLog).
- **Honest data:** `student.dashboard` returns real rows or empty states
  (no fabricated plans/skills/assignments); ratings/enrollCount recomputed
  from rows (invariant test `test/honestRatings.test.ts`).
- **Env:** centralized validated access in `lib/env.ts` (two documented
  exceptions).
