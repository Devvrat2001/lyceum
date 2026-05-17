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

## Companion docs
- `AGENT_NOTES.md` — session-to-session scratchpad (phase status, last commit, new gotchas). **Update every session.**
- `BACKEND_ROADMAP.md` — longer-horizon planning.

## Key paths
- `src/server/routers/` — tRPC routers (lesson, teacher, marketplace, payment)
- `src/lib/blocks.ts` — BLOCK_GROUPS catalog (15 types)
- `src/components/lesson/BlockReader.tsx` — student-facing block renderer
- `src/components/teacher/CourseBuilderClient.tsx` — 3-level nested DnD authoring
- `src/lib/payments/stripe.ts` — lazy dynamic-import (works without `stripe` installed)
- `prisma/seed.ts` — deterministic demo data
