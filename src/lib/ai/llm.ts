import "server-only";
import type { z, ZodTypeAny } from "zod";
import { CLAUDE_MODEL, getClaude, isClaudeEnabled } from "./claude";
import { OPENAI_MODEL, getOpenAI, isOpenAIEnabled } from "./openai";
import { zodToJsonSchema } from "./zodToJsonSchema";

export type LlmMode = "openai" | "claude" | "demo";

/** True when either OPENAI_API_KEY or ANTHROPIC_API_KEY is set. */
export function isLlmEnabled(): boolean {
  return isOpenAIEnabled() || isClaudeEnabled();
}

/**
 * The provider that `completeStructured` will pick this call.
 * Useful for stamping audit rows so we can later attribute generated
 * content to a specific provider.
 */
export function activeLlm(): LlmMode {
  if (isOpenAIEnabled()) return "openai";
  if (isClaudeEnabled()) return "claude";
  return "demo";
}

/**
 * Run the active LLM provider with a system prompt + a user message,
 * expecting a JSON response that conforms to `schema`. The chosen
 * provider is returned as `mode` so callers can record it in audit
 * payloads.
 *
 * Provider precedence: OPENAI_API_KEY wins when both keys are set.
 *
 * Throws if neither key is configured — callers should gate on
 * `isLlmEnabled()` and fall back to their demo path if false.
 */
export async function completeStructured<S extends ZodTypeAny>(args: {
  schema: S;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; mode: Exclude<LlmMode, "demo"> }> {
  const maxTokens = args.maxTokens ?? 4096;
  const jsonSchema = zodToJsonSchema(args.schema);

  if (isOpenAIEnabled()) {
    const client = getOpenAI()!;
    const res = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          // Required `name` field for OpenAI structured outputs;
          // doesn't surface anywhere user-visible.
          name: "Response",
          // `strict: false` lets the response include optional /
          // default Zod fields — strict mode rejects schemas with any
          // unsupported keywords ($ref, optional, default, etc.) and
          // our schemas use them.
          strict: false,
          schema: jsonSchema as Record<string, unknown>,
        },
      },
    });
    const text = res.choices[0]?.message?.content ?? "";
    return {
      data: parseAndValidate(text, args.schema, "openai"),
      mode: "openai",
    };
  }

  if (isClaudeEnabled()) {
    const client = getClaude()!;
    // We deliberately don't use the Anthropic `output_config.format`
    // structured-outputs feature — it only works on Opus 4.7, Sonnet 4.6
    // and Haiku 4.5, and a lot of API keys (especially Tier 1) don't
    // have access to those models. Instead we just inline the JSON schema
    // into the system prompt and let `parseAndValidate` clean up code
    // fences. This works on every Claude model that supports messages.
    const systemWithSchema =
      args.system +
      `\n\nIMPORTANT OUTPUT CONTRACT: respond with ONLY a single JSON ` +
      `object that conforms to the JSON Schema below. No prose before ` +
      `or after the JSON. No markdown code fences. No commentary.\n\n` +
      `JSON Schema:\n${JSON.stringify(jsonSchema)}`;
    try {
      const res = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemWithSchema,
        messages: [{ role: "user", content: args.prompt }],
      });
      const text = res.content
        .map((b) => (b.type === "text" ? b.text ?? "" : ""))
        .join("");
      return {
        data: parseAndValidate(text, args.schema, "claude"),
        mode: "claude",
      };
    } catch (err) {
      // Surface the real Anthropic error to Vercel logs — otherwise the
      // user just sees a generic toast and we have nothing to debug from.
      // Anthropic SDK errors carry `status` + `message` + `error.type`.
      const e = err as {
        status?: number;
        message?: string;
        error?: { type?: string; error?: { message?: string } };
      };
      console.error("[llm.ts] Claude API call failed", {
        model: CLAUDE_MODEL,
        status: e?.status,
        type: e?.error?.type,
        message: e?.message,
        innerMessage: e?.error?.error?.message,
      });
      throw err;
    }
  }

  throw new Error(
    "No LLM provider enabled — set OPENAI_API_KEY or ANTHROPIC_API_KEY."
  );
}

function parseAndValidate<S extends ZodTypeAny>(
  rawText: string,
  schema: S,
  mode: "openai" | "claude"
): z.infer<S> {
  // Strip code fences defensively — both providers occasionally wrap
  // their structured output in ```json … ``` despite being told not to.
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch (err) {
    throw new Error(
      `${mode} returned non-JSON content: ${(err as Error).message}`
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `${mode} returned schema-invalid JSON: ${parsed.error.message}`
    );
  }
  return parsed.data;
}
