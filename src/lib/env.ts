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
