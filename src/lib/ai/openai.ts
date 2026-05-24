import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

let _client: OpenAI | null = null;

/** Lazy-init OpenAI client. Returns null if no API key is set. */
export function getOpenAI(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _client;
}

export const OPENAI_MODEL = env.OPENAI_MODEL;

/** Are we running with a real key (vs the demo fallback)? */
export function isOpenAIEnabled(): boolean {
  return !!env.OPENAI_API_KEY;
}
