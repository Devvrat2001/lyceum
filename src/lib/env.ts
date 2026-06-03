import { z } from "zod";

/**
 * Centralized, validated env access.
 * Never read process.env directly outside this file.
 */
const Schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(16),

  // Optional: enabled later in Phase 1+
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Defaults to claude-sonnet-4-5 — broadly available across Anthropic
  // account tiers. Newer/better models (claude-opus-4-7, claude-sonnet-4-6)
  // require higher tier access. Override with ANTHROPIC_MODEL env var if
  // your account has access to a better one.
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  // OpenAI is supported as an alternative provider — when both
  // ANTHROPIC_API_KEY and OPENAI_API_KEY are set, OpenAI wins (it's
  // checked first in `isLlmEnabled()`). Either alone is fine; if
  // neither is set, the AI generator + tutor fall back to demo stubs.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  // Embeddings are split out from chat because the workloads have
  // very different cost profiles: course-builder calls are infrequent
  // and benefit from a top-tier model; embedding calls fire on every
  // catalog change AND every typeahead keystroke, so they're better
  // served by a cheaper key (potentially a separate OpenAI account
  // on a lower tier, or a free-tier project).
  //
  // Both vars are optional and fall through to their chat counterparts
  // — if you don't care about cost separation, just set OPENAI_API_KEY
  // and embeddings will use the same key.
  //
  // NOTE: changing OPENAI_EMBEDDING_MODEL away from
  // `text-embedding-3-small` will likely change the output dimension
  // (-3-large is 3072). The Course.embedding column is `vector(1536)`,
  // so a model swap means a migration + full re-backfill. Don't change
  // this casually.
  OPENAI_EMBEDDING_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // Phase 3 — Stripe. All optional; absence flips checkout into demo mode.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /// Lyceum's cut of paid course revenue (basis points, 1500 = 15%).
  STRIPE_PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Phase 5 — Upstash QStash for background AI generation jobs.
  // Hobby Vercel functions cap at 60s; full course-outline generation
  // exceeds that, so we chunk via QStash. All three vars must be set
  // in production for the async path to activate — absence makes
  // `generator.startOutlineJob` fall back to running inline (which
  // works locally but will hit the 60s timeout on Vercel Hobby).
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

  // Video uploads — Mux. Optional; absence keeps the VIDEO block on
  // paste-a-URL only (no in-app upload). Create an access token in the
  // Mux dashboard (Settings → Access Tokens) with "Mux Video" read+write
  // permission, then set both vars in .env.local + Vercel.
  MUX_TOKEN_ID: z.string().optional(),
  MUX_TOKEN_SECRET: z.string().optional(),
  // Signing secret for the Mux webhook (Mux dashboard → Settings → Webhooks).
  // When set, /api/mux/webhook verifies + applies `video.asset.ready` events
  // for instant completion. Without it the route refuses (we never process an
  // unverified body) — the builder's client polling still finishes uploads.
  MUX_WEBHOOK_SECRET: z.string().optional(),
  // Mux signing keys (Mux dashboard → Settings → Signing Keys), for signed
  // playback on PAID-course videos. Both optional; absent → all videos stay
  // public (no token needed). MUX_PRIVATE_KEY is the base64 RSA private key.
  MUX_SIGNING_KEY: z.string().optional(),
  MUX_PRIVATE_KEY: z.string().optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
