# Lyceum — Functionality Gap & Backend Roadmap

This is an audit of every static / hardcoded element in the current prototype and what
it needs to become real. Use it as the build roadmap.

---

## 0. Foundational infrastructure (MUST come first)

These are prerequisites for almost every page becoming real.

### 0.1 Database
- **Currently:** none. Every list is a hardcoded const array in a `.tsx` file.
- **Need:** Postgres (Supabase/Neon/RDS) + Prisma or Drizzle ORM.
- **Core tables:**
  `users`, `accounts`, `sessions`, `roles` (student/teacher/admin/parent),
  `institutions`, `classes`, `enrollments`, `courses`, `units`, `lessons`,
  `blocks` (lesson content blocks), `questions`, `answers`, `attempts`,
  `progress` (per user/lesson), `xp_events`, `streaks`, `badges`,
  `user_badges`, `paths` (multi-course), `path_courses`, `reviews`,
  `assignments`, `submissions`, `notifications`, `messages` (AI tutor),
  `tutor_sessions`, `cohorts`, `mastery` (per user/skill),
  `audit_log`, `consent_records` (COPPA/FERPA), `subscriptions`,
  `payouts` (teacher earnings), `follows` (teacher follows).

### 0.2 Authentication
- **Currently:** "Sign in" and "Start learning" both just navigate to `/student`. Anyone can hit any URL.
- **Need:** auth provider (Clerk, Auth.js, or Supabase Auth) with:
  - Email/password + magic link
  - Google / Microsoft / Apple SSO
  - **Clever / ClassLink SSO** for K-12 (admin compliance card lies — just a label)
  - Parent / guardian accounts with COPPA-compliant onboarding
  - Role-based middleware: students can't reach `/teacher` or `/admin`
  - Session cookies, refresh tokens
- **Replaces:** the fake "Switch role ↗" links in each chrome.

### 0.3 API layer
- **Currently:** zero API routes (no `app/api/*`).
- **Need:** tRPC or Next.js Route Handlers + a typed query layer (TanStack Query).
- Every list/card/stat below should be fetched, with loading / error states.

### 0.4 AI integration
- **Currently:** every "AI" element is decorative. Tutor responses are 2 hardcoded strings; "Generate 5 more" does nothing; "Why this path?" does nothing.
- **Need:** Anthropic Claude (or OpenAI) via server-side SDK, with:
  - Streaming responses for tutor chat (SSE)
  - Tool use for citation lookups (vector store of textbook pages)
  - Structured output for course outline generation
  - Prompt caching for repeated lesson context
  - Cost & rate limiting per user
  - **Tutor logging** to `tutor_sessions` for the FERPA-compliance promise

### 0.5 File / media storage
- **Currently:** every video/image is the diagonal-cross `<ImageBox>` placeholder.
- **Need:** S3 / R2 / Supabase Storage for course thumbnails, lesson videos, PDFs, worksheet packs, user avatars.
- **Video pipeline:** Mux or Cloudflare Stream for adaptive lesson playback, captions, offline download.

### 0.6 Payments
- **Currently:** prices are decoration ("Free", "$19", "$129"). "Enroll & start" doesn't charge anything.
- **Need:** Stripe with:
  - One-time checkout for paid courses
  - Subscription for paths / institutional plans
  - Stripe Connect for teacher payouts (creator economy)
  - Webhook handlers for `payment_intent.succeeded`, `invoice.paid`, etc.

### 0.7 Real-time / background jobs
- **Currently:** nothing live updates. Streak doesn't tick. Notifications never appear.
- **Need:**
  - Pusher / Ably / Supabase Realtime for: notification bell, leaderboard, classmate activity
  - Cron / queue (Inngest, BullMQ): nightly skill-tree re-routing, streak rollover at midnight, weekly analytics rollup, re-engagement nudges
  - Edge function for streaming AI tutor

### 0.8 Email & push
- **Currently:** nothing.
- **Need:** transactional email (Resend / Postmark) for: assignment due reminders, weekly progress, parent reports, teacher payout summaries.

---

## 1. Marketplace home (`/`)

| Element | Current | Needs to be |
|---|---|---|
| AI search bar (`"Help me prep for next week's fractions test"`) | `<form>` redirects to `/student/skill-tree` | POST to `/api/search/ai` → Claude with course/skill embeddings → returns ranked path; render results inline |
| Topic chips (STEM, Reading, …) | Decorative `.wf-chip` spans | `<Link>` to `/?topic=stem`; the page filters `courses` by topic |
| Filter bar (Grade/Subject/Format/Price/Length/Rating) | Static `▾` glyphs in spans | Real `<Combobox>` filters that update URL search params and refetch courses |
| "1,248 courses · sort · POPULAR ▾" | Hardcoded number, no sort menu | Live `count(*)` from `courses` query; sort options: popular / new / rating / price |
| Top picks (4 cards) | Hardcoded `FEATURED` const | `select * from courses where grade=6 and subject='math' order by enroll_count desc limit 4` |
| Multi-course paths (3 cards) | Hardcoded `PATHS` const | `paths` table; show real saved % vs sum of `path_courses` |
| Path progress dots (4/12 filled) | Hardcoded `[1,1,1,1,0,...]` | Per-user enrollment progress for that path |
| Teachers to follow (4 cards) | Hardcoded `TEACHERS` const | `users where role='teacher' order by follower_count`. **Follow button** writes to `follows` table |
| "Recommended for Jordan" card | Hardcoded 3 items | Real recs from user's recent `attempts` + skill mastery deltas |
| "Add to my path" | Navigates to `/student` | Mutation: insert into `path_enrollments`, then route to dashboard |
| Schools CTA "Talk to us" | Navigates to `/admin` | Real contact form → CRM (Hubspot / lead inbox) |
| Sign in / Start learning | Both go to `/student` blindly | Real auth flow; `/student` requires session |
| Search box in header | Static text | `<Combobox>` with semantic search (pgvector or Algolia) over courses + skills + lessons |

---

## 2. Course detail (`/course/[slug]`)

| Element | Current | Needs to be |
|---|---|---|
| Course slug routing | Only 4 slugs hardcoded; any other shows fallback | `getStaticParams` + DB lookup; 404 for unknown |
| Course preview video | `<ImageBox kind="video">` placeholder | Mux player with HLS, captions, scrub |
| Star rating, "(2,184)" | Hardcoded | `avg(reviews.rating)`, `count(reviews)` |
| "Updated 3 weeks ago" | Hardcoded | `course.updated_at` formatted with `date-fns` |
| "What you'll master" bullets | Hardcoded array | `course.learning_outcomes` JSON column |
| Curriculum (collapsible units) | Open/close works; Unit 1 lessons hardcoded | Real `units` + `lessons` query; clicking lesson → `/student/lesson/[id]` (gated by enrollment) |
| "FREE PREVIEW" tag | Static label | `lesson.is_preview === true` flag; preview lesson playable without auth |
| Reviews (2 cards) | Hardcoded | `reviews` table with pagination, sorting (most helpful, newest), reply threads |
| "Enroll & start" button | Navigates to `/student` | Stripe Checkout for paid; instant enroll for free; writes `enrollments` row; redirects to `/student/lesson/[firstLesson]` |
| "Add to library" | Does nothing | Insert into `library` (wishlist / saved) |
| Sticky enroll card "AI says: matches your skill level — start at Unit 2" | Static text | Real AI placement test result; or a quick diagnostic that runs against user's mastery vector |
| "This course includes" list | Hardcoded counts | Computed from `lessons.count`, `quiz_questions.count`, `mini_games.count` |

---

## 3. Student dashboard (`/student`)

| Element | Current | Needs to be |
|---|---|---|
| "Welcome back, **Jordan**" | Hardcoded name | `session.user.first_name` |
| "Tuesday · May 8" | Hardcoded | `new Date()` formatted in user's TZ |
| AI nudge ("1 quiz away from Fractions III") | Hardcoded sentence | Server-side rule engine: pull next-unlocked skill from skill graph |
| "Start warm-up" button | Goes to lesson page | Generates a 3-question warm-up quiz dynamically (Claude) |
| Search bar in header ("⌘K") | Static | Command palette (kbar / cmdk) over lessons, skills, AI tutor; ⌘K shortcut |
| Streak chip "14 day streak" | Hardcoded | `streaks` table; cron at midnight increments or breaks |
| XP chip "2,480 XP" | Hardcoded | `sum(xp_events.points)` for user |
| Avatar JR | Static initials | `session.user` avatar image / initials |
| Notification bell | Decorative | Real `notifications` query; unread badge; dropdown panel; mark-as-read |
| **Continue learning** (3 cards) | Hardcoded array | `enrollments` ordered by `last_activity_at desc limit 3` |
| Card progress % and "12 min left" | Hardcoded | `progress.completed_lessons / total_lessons`; estimate from remaining lesson durations |
| **Today's plan** (4 rows) | Hardcoded; "Start" only mutates local state | `daily_plan` table generated by nightly job; "Start" creates `attempt`, navigates to lesson; completion writes back and updates streak/XP |
| `state: "now" / "done" / "next"` | Local React state | Persisted per-day rows; survives reload |
| **Skill mastery** (5 strands) | Hardcoded percentages | `mastery` table (Bayesian Knowledge Tracing or Elo-style estimate per skill) |
| **Due this week** (4 assignments) | Hardcoded; not clickable | `assignments` for student's `class_id`, ordered by `due_at`; click → submission flow |
| "Your week" streak strip | Hardcoded 5/7 days | `streaks` daily activity log |
| Day streak / Total XP / Level cards | Hardcoded | Live from DB; level computed from XP curve |
| **AI Tutor card** | Input does nothing; chips static | Click → opens a side-sheet tutor chat (same component as lesson page) with full conversation history |
| Quick reply chips ("Explain that quiz Q") | Static | Each chip kicks off a real Claude prompt with context attached |
| **Class leaderboard** (5 entries) | Hardcoded | `select user, weekly_xp from class where class_id = ... order by weekly_xp desc limit 10`; "You" row highlighted; opt-out toggle |
| **Recent badges** (3 of 47) | Hardcoded; "47" total fake | `user_badges` join `badges`; total count real |
| "Switch role ↗" demo links | Direct navigation, no auth | Remove or gate behind admin impersonation feature |

---

## 4. Lesson view (`/student/lesson/[lessonId]`)

| Element | Current | Needs to be |
|---|---|---|
| Lesson lookup | 3 hardcoded lessons; fallback to `multiplying-fractions` | DB lookup; 404 if not enrolled |
| Course/unit breadcrumb | Hardcoded `MATH 6 · UNIT 4 · LESSON 5` | From `lesson → unit → course` joins |
| **TOC steps** (7) | Hardcoded states (`done/current/locked`) | Per-user step progress; clicking jumps between steps |
| Lock icons | Static | Real gating: `step.unlocks_at > now()` or prerequisite step not complete |
| AI sparkle on "Mini-game: Pizza Slices" | Static icon | Mini-game block actually loads a separate runtime |
| Step counter "Step 4 of 7 · Practice question 3 of 8" | Hardcoded | Computed from `attempt.position` |
| **Pizza pie SVG** | Renders 4 pies but slices are NOT actually draggable | `react-dnd` or `framer-motion` drag; touch support; record student model in `attempt.work_log` |
| "Drag slices to model" annotation | Static | Hide once student has interacted |
| **Answer choices A/B/C/D** | Local `selected` state; correct/incorrect feedback works | Persist `attempt`: question id, chosen answer, time-to-answer, hint count; XP awarded server-side; rate-limit retries |
| "Hint from AI" | Sends hardcoded user message | Streams a Claude completion with question + student's prior attempts as context, scaffolded to *not* reveal the answer |
| "+20 XP" success message | Just text | Actually inserts `xp_event`, animates the dashboard's XP chip via realtime |
| "Check answer" disabled until selected | Works locally | Same, but server-validates |
| "Next question →" | Resets state; no actual next | Loads next question from `questions where lesson_id and order > current`; if last, → end-of-lesson summary screen |
| **AI Tutor chat** | 2 canned responses; "send" appends a 1-shot canned reply | Streaming Claude responses with: lesson context, student's recent attempts, citation tool calls returning real textbook page refs |
| "Cited: Math 6, Unit 4, p. 142" | Static string | Real citations from RAG over course materials |
| Tutor input (text) | Local state only | POST to `/api/tutor/message` (SSE stream back); message history persisted in `tutor_sessions` |
| Mic icon | Decorative | Web Speech API or Whisper streaming for voice input |
| Quick reply chips ("Why × not +?") | Hardcoded; clicking sends message | Generated dynamically based on conversation state |
| "Pin", "Offline", "Notes" buttons | Do nothing | Pin to "saved lessons"; offline = service-worker cache + Mux offline track; Notes = a per-lesson rich-text notebook (Tiptap/Lexical) |
| XPChip "120 XP" in header | Hardcoded | Lesson's reward, fetched |

---

## 5. Skill tree (`/student/skill-tree`)

| Element | Current | Needs to be |
|---|---|---|
| 13 nodes | Hardcoded layout (col, row, state) | Pulled from a `skills` graph; `user_skill_progress` provides state per user |
| Node states (done/now/unlocked/locked) | Hardcoded | Computed from prerequisites + mastery thresholds |
| Bezier connectors | Static SVG | Same SVG layout, but nodes/links from query; auto-layout (Dagre / ELK) for arbitrary graphs |
| Node click | None | Click → opens side panel with: lessons under skill, mastery %, recommended next, "Start lesson" |
| "23/64 skills mastered", "L7", "14d", "~36% to Level 8" | Hardcoded stats | Computed from progress |
| "AI re-routes path nightly" annotation | Just decoration | Real cron job that rewrites a personalization layer over the static graph based on prior week's performance |
| **"Why this path?"** button | Does nothing | Calls Claude with student's recent attempts + skill graph; returns natural-language explanation in a modal |
| "Year overview" button | Does nothing | Toggles to a year-long calendar/Gantt view of pacing |
| AI annotation post-it on canvas | Hardcoded text | Generated with the personalization layer (which signal triggered the branch choice) |
| Boss node "Ratios & Proportions" | Just a styled pill | Trigger condition: all parents mastered; opens a timed unit test (different UI) |
| Pan/zoom canvas | Static; no zoom | `react-zoom-pan-pinch` or custom; remember viewport per user |

---

## 6. Teacher course builder (`/teacher/courses/[courseId]/edit`)

| Element | Current | Needs to be |
|---|---|---|
| Course routing | 1 hardcoded course | Multi-course list at `/teacher/courses`; per-course CRUD; teacher can only edit their own |
| Title / summary / chips | Hardcoded | Editable fields; autosave to DB on blur (Yjs or simple debounced PUT) |
| **14 block types** in library | `draggable` attr but no drop logic | Real drag-and-drop (`@dnd-kit`); on drop, insert a `block` row with default content; click block to edit |
| AI quiz / AI roleplay (purple) | Just visual | Spawns an AI authoring flow (prompt → generate questions / scenario branches → editor) |
| **Units** | Hardcoded 5; expand/collapse works locally | Real CRUD; reorder via drag; rename inline; delete with confirm |
| Lessons under Unit 1 | Hardcoded 4 rows | Per-unit `lessons` query; same drag/reorder/rename |
| Drop zone "+ DROP A BLOCK HERE" | Visual hatch | Active drop target; drop adds a block at that position |
| **"Add unit"** | Does nothing | Inserts new unit; auto-scrolls; focus title for inline rename |
| **"Saved 14s ago"** | Hardcoded | Real autosave timestamp; shows "Saving…" / "Saved" / "Failed" with retry |
| **"Preview as student"** | Does nothing | Opens new tab at `/student/lesson/[id]?preview=true` with teacher impersonating student state (no XP awarded) |
| **"AI assist"** | Goes to /teacher/courses/new | Should be a side-panel that generates content for the *currently selected* lesson (not a new course) |
| **"Publish →"** | Does nothing | Toggle `course.status` from `draft` to `published`; triggers cache revalidation; emails followers |
| **Inspector panel** | Form fields hardcoded | Bound to selected `block`; selection state in URL (`?block=...`); changes autosave |
| **Toggle switches** | Local state, doesn't persist | Each toggle is a `block.settings` JSON key; PUT on change |
| Question list (Q1/Q2/Q3) | Static bars | Real questions; click → opens question editor (stem, answers, correct, hints, difficulty) |
| **"Add question"** | Does nothing | Adds a question; opens editor |
| **"Generate 5 more with AI"** | Does nothing | Calls Claude with current quiz context; previews 5 candidates; accept/reject each |
| AI suggestions card "This quiz is at L4. Add 3 L2 questions" | Hardcoded | Real difficulty estimator + suggestion engine |
| **"Apply suggestion"** | Does nothing | Inserts the 3 suggested questions; user can edit before saving |
| Drag handles (`Icon name="drag"`) | Visual only | Bound to dnd-kit listeners |

---

## 7. AI course generator (`/teacher/courses/new`)

| Element | Current | Needs to be |
|---|---|---|
| **Step 2 of 4** | No actual steps; "Continue → Step 3" goes nowhere | Multi-step wizard with state in URL or a `course_drafts` row: 1) basic info, 2) outline, 3) lesson detail, 4) review/publish |
| Prompt textarea | Editable, but doesn't submit | Submits to `/api/generator/outline` → Claude returns structured outline |
| Settings (Grade level, Subject, Standard, Length, Style, Tone, Difficulty curve) | Display-only | Real form controls; saved with draft; passed as system prompt context |
| Chips (`+ Add lesson plan`, `+ Reference textbook`, `+ My standards`) | Decorative | Each opens a picker: upload PDF lesson plan, choose textbook for citations, link standards (CCSS / NGSS / state) |
| **"Regenerate outline"** | Reverses the array client-side | Calls Claude again with full settings; loading state; shows diff vs prior version |
| Per-item ✦ regenerate | Adds " (rev)" suffix | Regenerates just that unit (title + sub + count) with the rest of the outline as context |
| Per-item cog | Decorative | Opens unit settings (skill standards, est duration, prerequisites) |
| Drag handles on units | Visual | dnd-kit reorder; persist order |
| **"Continue → Step 3"** | Does nothing | Creates `course` + `units` rows, navigates to step 3 (per-unit lesson detail generation) |
| **"Save & edit manually"** | Does nothing | Same DB writes, redirects to `/teacher/courses/[id]/edit` |
| **"Save draft"** | Does nothing | Upserts `course_drafts` row |
| "Generated in 3.4s" | Hardcoded | Real timing of last generation |
| AI "heads up" callout | Hardcoded text | Real moderation/guidance pass over the generated outline |

---

## 8. Teacher analytics (`/teacher/analytics`)

| Element | Current | Needs to be |
|---|---|---|
| KPI strip (5 cards) | Hardcoded values + deltas | Aggregated SQL: `count(distinct user) where last_active > now() - 7d` etc. Date range comes from filter |
| Filter chips (All courses ▾ / Last 30 days ▾ / All cohorts ▾) | Static | Real popovers; URL search params; refetch on change |
| **Engagement line chart** | Math.sin pseudo-random | Real time-series from `events` table aggregated by day; legend toggleable |
| **Drop-off funnel** | Hardcoded stages | Per-course funnel: enroll → start L1 → finish U1 → … → completed; "biggest drop" auto-detected (max delta) |
| Course performance (3 rows) | Hardcoded | Real per-course `enrollments`, `avg(rating)`, `completion_rate` |
| Course thumbnails | `<ImageBox>` | Real `course.thumbnail_url` |
| **AI insights** (3 cards) | Hardcoded | Generated by daily AI summary job over the teacher's analytics: pattern detection (stuck points), revenue opportunities, at-risk students |
| **"Suggest fix"** | Does nothing | Opens a draft of recommended changes (e.g. "Add scaffolding lesson before L14"); accept → adds to course builder |
| **"Add upsell"** | Does nothing | Wizard: pick paid course, set discount, generate landing CTA inserted at end of free unit |
| **"Send nudge"** | Does nothing | Composer for re-engagement email with templated message; mailing list = at-risk segment |
| **"Export CSV"** | Does nothing | Streams CSV of currently filtered data |
| Earnings · MTD ($3,124) | Hardcoded | Stripe Connect balance; click → earnings detail page |

---

## 9. Admin dashboard (`/admin`)

| Element | Current | Needs to be |
|---|---|---|
| Institution name "Cedar Middle" | Hardcoded in chrome | `session.user.institution.name` |
| Plan "SCHOOL · 320 seats" | Hardcoded | Real subscription tier + seat count from billing |
| KPI strip (6 cards) | Hardcoded | Real aggregations across institution |
| Filter chips (Spring 2026 ▾ / All grades ▾) | Static | Term + grade filters; refetch all panels |
| **Mastery heatmap** | `Math.sin` pseudo-random | Real `mastery` aggregated by class × skill; click cell drills into class roster |
| AI insights · principal brief (3) | Hardcoded | Daily AI summary job over institution data |
| **Teachers · activity** (4 rows) | Hardcoded; not clickable | Real `users where role=teacher`; click → `/admin/people/[teacherId]` |
| Top / low engagement tag | Hardcoded "top"/"low" | Computed from teacher engagement deciles |
| **Adopted curricula** (4 rows) | Hardcoded; "Add" does nothing | `institution_curricula` join; "Add" opens marketplace picker |
| Curriculum progress % | Hardcoded | Avg of student progress across enrolled classes |
| **Safety & compliance** | All "Compliant"/"Connected" | Real status from integrations + consent records: SSO actually connected? `consent_records` count vs roster? AI tutor logs being written? |
| **"Board report"** | Does nothing | Generates PDF with KPIs + heatmap + insights for trustees; via Puppeteer / react-pdf |
| **"Invite teacher"** | Does nothing | Modal: email + role + classes; sends invite email with signup link |
| Avatar CM | Decorative | Real admin profile menu (settings / sign out / impersonate teacher for support) |
| Side-nav People / Curriculum / Classes / Analytics / Integrations / Branding / Billing | All 404 | Each is a real CRUD page |

---

## 10. Cross-cutting features missing entirely

| Feature | What's needed |
|---|---|
| **Auth pages** | `/login`, `/signup`, `/forgot-password`, `/verify`, `/onboarding` (role-specific) |
| **Mobile nav** | Sidebar always visible; needs hamburger + bottom-tab on mobile (the wireframe shows mobile screens that aren't built) |
| **Mobile dashboard / lesson / marketplace** | Wireframe has `StudentDashboardMobile`, `LessonMobile`, `MarketplaceMobile` — none implemented |
| **404 / error / loading states** | Every dynamic route should have `not-found.tsx`, `error.tsx`, `loading.tsx` |
| **Empty states** | "No courses yet", "No assignments due", "No notifications" — not designed/implemented |
| **Accessibility** | Many `<div onClick>` need `<button>`; missing aria-labels on icon buttons; focus states; keyboard nav for skill tree |
| **i18n** | Spanish course content shown but no `next-intl` setup; en/es/fr at minimum |
| **Notifications** | Bell icon but no panel, no real-time, no preferences page |
| **Settings page** | `/settings` for student + teacher + admin: profile, password, email prefs, parent contacts, COPPA consent, AI tutor logging opt-out |
| **Parent portal** | Wireframe mentions parent consent and "Sarah M., Parent" review — no parent role exists in app |
| **Discussions** | Teacher nav item "Discussions" + lesson block type "Discussion thread" — no implementation |
| **Live sessions** | Block type exists; needs Zoom / Daily.co integration |
| **Speech / record** | Block type for "Speak" practice; needs Whisper transcription + pronunciation scoring |
| **Offline mode** | Lesson "Offline" button promises offline; needs service worker + Mux offline tracks + IndexedDB attempt sync |
| **Print / worksheets** | "Printable worksheet pack" promised on course detail; needs PDF generation |
| **Search** | Header search box on every page is decorative; needs typesense / pgvector / Algolia indexing of courses + lessons + skills |
| **Audit log** | FERPA "AI tutor logging Enabled" promise needs a real append-only log of every tutor message + admin export |
| **Rate limiting** | AI endpoints will be expensive; need per-user/per-IP limits (Upstash) |
| **Background jobs** | Streak rollover, weekly progress emails, nightly skill-tree re-routing, AI insight generation, leaderboard reset — none exist |
| **Webhooks** | Stripe payment events, Mux video ready events |
| **Image optimization** | Currently no real images; once added, use `next/image` with proper sizes |

---

## Recommended phasing

Rough order to make the prototype feel real without trying to build everything at once.

### Phase 1 — Make it real (4-6 wk)
1. DB + Prisma + seed scripts
2. Auth (Clerk or Auth.js) with student/teacher/admin roles
3. tRPC API; replace ALL hardcoded arrays on marketplace, course detail, dashboard with real queries
4. Course enrollment flow (free first, Stripe later)
5. Real lesson progression: complete a lesson actually advances next lesson, awards XP, updates streak
6. Loading / error / 404 states everywhere

### Phase 2 — AI everywhere (3-4 wk)
1. Tutor chat: streaming Claude with lesson context + citations from a vector store
2. AI course generator: working prompt → outline → save flow
3. AI insights for teacher analytics + admin dashboard (nightly cron)
4. AI search on marketplace ("Help me prep for fractions test" → real curated path)
5. "Why this path?" / "Hint from AI" / "Generate 5 more"

### Phase 3 — Creator economy (2-3 wk)
1. Teacher course builder: real CRUD, dnd-kit, autosave
2. Stripe Connect for teacher payouts
3. Followers, storefronts, reviews, course publishing

### Phase 4 — Institution (2-3 wk)
1. Admin CRUD pages (people, curriculum, classes, integrations, billing)
2. Real heatmap from aggregated `mastery`
3. SSO with Clever / ClassLink
4. Board report PDF generation
5. Compliance: consent records, audit log, AI tutor logs, retention job

### Phase 5 — Polish & growth (ongoing)
1. Mobile screens (dashboard, lesson, marketplace)
2. Discussions + live sessions
3. Offline mode
4. Speech recognition
5. Parent portal
6. i18n
7. Email + push notification preferences

---

## Phase 6 — Launch Readiness & Growth (current)

> Phases 1–5 delivered the product itself — authoring, student reader, marketplace,
> Stripe payments, institution admin, and most Phase-5 polish. **Phase 6 is the path
> from "feature-complete on a dev box" to "safe to put real K-12 students and real
> money through it," then growth breadth.** Sub-phases are ordered by launch-criticality:
> **6.1–6.3 gate a real launch; 6.4–6.5 are post-launch growth, pickable à la carte.**

### 6.1 Activate built-but-dark features (credentials & accounts) · ~1 session

*Each item below is already wired and gated behind a missing credential — flipping the
key turns the feature on. Highest value-to-effort in the whole phase.*

- **Resend** (`npm i resend` + `RESEND_API_KEY`) → invoice emails, parent self-invite token flow, weekly digests. Code lives in `lib/email.ts` (lazy client; logs-and-skips until the key exists).
- **`ANTHROPIC_API_KEY` (prod / Vercel)** → real AI tutor, quiz-gen, course generator, marketplace AI search. Without it every AI surface silently serves its demo fallback. Watch the empty-string-shadows-`.env` gotcha (`@next/env` won't override an already-set empty var).
- **Stripe go-live** → activate the test account (`charges_enabled=false` today) + enable Connect so teacher payouts actually move money. Test-card charges already work end-to-end; this is Dashboard activation, not code.
- **Mux (in-flight)** → keys are added; remaining: verify the upload→transcode→play loop, then build `/api/mux/webhook` (instant finish if the teacher closes the tab) + **signed playback** (protect paid-course video). Hooks in `src/lib/video/mux.ts`.
- *Exit criteria:* a real receipt lands in an inbox · a prod tutor reply is non-canned · a test payout reaches a Connect account · an uploaded video plays back from Mux.

### 6.2 Production hardening (launch blockers) · ~1 session

*Can't responsibly take real traffic / PII without these.*

- **Error monitoring** — wire Sentry (server + tRPC + edge). ~1 hr; Next.js has first-class integration.
- **Rate limiting** — Upstash on the AI endpoints; **start with `src/app/api/tutor/stream/route.ts`**, which has no limiter today (direct, unbounded LLM-cost exposure).
- **DB backups** — nightly `pg_dump` of managed Postgres → object storage + one rehearsed restore drill.
- **TLS smell** — chase the recurring prod `Warning: SECURITY …` emitted on every request (likely `NODE_TLS_REJECT_UNAUTHORIZED=0` disabling cert verification app-wide). Find the source, scope it narrowly or remove it.
- *(Vercel deploy — ✅ **already done**; live on `lyceum-kappa.vercel.app` with managed Postgres. Tier 3.4 in `AGENT_NOTES.md` is stale on this point.)*
- *Exit criteria:* an induced error appears in Sentry · tutor spam returns 429 past the limit · a restore boots clean · prod request logs are warning-free.

### 6.3 Compliance & trust (K-12 critical) · ~1–2 sessions

*This is a children's-data product — these gate institutional adoption, not just polish.*

- **SSO** — Google + **Clever / ClassLink** (the K-12 rostering standards). `auth.ts` is credentials-only with an explicit `// Production TODO` (search `DEV_ONLY` for the swap point); the admin "compliance" card is currently just a label, not a real connection.
- **Settings page** (`/settings` — does not exist yet) — profile, password change, email preferences, **COPPA consent**, and AI-tutor-log opt-out. Per-role variants (student / teacher / admin / parent).
- *(Audit log is already real — `audit.ts` / the closed `AuditKind` union.)*
- *Exit criteria:* a Clever test login provisions a session · a user can view + change consent and opt out of tutor logging.

### 6.4 Reach & polish (growth breadth) · ongoing

- **Mobile** — the app is desktop-first (grid layouts, fixed widths). Build the wireframe's mobile dashboard / lesson / marketplace screens + hamburger / bottom-tab nav. Audit before committing; ~1–2 sessions.
- **i18n** — `next-intl` scaffold; en + es first (Spanish course content is already surfaced in the UI). No internationalization exists today — every string is en-US.
- **True offline lesson reading** — the PWA install shell is done (`public/sw.js`, network-first nav → `offline.html`). Remaining: precache lesson/block JSON + an attempt-sync queue (IndexedDB → replay on reconnect).
- **Admin Branding** (`src/app/admin/branding/page.tsx` — the lone remaining `ComingSoon` stub) — accent-color + institution name are buildable now; logo upload / sign-in background / vanity domain need asset storage (S3 / R2) + DNS wiring first (overlaps 6.5's PDF/asset pipeline).
- *Exit criteria:* a lesson is usable at 375px · a locale toggle flips a page · an airplane-mode lesson reads and syncs its attempts on reconnect.

### 6.5 Rich media & content tooling · ongoing

*Block types that render but have no backend, plus document export.*

- **Live sessions** — Zoom / Daily.co integration behind the `LIVE` block (room create + join + recording link).
- **Speech practice** — Whisper transcription + pronunciation scoring behind the `SPEAK` block.
- **PDF generation** — printable worksheet packs (promised on course detail) + the admin **Board report** (KPIs + mastery heatmap + insights for trustees). react-pdf or Puppeteer; also unblocks the Branding asset pipeline in 6.4.
- *Exit criteria:* a LIVE block launches a real room · a SPEAK attempt returns a score · a Board report downloads as a PDF.

### 6.6 Engineering debt & deferred refactors · opportunistic

*Not launch-blocking — fold each into the feature work that already touches the same
surface, rather than running it as a standalone sprint. All small; most are trigger-driven.*

- **Block reorder across lessons** (Tier 4.2 · ~1 session) — today reorder is within-lesson only. Add a `teacher.moveBlock({ blockId, toLessonId, position })` mutation (mirror the `addBlock` ownership check) + a "Move to lesson…" affordance in the builder. *Do alongside any other CourseBuilder work.*
- **Drag-template-from-library v2** (Tier 4.1 · ~1 session · low priority) — click-to-insert already covers the workflow; this adds dragging a template card straight onto a lesson row. Requires collapsing the 3 nested `DndContext`s (units / lessons / blocks) into one top-level context with prefixed draggable ids + a master `onDragEnd`. *Defer until a teacher actually asks.*
- **`BlockSettingsShape` → discriminated union** (Tier 4.5 · ~1 session · ⚠ partially mitigated) — the compile-time *correctness* pain is already handled by `SettingsFor<T>` + `settingsFor()`; what remains is the structural cleanup of the ~20-optional-field union into a `Block.type`-keyed discriminated union. Pure type-level, no data migration. *Low urgency — do during a typing pass.*
- **Real `chosenIndex` / `subIndex` columns** (Tier 5.3 · ~1 session incl. backfill) — `Attempt.chosenKey` is one string overloaded across 5 encodings (`"subIdx:choiceIdx"`, `"drag:N/M"`, `"branch:<nodeId>"`, …). **Trigger:** the first analytics query that needs structured access (e.g. "% correct on Q3 of AI_QUIZ X"); then add the typed columns + a one-shot backfill. *Don't pre-build — wait for the query that needs it.*
- **Background-job crons** (mixed sizes) — only the embeddings sweep is scheduled (Vercel Cron, hourly). Still unscheduled: **streak rollover** (midnight break/rollover — engine exists in `services/streakEngine.ts`, just needs a trigger), **weekly progress emails** (⛓ gated on 6.1 Resend), **nightly skill-tree re-route** (the personalization layer), **AI-insight generation** (⛓ gated on 6.1 `ANTHROPIC_API_KEY`). *Schedule each when its dependency lands — two ride along with 6.1.*

### Sequencing

**6.1 → 6.2 → 6.3 are the launch gate** — do these before any real-student cohort touches the platform. **6.4 and 6.5 are post-launch growth**, parallelizable and pickable in any order once the gate is cleared. **6.6 is opportunistic / continuous** — each item is cheapest done while you're already in that surface (and two of its crons ride along with 6.1's credential activation), so there's no standalone "do 6.6" milestone.

---

## Quick fixes that make it feel less fake without backend

If you want some immediate "feels real" improvements before building backend:

- Persist Today's plan / lesson selections / course builder state to **localStorage** so refresh doesn't reset everything.
- Make the AI tutor use a **client-side mock LLM** with varied (but still canned) responses based on keyword matching.
- Replace `Math.sin` heatmap and chart with **deterministic seeded fixtures** that look like real data.
- Add **`<Suspense>` + skeleton screens** so the UI feels like it's loading data.
- Make `Date.now()` drive the date in the header so it's not stuck on May 8.
- Wire chips and filters to **client-side filtering** of the hardcoded arrays (still static, but feels interactive).
- Add basic **client-side route guards** (redirect to `/login` mock) so role-switching isn't a free-for-all.
