import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getClaude,
  CLAUDE_MODEL,
  isClaudeEnabled,
} from "@/lib/ai/claude";
import {
  TUTOR_SYSTEM_PROMPT,
  buildLessonContextBlock,
} from "@/lib/ai/prompts/tutor";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { checkAIQuotaSoft } from "@/lib/rateLimit";
import { findCitation } from "@/lib/ai/citations";

/**
 * Node runtime — Anthropic SDK needs Node's crypto + streams. Edge would
 * throw the same way the Prisma adapter does.
 */
export const runtime = "nodejs";

const RequestSchema = z.object({
  lessonId: z.string(),
  sessionId: z.string().nullish(),
  message: z.string().min(1).max(4000),
  // Prior turns from the client (cheap UX echo so the client doesn't have
  // to round-trip on every render). Each item is hard-truncated server-side
  // (not rejected — legit assistant turns can exceed a reject-cap) so 40
  // client-supplied strings can't amplify token cost arbitrarily. The
  // content is replayed to the model verbatim, so this cap is the only
  // bound on it. (REQUIREMENTS R5.)
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().transform((s) => s.slice(0, 8_000)),
      })
    )
    .max(40)
    .default([]),
});

/**
 * NDJSON event emitted to the browser. The client reads line-by-line.
 * One event per line. Keep this small + stable.
 */
type StreamEvent =
  | { type: "start"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "cite"; citation: string }
  | { type: "done"; tokensIn?: number; tokensOut?: number }
  | { type: "error"; message: string };

function encodeEvent(ev: StreamEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(ev) + "\n");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (e) {
    return new Response(
      e instanceof Error ? e.message : "Invalid request",
      { status: 400 }
    );
  }

  // Load lesson + context. Fail fast if the lesson doesn't exist.
  const lesson = await db.lesson.findUnique({
    where: { id: body.lessonId },
    include: {
      unit: {
        include: {
          course: { select: { title: true, slug: true } },
        },
      },
      questions: { orderBy: { order: "asc" }, take: 1 },
    },
  });
  if (!lesson) {
    return new Response("Lesson not found", { status: 404 });
  }

  // Rate-limit per actor across all AI surfaces.
  const quota = await checkAIQuotaSoft({ actorId: session.user.id });
  if (!quota.ok) {
    return new Response(quota.message, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // Respect the per-user "don't store my tutor chats" privacy setting
  // (COPPA/FERPA, toggled on /settings). When opted out the tutor still
  // runs live and rate-limit accounting (the audit row) still happens, but
  // we persist no message text — nothing about the conversation is kept.
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { tutorLogOptOut: true },
  });
  const logTutor = !me?.tutorLogOptOut;

  // Get or create the tutor session.
  const tutorSession = body.sessionId
    ? await db.tutorSession.findFirst({
        where: { id: body.sessionId, userId: session.user.id },
      })
    : null;

  const sessionRow =
    tutorSession ??
    (await db.tutorSession.create({
      data: {
        userId: session.user.id,
        lessonId: lesson.id,
      },
    }));

  // Persist user message BEFORE we start streaming, so a dropped client
  // doesn't lose the input. Skipped entirely when the user opted out of
  // tutor logging.
  if (logTutor) {
    await db.tutorMessage.create({
      data: {
        sessionId: sessionRow.id,
        role: "user",
        content: body.message,
      },
    });
  }

  const firstQ = lesson.questions[0];
  const answers = (firstQ?.answers ?? []) as Array<{
    key: string;
    correct?: boolean;
  }>;
  const correctKey = answers.find((a) => a.correct)?.key ?? null;

  const lessonContext = buildLessonContextBlock({
    courseTitle: lesson.unit.course.title,
    unitTitle: lesson.unit.title,
    lessonTitle: lesson.title,
    questionStem: firstQ?.stem ?? null,
    correctAnswerKey: correctKey,
    intro: lesson.intro ?? null,
  });

  // Real citation lookup from chunked lesson content (P2-03/04).
  // Falls back to a generic course/unit citation when no chunk matches
  // or when the lesson has no seeded chunks yet. Wrapped because a
  // citation lookup must NEVER take down the tutor — the citation is a
  // small footer, the streamed answer is the product. (A dropped FTS
  // column silently 500'd the whole tutor here once.)
  let hit: Awaited<ReturnType<typeof findCitation>> = null;
  try {
    hit = await findCitation({
      query: body.message,
      lessonId: lesson.id,
    });
  } catch (err) {
    console.warn(
      "[tutor.stream] citation lookup failed; using generic citation:",
      err
    );
  }
  const citation = hit
    ? `Cited: ${lesson.unit.course.title}, ${lesson.unit.title}, p. ${hit.page}${
        hit.section ? ` (${hit.section})` : ""
      }`
    : `Cited: ${lesson.unit.course.title}, ${lesson.unit.title}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";

      const emit = (ev: StreamEvent) => controller.enqueue(encodeEvent(ev));
      emit({ type: "start", sessionId: sessionRow.id });

      try {
        if (isClaudeEnabled()) {
          await streamFromClaude({
            systemPrompt: TUTOR_SYSTEM_PROMPT,
            lessonContext,
            history: body.history,
            userMessage: body.message,
            onDelta: (text) => {
              assistantText += text;
              emit({ type: "delta", text });
            },
          });
        } else {
          // No API key — stream a clearly-marked demo response token-by-token
          // so the UI still feels alive.
          const canned = buildDemoResponse(body.message, lesson.intro);
          for (const chunk of canned.split(/(\s+)/)) {
            if (!chunk) continue;
            assistantText += chunk;
            emit({ type: "delta", text: chunk });
            await new Promise((r) => setTimeout(r, 28));
          }
        }

        emit({ type: "cite", citation });

        // Persist assistant message (skipped when the user opted out of
        // tutor logging — the live answer above still streamed normally).
        if (logTutor) {
          await db.tutorMessage.create({
            data: {
              sessionId: sessionRow.id,
              role: "assistant",
              content: assistantText,
              citations: hit
                ? {
                    page: hit.page,
                    section: hit.section,
                    snippet: hit.snippet,
                    score: hit.score,
                    source: "lesson_chunk_fts",
                  }
                : { value: citation, source: "fallback" },
            },
          });
        }

        await audit({
          actorId: session.user.id,
          kind: "ai.tutor",
          payload: {
            sessionId: sessionRow.id,
            userMessageChars: body.message.length,
            assistantChars: assistantText.length,
            citation,
            citationMatched: !!hit,
            citationPage: hit?.page ?? null,
            citationScore: hit?.score ?? null,
            mode: env.ANTHROPIC_API_KEY ? "claude" : "demo",
            // Audit records that a chat happened (for rate-limit + the
            // FERPA "tutor usage" trail) even when content wasn't stored.
            tutorLoggingOptOut: !logTutor,
          },
          lessonId: lesson.id,
        });

        emit({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        console.error("[tutor.stream]", err);
        emit({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function streamFromClaude(args: {
  systemPrompt: string;
  lessonContext: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  onDelta: (text: string) => void;
}) {
  const client = getClaude();
  if (!client) throw new Error("Anthropic client not initialized");

  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    // No `thinking` / `output_config` here on purpose. Adaptive
    // thinking + effort controls only exist on newer models (Opus 4.7 /
    // Sonnet 4.6+). On the broadly-available default model
    // (claude-sonnet-4-5, set in env.ts) the API rejects them with
    // 400 "adaptive thinking is not supported on this model", which
    // surfaced to students as "Couldn't reach the tutor". A plain
    // streaming call works on every model + account tier; if you point
    // ANTHROPIC_MODEL at a model that supports adaptive thinking and
    // want it back, gate these params on the model name.
    system: [
      {
        type: "text",
        text: args.systemPrompt,
      },
      {
        type: "text",
        text: args.lessonContext,
        // The lesson context is stable for the whole tutor session →
        // cache it. Subsequent turns read instead of writing.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      ...args.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: args.userMessage },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      args.onDelta(event.delta.text);
    }
  }
  await stream.finalMessage();
}

function buildDemoResponse(userMessage: string, lessonIntro: string | null) {
  const lower = userMessage.toLowerCase();
  if (lower.includes("hint")) {
    return (
      "Sure — here's a hint without giving it away. " +
      (lessonIntro ??
        "Try drawing the situation out, or breaking the problem into smaller pieces.") +
      " What do you think the next step is?"
    );
  }
  if (lower.includes("quiz")) {
    return "Let's try a quick variant! If you had 3 groups of 5, how many items total? Take your best guess and I'll walk through it with you.";
  }
  if (lower.includes("easier") || lower.includes("simpler")) {
    return "No problem — let's slow down. Picture it: if I gave you 2 cookies and your friend gave you 2 more, how many do you have? Use that same idea on the question above.";
  }
  return (
    "Great question. " +
    (lessonIntro ??
      "Let's think about it step by step.") +
    " What part feels most confusing right now? (This is the demo tutor — set ANTHROPIC_API_KEY in .env.local to enable real Claude responses.)"
  );
}
