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
| Last session | 2026-05-17 — **Block CRUD closes the read-loop on click-to-add.** Adds `teacher.deleteBlock({ blockId })` and extends `teacher.course` to include the actual `blocks` list per lesson (id/type/order). Builder now renders an inline list of blocks under each lesson with a × delete button; deletes are optimistic (no snap-back on error — surfaces the message but lets the user retry). `BLOCK_GROUPS` + `findBlockMeta` extracted to `src/lib/blocks.ts` so `AddBlockPopover` and the inline list share one catalog. Delete intentionally leaves order gaps (sparse) — single UPDATE, no $transaction. **Earlier same day**: click-to-add-block v1 (addBlock mutation + AddBlockPopover); entire Phase 1 polish bucket closed (P1-14 filter popovers, P1-15 header search Combobox, P1-13 topic chip URL filter, P1-28 drag-drop course builder). |
| Phase | **Phase 1: 100% complete** (every checklist item including the polish bucket). **Phase 2 complete.** **Phase 3 v1 shipped** (demo + Stripe Connect wired; real mode needs `npm i stripe` + keys). |
| Branch | `main` (P1-28 changes uncommitted — see git status) |
| Dev server | `npm run dev` — port 3000, Turbopack. Postgres port **5433** via Docker. **IMPORTANT:** Prisma client is module-cached at first import — after any `schema.prisma` change, run `npx prisma generate` AND restart `next dev`, otherwise the running server's in-memory client sees the old schema (we hit this with `Unknown field stripeAccount` after Phase 3 merge — diagnosis + fix in the gotchas block below). |
| Last passing | `tsc --noEmit` clean. Reorder probe round-trips both unit + lesson order through the live DB. Phase 3 demo checkout creates Order(PENDING) → flips PAID + Enrollment row → success page. Teacher earnings page reads aggregates from real Order rows; EarningsClient renders Connect onboarding CTA / READY FOR PAYOUTS depending on per-teacher `StripeAccount`. |
| In flight | none |
| Next up | Phase 3 polish (1099 export, invoice email — both need email/PDF primitives, Phase 4 territory) OR low-pri P1 polish (P1-13/14/15) OR Phase 4 scope (parent role, refund self-service, real Stripe smoke test with `npm i stripe`). |
| Blockers | Real-Stripe mode needs `npm i stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in `.env.local`. Demo mode runs without any of that. |

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
- [x] P1-28 Drag-drop builder — `@dnd-kit/{core,sortable,utilities}` installed; `teacher.reorderUnits` + `teacher.reorderLessons` persist on drop; nested sortable contexts (units list outer, per-unit lessons inner) so a lesson drag never reorders units. Drag handle = the `drag` icon, PointerSensor activation distance 6px. **Block CRUD on top of P1-28:** `teacher.addBlock({ lessonId, type })` + `teacher.deleteBlock({ blockId })` mutations. Each lesson row in the builder gets a "+ block" popover (full 15-type catalog grouped Content / Practice / Interactive / Structure; AI quiz tagged purple), a count badge ("N ▦"), and an inline list of the lesson's blocks with per-block × delete buttons. Block delete intentionally leaves order gaps (sparse) — single UPDATE, no $transaction. `BLOCK_GROUPS` + `findBlockMeta` extracted to `src/lib/blocks.ts` so the popover and the list share one catalog. Drag-from-block-library-to-lesson is still v2 polish (requires a single top-level DndContext that crosses block library + units, plus collision-detection tuning).
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

### New gotchas learned this session
- **Prisma client is module-cached at first import — `prisma generate` does NOT hot-reload a running dev server.** Saw this as `Unknown field 'stripeAccount' for include statement on model 'User'` at runtime even though tsc passed and the generated `node_modules/.prisma/client/schema.prisma` was current. The Node process loaded `@prisma/client` once at startup; a later regenerate doesn't replace the in-memory module. Fix: kill `next dev`, optionally `rm -rf .next/cache`, restart. Add to the schema-change checklist: (1) edit `schema.prisma` → (2) `npx prisma migrate dev --name X` (auto-runs generate) → (3) **restart `next dev`** → (4) verify.
- **dnd-kit + click-to-toggle headers.** Out of the box, attaching `useSortable`'s `listeners` to the entire row swallows clicks — the unit header `<button>` stops toggling expand/collapse. Two fixes that work together: (a) attach `listeners`/`attributes` only to a separate drag-handle element (the leading `drag` icon, not the header button), and (b) set `PointerSensor({ activationConstraint: { distance: 6 } })` so a sub-6px movement registers as a click on whatever was under it, not the start of a drag. Without (b), even a clean click on a non-handle element occasionally arms the drag.
- **dnd-kit + nested sortable contexts.** Lessons inside an expanded unit live in their own `<DndContext>` (one per unit), not the outer units context. If they shared the outer context, dragging a lesson would compute drop targets against the entire flat ID space — which means a lesson could land "between" two units and corrupt both lists. One context per logical sortable, with a fresh `onDragEnd` closure that knows which unit's lessons it's reordering.
- **Stripe SDK as an optional dep.** We don't want demo mode to require `npm i stripe`. Solution: `getStripe()` does `await import("stripe")` inside a `try` block with `// @ts-expect-error - optional dep`, returns `null` if the import fails. All callers check for null and either throw (`createCheckoutSession` when STRIPE_SECRET_KEY is set but SDK missing — that's misconfig) or fall back gracefully (`webhook` returns 503 so Stripe will retry once you fix it). Demo mode never touches `getStripe()`.
- **Stripe webhook + Edge** — same trap as Anthropic + Prisma. `stripe.webhooks.constructEvent` needs Node `crypto.timingSafeEqual`. Hard-code `export const runtime = "nodejs"` on `app/api/stripe/webhook/route.ts`.
- **Stripe webhook needs the raw request body** for signature verification. Next.js App Router gives you the raw bytes via `await req.text()` (NOT `await req.json()` — JSON parsing changes the byte stream and the HMAC fails). Do the text read once at the top.
- **Stripe `payment_intent_data.transfer_data.destination` is the gate for routing money** to the teacher's Connect account at charge time. If you forget this, the platform collects 100% and you owe the teacher manually. Guarded by `course.author.stripeAccount?.payoutsEnabled` so we only attempt the transfer when Stripe says the account is ready.
- **`client_reference_id` ↔ orderId** is the cleanest webhook ↔ DB join. Pass `order.id` as `client_reference_id` on the checkout session; webhook reads it back from `session.client_reference_id`. Metadata works too but `client_reference_id` is indexed by Stripe and shows up in their dashboard.
- **Anthropic SDK + Edge** is the same trap as the Prisma adapter — uses Node `crypto`, blows up on Edge. The streaming route hard-codes `export const runtime = "nodejs"` for this reason.
- **Don't try to feed Anthropic `content_block_delta` deltas straight into the browser as SSE.** Custom NDJSON (one JSON object per line, `text/x-ndjson` content type) is simpler and works with plain `fetch` — EventSource doesn't support POST so it's not usable here. `X-Accel-Buffering: no` header keeps Nginx/Vercel from buffering chunks.
- **Schema additions need both schema + Prisma generate + DB migration.** I had `TutorSession`/`TutorMessage` typed in `AGENT_NOTES`'s planned schema but never migrated — discovered when the route handler 404'd on `db.tutorSession`. The fix is the same three-step every time: edit `schema.prisma` → `npx prisma generate` (no DB needed) → `npx prisma migrate dev --name X` (DB needed). The generate step alone makes types resolve.
- **Anthropic structured outputs vs. Zod 4** — the SDK accepts a plain JSON-Schema object on `output_config.format.schema`. Importing `zod-to-json-schema` or `@anthropic-ai/sdk/helpers/zod` is the cleanest path, but Zod 4's internal type tree changed (`$ZodType` vs `z.ZodType`) which broke the shipped Stainless helper for us. We hand-rolled a 30-line `zodToJsonSchema` for the subset of Zod we actually use (object, array, string, number, optional, default) — it produces the exact dialect Anthropic wants (`additionalProperties: false`, `required: [...]`). Don't try to feed nested zod schemas with `.min()/.max()` string length constraints; structured outputs reject them.
- **tsvector via raw SQL, not Prisma.** Prisma doesn't model `tsvector` or GIN indexes — use `prisma migrate dev --create-only`, then hand-edit the generated `migration.sql` to append `ADD COLUMN ... tsvector GENERATED ALWAYS AS (to_tsvector(...)) STORED` and `CREATE INDEX ... USING GIN`. `prisma migrate deploy` then applies it. Application code queries via `db.$queryRaw\`SELECT ... ts_rank(...) ORDER BY score DESC LIMIT 1\``.
- **`plainto_tsquery` ANDs all terms.** For natural-language questions like "how does the pizza model work", AND semantics misses chunks that contain "pizza" + "model" but not "work". The fix: tokenize the query in JS (alpha ≥3 chars), OR them with `|`, and call `to_tsquery('english', 'pizza | model | work')`. `ts_rank` then naturally rewards chunks containing more terms. Went from 1/4 → 5/5 hit rate with this change.
- **Docker Desktop on this Windows machine cold-boots in ~60–90s.** Don't trust `docker compose up -d` immediately after launching `Docker Desktop.exe`; poll for `docker ps` returning exit 0 first.
- **Prisma 7** breaking changes vs. 6: URL goes in `prisma.config.ts`; `PrismaClient` requires an `adapter` (we use `@prisma/adapter-pg`); seed command is configured under `migrations.seed` in `prisma.config.ts`.
- **Native Postgres install at `C:\Program Files\PostgreSQL\18`** is incomplete (only postgis DLLs). Use Docker.
- **Docker Desktop daemon** can be cold; first `docker compose up` may need `Docker Desktop.exe` launched first. We poll up to 60s.
- **`tsx` standalone** doesn't load `.env.local` automatically and doesn't honor TS path aliases. Use `tsx --env-file=.env.local --env-file=.env` and relative imports (`../src/lib/db`) in scripts.
- **tRPC v11 + superjson**: must pass `transformer: superjson` in BOTH the server `initTRPC.create({ transformer })` and the client `httpBatchLink({ transformer })`. Easy to forget the client side.
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`.** Same API, same `matcher` config; just the filename. `middleware.ts` still loads but logs a deprecation warning.
- **Auth.js v5 + Edge runtime gotcha:** the proxy runs on Edge by default. The Prisma adapter pulls in Node's `crypto` and explodes there. **Fix:** split config into `auth.config.ts` (edge-safe, no adapter, no Credentials provider, just session callbacks) and `auth.ts` (full, with `PrismaAdapter` and `Credentials`). Proxy imports `authConfig` and calls `NextAuth(authConfig).auth` locally; everything else imports `auth` from `auth.ts`.
- **Auth.js v5 with Credentials needs `session.strategy: "jwt"`.** Database sessions don't work with Credentials providers — Auth.js refuses to write a Session row. JWT is fine because we stamp `id` and `role` onto the token in the `jwt({ token, user })` callback at sign-in.
- **Stale `next dev` processes survive** between Bash invocations on Windows. If a port-3000 conflict happens, kill via PowerShell:
  ```pwsh
  Get-Process node | ? { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "next" } | Stop-Process -Force
  ```
- **Custom session shape** (adding `role`/`id`): augment in `src/types/next-auth.d.ts` (NOT `next-auth.d.ts` at project root — must live somewhere TS includes; `tsconfig.include` already has `**/*.ts`).
- **Seeded admin**: `admin@cedar.test` (Pat Hooper) — added in seed.ts, role ADMIN, attached to Cedar Middle. Use for admin-view smoke tests.
- **CSRF + Auth.js v5 form-actions**: `<form action="/api/auth/callback/credentials">` POSTs without CSRF and gets rejected with `?error=MissingCSRF`. Use the client-side `signIn()` helper from `next-auth/react` instead — it fetches the CSRF token transparently. Implemented in `QuickLoginButton`.
- **Sign-out flow**: `/api/auth/signout` GET shows a confirm page with a "Sign out" button. Or call `signOut({ callbackUrl: "/login" })` from a client component (used in `SidebarUserMenu`).
- **`teacher.course` slug routing**: route param is named `[courseId]` for legacy reasons but actually contains the slug. We pass it through as `slug` to tRPC. Don't rename the folder mid-flight; existing links from chromes hardcode `algebra-foundations`.
- **No course attempts currently linked to enrollments for analytics**: `attempts.where { lesson: { unit: { courseId } } }` works because lessons join via Unit. The Attempt model itself doesn't have an `enrollmentId`. Fine for Phase 1; if we add per-attempt cohort filtering later, consider denormalizing.
- **Next.js 16 `notFound()` returns HTTP 200 (not 404) for streamed responses in dev.** Documented at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`. The not-found.tsx UI still renders and a `<meta name="robots" content="noindex">` is injected. Status is 404 in production non-streamed responses. Don't try to "fix" by throwing — this is intentional. If a true 404 status is needed in dev (e.g., for tests), set the response status manually in the page.
- **Auth.js v5 form-action POSTs need CSRF.** Form-only quick-login fails with `?error=MissingCSRF`. The fix is to use the client-side `signIn()` helper from `next-auth/react` (used in `QuickLoginButton`). For server-side curl smoke tests, fetch `/api/auth/csrf` first and include the token + cookie jar.
- **JWT user-id staleness after re-seed**: when the seed runs with `upsert`, user IDs stay stable. But if someone deletes and re-creates the User row (e.g., resetting test data), existing JWT cookies will point to a defunct id and tRPC procedures error with "user not found". Force re-sign-in or wipe the auth cookie.
- **Streak engine boundary**: `bumpStreak()` treats the UTC date as canonical "day". Phase 2 should pull the user's timezone (`User.timezone` column) and compute boundary per-user.
- **Course.enroll for paid courses returns `PAYMENT_REQUIRED` (HTTP 402)** until Phase 3 Stripe Connect lands. UI handles this gracefully: shows the error string in the EnrollPanel and disables the button. When wiring Stripe, replace the throw with a Stripe Checkout session creation + redirect.
- **Password auth boundary** (`src/lib/auth.ts`): the `authorize` callback has three branches:
  1. User has `passwordHash` + password submitted → bcrypt compare
  2. User has `passwordHash` + NO password submitted → reject (prevents quick-login bypass)
  3. User has no `passwordHash` + NO password + dev mode → allow (demo seed users)
  4. Anything else → reject. The "no password but real user" case is the critical one — without that check, the original quick-login would let anyone in as any registered user.
- **Sidebar Library link** was pointing to `/student/lesson/multiplying-fractions` — a specific lesson. Fixed to `/student/library` which lists the user's enrollments with progress meters. If you change the sidebar nav array in `StudentChrome.tsx`, double-check the href points to a real list/index page, not a deep link.

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
- [ ] **P1-41** Add Playwright smoke test for auth → enroll → complete first quiz → see XP rise.

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
