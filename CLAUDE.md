@AGENTS.md

# Lyceum

K-12 education platform. Teacher-authored lessons, marketplace, Stripe Connect payouts.

## Stack
Next.js 16.2.6 (App Router, Turbopack) · React 19 · tRPC v11 · Prisma 7.8 + @prisma/adapter-pg · Auth.js v5 (JWT) · Postgres 16 in Docker (port **5433**) · @dnd-kit · Tailwind v4

## Commands
```bash
npm run dev           # Next dev server
npm run db:migrate    # prisma migrate dev
npm run db:seed       # Idempotent seed (uses demo_seed_<key> externalIds)
npm run db:smoke      # DB connectivity check
npm run db:studio     # Prisma Studio
npm run db:reset      # Wipes DB — destructive
```

## Gotchas (hard-won)
- **Next 16:** `proxy.ts` replaces `middleware.ts`. Read `node_modules/next/dist/docs/` before assuming APIs.
- **Prisma URL** lives in `prisma.config.ts`, NOT in `schema.prisma`.
- **Prisma client module-cache:** after `prisma generate`, kill `next dev` and clear `.next/cache` — Node caches `@prisma/client` at first import and won't hot-reload. Symptom: "Unknown field X for include statement" after schema change.
- **server-only imports** transitively break tsx probe scripts. For DB probes, use Prisma directly — don't import the tRPC app router.
- **Auth.js split config:** edge-safe `auth.config.ts` + full `auth.ts`. Don't import server-only deps in the edge config.
- **Stripe metadata:** stamp `orderId` on BOTH session AND PaymentIntent. Webhooks read `charge.metadata.orderId` (inherited from PI, not session).
- **JWT role changes** require user to sign out + sign in. Updating `role` in DB alone doesn't propagate.
- **Vercel Cron `/api/cron/backfill-embeddings`** sweeps PUBLISHED courses with `embedding IS NULL` hourly. Requires `CRON_SECRET` env on Vercel (auto-generated when you add a cron in the dashboard, or set manually). Without it the route refuses to run rather than expose an OpenAI-cost endpoint to the public internet.
- **Every Lesson needs a `slug`.** The student reader route is `/student/lesson/[slug]` and `CurriculumAccordion` only renders a lesson as a clickable link when `slug` is set — a NULL-slug lesson is unreachable (shows as dead text) and `lesson.markComplete` skips it when picking the next lesson. Seed + AI generator both assign `<course-slug>-u<unit-order>-l<lesson-order>`; migration `20260529130000_backfill_lesson_slugs` fixes legacy NULL rows. If you add lessons by hand, give them a slug.
- **`LessonChunk` FTS is an expression index, not a column.** A generated `searchable` tsvector column will be silently dropped by the next `prisma migrate dev` (it's not in `schema.prisma`), which 500'd the AI tutor's `findCitation`. The FTS now lives in the GIN *expression* index `LessonChunk_content_fts_idx` (migration `20260529140000`) and `findCitation` computes `to_tsvector('english', coalesce(content,''))` inline. Don't reintroduce a stored tsvector column.
- **Claude model gating (default `claude-sonnet-4-5`):** this model 400s on `thinking:{type:"adaptive"}` and on `output_config.format` (JSON-schema structured outputs) — both only work on Opus 4.7 / Sonnet 4.6+. The tutor uses a plain streaming call for this reason. For structured JSON, **always go through `completeStructured` in `lib/ai/llm.ts`** — it inlines the schema into the prompt for Claude (model-safe) and uses OpenAI's `response_format` when an OpenAI key is set. `marketplace.aiSearch` + `insight.ts` were converted to it; don't reach for a raw `client.messages.create({ output_config })` again.
- **QStash can't reach `localhost`.** `isQStashEnabled()` returns false when `PUBLIC_BASE_URL` is a loopback/`.local` host, so AI course generation runs **inline** in local dev (QStash delivers by POSTing to `PUBLIC_BASE_URL` from the cloud — a localhost URL would leave jobs stuck at "Queued"). Prod (real domain) still uses the chunked QStash path. If you point `PUBLIC_BASE_URL` at a tunnel (ngrok etc.) the async path turns back on.
- **Empty `ANTHROPIC_API_KEY=""` shadows `.env.local`.** `@next/env` (and Node `--env-file`) won't override a var that's already set in the environment, even to empty string. If `printenv ANTHROPIC_API_KEY` shows an empty value, the tutor silently uses its canned demo responses instead of real Claude — `unset` it (or start `next dev` from a clean shell) so the key from `.env.local` is loaded.

## Companion docs
- `AGENT_NOTES.md` — session-to-session scratchpad (phase status, last commit, new gotchas). **Update every session.**
- `BACKEND_ROADMAP.md` — longer-horizon planning.
- `KNOWN_ISSUES.md` — audited latent risks / tech debt (lint errors, unvalidated `Json` casts, structural debt) that compile today but fail later. Refresh after big sweeps; don't let S2/S3 rot into S1.
- `REQUIREMENTS.md` — prioritized backlog: P0–P3 R1–R28 (2026-06-12 review, all DONE except R1 user-owned TLS) + **P4 R29–R35** (2026-06-14, done except R31 WhatsApp-keys-blocked) + **P5 R36–R40** (2026-06-15, all DONE) + **P6 R41–R45** (R41/R42/R43/R45 DONE; R44 email remains — user-owned) + **P7 R46–R49** (all DONE) + **P8 R50–R53** (R50 headers / R51 signup throttle / R53 cron-gate+insight-router tests DONE; **R52 i18n breadth IN PROGRESS** — TeacherEarnings/TeacherStudents/AdminPeople/AdminClasses + TeacherGrading + TeacherDiscussions [client components] + student library/skill-tree done, ~6 page bodies left (teacher paths/storefront, admin teachers[client]/curriculum/audit/billing); client-component i18n pattern proven via next-intl useTranslations + t.rich). **User-owned carry-overs: R44 (email — go-live checklist ready), R1 (TLS).** Agent-doable work left is mainly R52's remaining page bodies (mechanical); the R50 CSP tail is low-value (inline styles ⇒ near-pointless without a nonce refactor). When R52 lands, do a fresh P9 review. Update Status inline. Its "Verified clean" section lists what NOT to re-audit.

## Key paths
- `src/server/routers/` — tRPC routers (lesson, teacher, marketplace, payment)
- `src/lib/blocks.ts` — BLOCK_GROUPS catalog (15 types)
- `src/components/lesson/BlockReader.tsx` — student-facing block renderer
- `src/components/teacher/CourseBuilderClient.tsx` — 3-level nested DnD authoring
- `src/lib/payments/stripe.ts` — lazy dynamic-import (works without `stripe` installed)
- `prisma/seed.ts` — deterministic demo data
