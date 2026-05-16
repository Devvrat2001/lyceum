import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;

/** Lazy-init Anthropic client. Returns null if no API key is set. */
export function getClaude(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const CLAUDE_MODEL = env.ANTHROPIC_MODEL;

/** Are we running with a real key (vs the demo fallback)? */
export function isClaudeEnabled(): boolean {
  return !!env.ANTHROPIC_API_KEY;
}
