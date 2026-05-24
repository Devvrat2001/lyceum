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
  // Optional override; defaults to claude-opus-4-7 per Claude API skill guidance.
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-7"),
  // OpenAI is supported as an alternative provider — when both
  // ANTHROPIC_API_KEY and OPENAI_API_KEY are set, OpenAI wins (it's
  // checked first in `isLlmEnabled()`). Either alone is fine; if
  // neither is set, the AI generator + tutor fall back to demo stubs.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  // Phase 3 — Stripe. All optional; absence flips checkout into demo mode.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /// Lyceum's cut of paid course revenue (basis points, 1500 = 15%).
  STRIPE_PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),

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
