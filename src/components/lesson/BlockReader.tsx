"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LessonVideoPlayer } from "@/components/video/LessonVideoPlayer";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { Avatar, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import {
  findBlockMeta,
  settingsFor,
  type BlockType,
  type BranchingNode,
  type DragMatchPair,
  type McqOption,
  type QuizQuestion,
  type SettingsFor,
} from "@/lib/blocks";
import { trpc } from "@/lib/trpc/react";
import {
  queueAttempt,
  queuePoll,
  queueDragMatch,
  queueBranching,
} from "@/lib/offline/attemptStore";

/**
 * Student-facing render of a single Block from a Lesson. Mirrors the
 * 3 type-specific editors in BlockInspector (VIDEO / READING / MCQ);
 * every other type renders a small placeholder card so the layout
 * doesn't break for blocks whose reader hasn't shipped yet.
 *
 * MCQ blocks call `lesson.attemptBlock` server-side on "Check answer"
 * — that writes an `Attempt` row, awards XP via the shared
 * `awardCorrectAttempt` helper, and runs the streak / badge pipeline
 * (same engine the legacy Question-based attempt uses). Until the
 * request resolves the UI shows a pending state; on success the
 * server-reported correctness + XP chip render.
 */
export type BlockReaderProps = {
  id: string;
  type: BlockType;
  order: number;
  settings: Record<string, unknown>;
};

export function BlockReader({ block }: { block: BlockReaderProps }) {
  const meta = findBlockMeta(block.type);
  const customLabel =
    typeof block.settings.label === "string" && block.settings.label.trim()
      ? block.settings.label.trim()
      : null;
  const displayLabel = customLabel ?? meta.label;

  return (
    <Card p={20} style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Icon
          name={meta.icon as "play"}
          size={14}
          color={meta.ai ? "var(--wf-ai)" : "var(--wf-body)"}
        />
        <Eyebrow style={{ color: meta.ai ? "var(--wf-ai)" : undefined }}>
          {meta.label}
          {meta.ai ? " · AI" : ""}
        </Eyebrow>
        <span
          className="wf-mono"
          style={{
            marginLeft: "auto",
            fontSize: 9,
            color: "var(--wf-mute)",
            letterSpacing: "0.06em",
          }}
        >
          #{block.order}
        </span>
      </div>
      {customLabel && (
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: "0 0 12px",
            lineHeight: 1.3,
          }}
        >
          {displayLabel}
        </h3>
      )}
      {renderBody(block)}
    </Card>
  );
}

// A no-op subscribe for useSyncExternalStore reads that never change
// after mount (one-shot browser-capability detection). Module-level so
// its identity is stable across renders.
const noopSubscribe = () => () => {};

function renderBody(block: BlockReaderProps) {
  // settingsFor narrows the raw JSON column into the per-type Settings
  // shape declared in @/lib/blocks. Each body component then accepts a
  // strongly-typed prop; cross-type field mismatches (e.g. MCQ's
  // McqOption[] vs POLL's string[] on the shared `options` name) are
  // caught at compile time here, not at first render.
  switch (block.type) {
    case "VIDEO":
      return (
        <VideoBody
          settings={settingsFor("VIDEO", block.settings)}
          blockId={block.id}
        />
      );
    case "READING":
      return <ReadingBody settings={settingsFor("READING", block.settings)} />;
    case "MCQ":
      return (
        <McqBody
          blockId={block.id}
          settings={settingsFor("MCQ", block.settings)}
        />
      );
    case "SLIDES":
      return <SlidesBody settings={settingsFor("SLIDES", block.settings)} />;
    case "PDF":
      return <PdfBody settings={settingsFor("PDF", block.settings)} />;
    case "SECTION":
      return <SectionBody settings={settingsFor("SECTION", block.settings)} />;
    case "POLL":
      return (
        <PollBody
          blockId={block.id}
          settings={settingsFor("POLL", block.settings)}
        />
      );
    case "DISCUSSION":
      return (
        <DiscussionBody
          blockId={block.id}
          settings={settingsFor("DISCUSSION", block.settings)}
        />
      );
    case "AI_QUIZ":
      return (
        <AiQuizBody
          blockId={block.id}
          settings={settingsFor("AI_QUIZ", block.settings)}
        />
      );
    case "DRAG_MATCH":
      return (
        <DragMatchBody
          blockId={block.id}
          settings={settingsFor("DRAG_MATCH", block.settings)}
        />
      );
    case "LIVE":
      return <LiveBody settings={settingsFor("LIVE", block.settings)} />;
    case "QUIZ":
      return (
        <QuizBody
          blockId={block.id}
          settings={settingsFor("QUIZ", block.settings)}
        />
      );
    case "SIMULATION":
      return (
        <SimulationBody settings={settingsFor("SIMULATION", block.settings)} />
      );
    case "SPEAK":
      return <SpeakBody settings={settingsFor("SPEAK", block.settings)} />;
    case "BRANCHING":
      return (
        <BranchingBody
          blockId={block.id}
          settings={settingsFor("BRANCHING", block.settings)}
        />
      );
    case "FREE_RESPONSE":
      return (
        <FreeResponseBody
          blockId={block.id}
          settings={settingsFor("FREE_RESPONSE", block.settings)}
        />
      );
    default:
      return <ComingSoonBlock type={block.type} />;
  }
}

function ComingSoonBlock({ type }: { type: string }) {
  const t = useTranslations("LessonReader");
  return (
    <div
      style={{
        padding: 12,
        border: "1px dashed var(--wf-hairline)",
        borderRadius: 3,
        fontSize: 12,
        color: "var(--wf-mute)",
        lineHeight: 1.5,
      }}
    >
      {t.rich("comingSoon", { type, b: (c) => <b>{c}</b> })}
    </div>
  );
}

/* ── VIDEO ───────────────────────────────────────────────── */

function VideoBody({
  settings,
  blockId,
}: {
  settings: Record<string, unknown>;
  blockId: string;
}) {
  // The VIDEO renderer is shared with the teacher course builder via
  // `LessonVideoPlayer`, so a teacher previews exactly what a student
  // watches (Mux adaptive player / sandboxed embed / safe link) — and
  // the player logic lives in one place.
  return <LessonVideoPlayer settings={settings} blockId={blockId} />;
}

/* ── READING ─────────────────────────────────────────────── */

function ReadingBody({ settings }: { settings: Record<string, unknown> }) {
  const t = useTranslations("LessonReader");
  const body = typeof settings.body === "string" ? settings.body : "";
  // Minimal markdown: just paragraphs + bold/italic + headings.
  // Anything fancier ships when we add a real markdown lib; this
  // covers the demo shape without pulling in a dep.
  //
  // useMemo MUST run unconditionally — keep it above the empty
  // guard so React's hooks invariant holds.
  const nodes = useMemo(() => renderMiniMarkdown(body), [body]);
  if (!body.trim()) {
    return (
      <EmptyBlockHint message={t("readingEmpty")} />
    );
  }
  return (
    <div
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--wf-body)",
      }}
    >
      {nodes}
    </div>
  );
}

/**
 * Tiny markdown subset:
 *   # Heading             → <h3>
 *   ## Subhead            → <h4>
 *   - item / * item       → <ul><li>
 *   blank line            → paragraph break
 *   **bold**              → <b>
 *   *italic*              → <i>
 *
 * Teacher-authored content only, so XSS exposure is teacher-self-pwn
 * — but we still build the tree out of React nodes (no
 * dangerouslySetInnerHTML) so an accidental `<script>` literal renders
 * as text, not as a script tag.
 */
function renderMiniMarkdown(src: string): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] | null = null;

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(
      <p key={`p-${out.length}`} style={{ margin: "0 0 12px" }}>
        {applyInline(para.join(" "))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list || list.length === 0) {
      list = null;
      return;
    }
    out.push(
      <ul key={`ul-${out.length}`} style={{ margin: "0 0 12px 20px" }}>
        {list.map((item, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {applyInline(item)}
          </li>
        ))}
      </ul>
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    if (h1) {
      flushPara();
      flushList();
      out.push(
        <h3
          key={`h-${out.length}`}
          style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}
        >
          {applyInline(h1[1])}
        </h3>
      );
    } else if (h2) {
      flushPara();
      flushList();
      out.push(
        <h4
          key={`h-${out.length}`}
          style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}
        >
          {applyInline(h2[1])}
        </h4>
      );
    } else if (li) {
      flushPara();
      if (!list) list = [];
      list.push(li[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out;
}

function applyInline(text: string): React.ReactNode {
  // Tokenize into segments of bold / italic / plain. Order matters:
  // bold (**) before italic (*) so "**foo**" isn't read as italic.
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        out.push(<b key={key++}>{text.slice(i + 2, end)}</b>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        out.push(<i key={key++}>{text.slice(i + 1, end)}</i>);
        i = end + 1;
        continue;
      }
    }
    // Plain run up to the next * or end-of-string
    const next = text.indexOf("*", i);
    const slice = next === -1 ? text.slice(i) : text.slice(i, next);
    out.push(slice);
    i = next === -1 ? text.length : next;
    // If we got here via a stray `*` with no matching close, push it
    // as a literal so the * shows in the output instead of vanishing.
    if (i < text.length && text[i] === "*" && !text.startsWith("**", i)) {
      out.push("*");
      i += 1;
    }
  }
  return out;
}

/* ── MCQ ─────────────────────────────────────────────────── */

type McqFeedback = {
  correct: boolean;
  points: number;
  bonusPoints: number;
  correctIndex: number;
  streak: { current: number; milestone: number | null } | null;
  badgeAwarded: string | null;
};

function McqBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"MCQ">;
}) {
  const t = useTranslations("LessonReader");
  const stem = settings.stem ?? "";
  // settings.options is McqOption[] | undefined at the type level; the
  // .filter is still a runtime guard against teacher-edited JSON
  // landing with bad entries.
  const opts: McqOption[] = (settings.options ?? []).filter(
    (o): o is McqOption =>
      o !== null &&
      typeof o === "object" &&
      typeof o.text === "string" &&
      typeof o.correct === "boolean"
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<McqFeedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set when the answer was captured while offline (queued for replay on
  // reconnect) instead of submitted live.
  const [offlineSaved, setOfflineSaved] = useState(false);

  const attempt = trpc.lesson.attemptBlock.useMutation({
    onSuccess: (res) => {
      setFeedback(res);
      setSubmitError(null);
    },
    onError: (err) => {
      // Auth-gated mutation — surfaces a friendly hint instead of
      // failing silently when the user isn't signed in.
      setSubmitError(
        err.data?.code === "UNAUTHORIZED"
          ? "Sign in to save your answer."
          : err.message ?? "Couldn't submit your answer. Try again."
      );
    },
  });

  if (!stem.trim() || opts.length < 2) {
    return (
      <EmptyBlockHint message={t("mcqEmpty")} />
    );
  }

  // Once the server returns, `feedback.correctIndex` is authoritative.
  // Before submit we don't know which is correct (the client receives
  // `correct: true/false` per option in settings, but UI shouldn't
  // colour anything until the student commits an answer).
  const correctIdx = feedback ? feedback.correctIndex : -1;
  const checked = feedback !== null || offlineSaved;
  const pending = attempt.isPending;

  const onCheck = () => {
    if (selected === null || pending) return;
    setSubmitError(null);
    // Offline: capture the answer locally and replay it on reconnect (we can't
    // show server-authoritative correctness/XP until then).
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOfflineSaved(true);
      void queueAttempt({ blockId, chosenIndex: selected });
      return;
    }
    attempt.mutate({ blockId, chosenIndex: selected });
  };

  const onReset = () => {
    setSelected(null);
    setFeedback(null);
    setSubmitError(null);
    setOfflineSaved(false);
  };

  return (
    <div>
      <div
        style={{
          fontSize: 14,
          color: "var(--wf-body)",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        {stem}
      </div>
      <div
        style={{
          display: "grid",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {opts.map((o, i) => {
          const isSelected = selected === i;
          const isCorrect = checked && i === correctIdx;
          const isWrong = checked && isSelected && i !== correctIdx;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (checked || pending) return;
                setSelected(i);
              }}
              disabled={checked || pending}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                fontSize: 13,
                textAlign: "left",
                border: isCorrect
                  ? "1.5px solid var(--wf-good)"
                  : isWrong
                    ? "1.5px solid var(--wf-accent)"
                    : isSelected
                      ? "1.5px solid var(--wf-ink)"
                      : "1px solid var(--wf-hairline)",
                background: isCorrect
                  ? "rgba(34,176,90,0.08)"
                  : isWrong
                    ? "var(--wf-accent-soft)"
                    : "white",
                borderRadius: 4,
                cursor: checked || pending ? "default" : "pointer",
                color: "var(--wf-ink)",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "1.5px solid currentColor",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span style={{ flex: 1 }}>{o.text}</span>
              {isCorrect && (
                <Icon name="check" size={12} color="var(--wf-good)" />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCheck}
          disabled={selected === null || checked || pending}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: "none",
            borderRadius: 3,
            background:
              selected === null || checked || pending
                ? "var(--wf-fill)"
                : "var(--wf-ink)",
            color:
              selected === null || checked || pending
                ? "var(--wf-mute)"
                : "white",
            cursor:
              selected === null || checked || pending ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          {pending ? t("mcqChecking") : t("mcqCheck")}
        </button>
        {checked && (
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              cursor: "pointer",
              color: "var(--wf-body)",
            }}
          >
            Try again
          </button>
        )}
        {feedback && (
          <span
            style={{
              fontSize: 12,
              color: feedback.correct ? "var(--wf-good)" : "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            {feedback.correct ? t("mcqCorrect") : t("mcqNotQuite")}
          </span>
        )}
        {feedback?.correct && feedback.points > 0 && (
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              background: "var(--wf-good)",
              color: "white",
              letterSpacing: "0.06em",
              fontWeight: 700,
            }}
          >
            +{feedback.points} XP
          </span>
        )}
        {feedback?.bonusPoints && feedback.bonusPoints > 0 ? (
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              background: "var(--wf-accent)",
              color: "white",
              letterSpacing: "0.06em",
              fontWeight: 700,
            }}
          >
            +{feedback.bonusPoints} STREAK
          </span>
        ) : null}
        {feedback?.streak?.milestone && (
          <span
            style={{
              fontSize: 11,
              color: "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            🔥 {feedback.streak.milestone}-day streak!
          </span>
        )}
        {feedback?.badgeAwarded && (
          <span
            style={{
              fontSize: 11,
              color: "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            🏅 {feedback.badgeAwarded}
          </span>
        )}
        {offlineSaved && (
          <span style={{ fontSize: 12, color: "var(--wf-mute)", fontWeight: 600 }}>
            ✓ Saved offline — syncs when you reconnect
          </span>
        )}
      </div>
      {submitError && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--wf-accent)",
          }}
        >
          {submitError}
        </div>
      )}
    </div>
  );
}

/* ── SLIDES ───────────────────────────────────────────────── */

function SlidesBody({ settings }: { settings: Record<string, unknown> }) {
  const t = useTranslations("LessonReader");
  const rawUrl =
    typeof settings.url === "string" ? settings.url.trim() : "";
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  if (!rawUrl) {
    return (
      <EmptyBlockHint message={t("slidesEmpty")} />
    );
  }

  const embed = toSlidesEmbed(rawUrl);
  return (
    <div>
      {embed ? (
        <div
          style={{
            position: "relative",
            paddingTop: "56.25%", // 16:9 — Google Slides default ratio
            background: "var(--wf-fill)",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <iframe
            src={embed}
            title="Slides"
            loading="lazy"
            // Google Slides + PowerPoint Online both render their
            // chrome inside the frame and need scripts + same-origin
            // cookies. Forms covers the "save a copy" / publish UI.
            // Popups-to-escape-sandbox lets the "Open in Slides"
            // link-out land on the real product page unsandboxed.
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            allowFullScreen
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      ) : (
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--wf-ink)",
            textDecoration: "none",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            padding: "8px 12px",
            fontSize: 13,
          }}
        >
          {t("slidesOpen")}
        </a>
      )}
      {caption && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--wf-body)",
            lineHeight: 1.5,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}

/**
 * Normalize known slide-host URLs to their embed form. Google Slides
 * /edit URLs need to flip to /embed; /pubembed URLs are already
 * embeddable. Unknown hosts return the URL as-is — caller will iframe
 * it optimistically. Returns null only when the URL doesn't parse.
 */
function toSlidesEmbed(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (
      u.hostname === "docs.google.com" &&
      u.pathname.startsWith("/presentation/")
    ) {
      // /pubembed and /embed are already embeddable.
      if (
        u.pathname.endsWith("/embed") ||
        u.pathname.endsWith("/pubembed") ||
        u.pathname.endsWith("/pub")
      ) {
        return raw;
      }
      const match = u.pathname.match(/\/presentation\/d\/([^/]+)/);
      if (match) {
        return `https://docs.google.com/presentation/d/${match[1]}/embed`;
      }
    }
    // Other hosts: assume teacher pasted an embed-capable URL.
    return raw;
  } catch {
    return null;
  }
}

/* ── PDF ──────────────────────────────────────────────────── */

function PdfBody({ settings }: { settings: Record<string, unknown> }) {
  const t = useTranslations("LessonReader");
  const rawUrl =
    typeof settings.url === "string" ? settings.url.trim() : "";
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  if (!rawUrl) {
    return (
      <EmptyBlockHint message={t("pdfEmpty")} />
    );
  }

  // Parse to catch malformed URLs; we render the iframe optimistically
  // because many hosts allow PDF embedding even cross-origin, and
  // always surface a fallback open-in-new-tab link.
  let valid = false;
  try {
    new URL(rawUrl);
    valid = true;
  } catch {
    valid = false;
  }

  return (
    <div>
      {valid && (
        <div
          style={{
            position: "relative",
            paddingTop: "75%", // 4:3 — closer to PDF page aspect
            background: "var(--wf-fill)",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <iframe
            src={rawUrl}
            title="PDF"
            loading="lazy"
            // The browser's built-in PDF viewer runs JS inside the
            // iframe (page thumbnails, text-select, search) and may
            // read its own cookies; downloads is what wires the
            // viewer's "save" button. No popups — a PDF should never
            // open a new tab.
            sandbox="allow-scripts allow-same-origin allow-downloads"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 12,
          flexWrap: "wrap",
        }}
      >
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--wf-ink)",
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          {t("pdfOpen")}
        </a>
        {caption && (
          <span style={{ color: "var(--wf-body)" }}>· {caption}</span>
        )}
      </div>
    </div>
  );
}

/* ── POLL ─────────────────────────────────────────────────── */

function PollBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"POLL">;
}) {
  const t = useTranslations("LessonReader");
  // POLL's `stem` historically lived on the same JSON column as MCQ's
  // — preserved for back-compat. Newer polls use `prompt`.
  const stem =
    (settings as { stem?: unknown }).stem &&
    typeof (settings as { stem?: unknown }).stem === "string"
      ? ((settings as { stem: string }).stem)
      : (settings.prompt ?? "");
  // POLL options are plain strings (unlike MCQ's McqOption[]) — the
  // discriminated catalog in @/lib/blocks makes the difference
  // compile-time visible. Runtime filter still gates against bad JSON.
  const opts: string[] = (settings.options ?? []).filter(
    (o): o is string => typeof o === "string"
  );

  // Initial tallies + the viewer's current vote (null for anon /
  // hasn't voted). Re-fetched on focus so the bars stay fresh-ish
  // without us building a real subscription channel.
  const results = trpc.lesson.pollResults.useQuery(
    { blockId },
    { enabled: opts.length >= 2 }
  );

  const utils = trpc.useUtils();
  const vote = trpc.lesson.votePoll.useMutation({
    onSuccess: (res) => {
      // Server returned the new tallies — push them into the cache so
      // bars update without a refetch.
      utils.lesson.pollResults.setData({ blockId }, res);
      setLocalError(null);
    },
    onError: (err) => {
      setLocalError(
        err.data?.code === "UNAUTHORIZED"
          ? t("pollSignIn")
          : err.message ?? t("pollError")
      );
    },
  });

  const [localError, setLocalError] = useState<string | null>(null);
  const [offlineVote, setOfflineVote] = useState<number | null>(null);

  if (!stem.trim() || opts.length < 2) {
    return (
      <EmptyBlockHint message={t("pollEmpty")} />
    );
  }

  const data = results.data ?? {
    tallies: new Array(opts.length).fill(0) as number[],
    totalVotes: 0,
    myChoice: null as number | null,
  };
  const hasVoted = data.myChoice !== null;
  const pending = vote.isPending;

  return (
    <div>
      <div
        style={{
          fontSize: 14,
          color: "var(--wf-body)",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        {stem}
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {opts.map((text, i) => {
          const count = data.tallies[i] ?? 0;
          const pct =
            data.totalVotes > 0
              ? Math.round((count / data.totalVotes) * 100)
              : 0;
          const isMine = data.myChoice === i || offlineVote === i;

          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (pending || offlineVote !== null) return;
                if (data.myChoice === i) return; // already mine — noop
                // Offline: queue the vote + reflect it locally; the live
                // tallies sync on reconnect.
                if (typeof navigator !== "undefined" && !navigator.onLine) {
                  setOfflineVote(i);
                  void queuePoll({ blockId, chosenIndex: i });
                  return;
                }
                vote.mutate({ blockId, chosenIndex: i });
              }}
              disabled={pending || offlineVote !== null}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                fontSize: 13,
                textAlign: "left",
                // Highlight viewer's pick with the accent border;
                // others show subtle hairline.
                border: isMine
                  ? "1.5px solid var(--wf-accent)"
                  : "1px solid var(--wf-hairline)",
                background: "white",
                borderRadius: 4,
                cursor: pending ? "default" : "pointer",
                color: "var(--wf-ink)",
                fontFamily: "inherit",
                overflow: "hidden",
              }}
            >
              {/* Bar fill — only show once at least one vote exists. */}
              {hasVoted && pct > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${pct}%`,
                    background: isMine
                      ? "var(--wf-accent-soft)"
                      : "var(--wf-fill)",
                    transition: "width 240ms ease-out",
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  flex: 1,
                  zIndex: 1,
                }}
              >
                {text}
              </span>
              {hasVoted && (
                <span
                  className="wf-mono"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: 11,
                    color: "var(--wf-mute)",
                  }}
                >
                  {pct}% · {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {offlineVote !== null && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--wf-mute)",
            marginBottom: 8,
          }}
        >
          {t("pollOffline")}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          color: "var(--wf-mute)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>
          {hasVoted
            ? t("pollVoted", { count: data.totalVotes })
            : t("pollUnvoted", { count: data.totalVotes })}
        </span>
        {pending && (
          <span className="wf-mono" style={{ fontSize: 10 }}>
            {t("pollSaving")}
          </span>
        )}
      </div>
      {localError && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--wf-accent)",
          }}
        >
          {localError}
        </div>
      )}
    </div>
  );
}

/* ── LIVE ─────────────────────────────────────────────────── */

type LivePhase = "scheduled" | "live" | "ended";

function LiveBody({ settings }: { settings: Record<string, unknown> }) {
  const title =
    typeof settings.title === "string" ? settings.title.trim() : "";
  const startsAtRaw =
    typeof settings.startsAt === "string" ? settings.startsAt : "";
  const durationMin =
    typeof settings.durationMin === "number" && settings.durationMin > 0
      ? settings.durationMin
      : 60;
  const joinUrl =
    typeof settings.joinUrl === "string" ? settings.joinUrl.trim() : "";

  // Re-render every 30s so the "starts in X" / "live now" / "ended"
  // affordance stays current without a refetch. The interval kicks off
  // a fresh now-state which derives all the display flags.
  // `now` starts null so the server render and the first client
  // render agree (both show the placeholder below). Reading Date.now()
  // during render — or formatting a date in the runtime locale/
  // timezone — diverges between the Node SSR pass and the browser.
  // The clock is read post-mount; the time-derived card then renders
  // entirely client-side.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount clock init; a legit external-sync effect (the wall clock). Reading Date.now() during render would desync the SSR and first client render.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const startsAt = (() => {
    if (!startsAtRaw) return null;
    const d = new Date(startsAtRaw);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  if (!startsAt) {
    return (
      <EmptyBlockHint message="Your teacher hasn't scheduled this live session yet." />
    );
  }

  // Stable, time-independent placeholder until the client clock is
  // known — keeps SSR === first client render (no hydration drift).
  if (now === null) {
    return (
      <div className="wf-mono" style={{ fontSize: 12, color: "var(--wf-mute)" }}>
        ● Live session · {durationMin} min
      </div>
    );
  }

  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  const phase: LivePhase =
    now < startsAt.getTime()
      ? "scheduled"
      : now < endsAt.getTime()
        ? "live"
        : "ended";

  const phaseColor =
    phase === "live"
      ? "var(--wf-accent)"
      : phase === "scheduled"
        ? "var(--wf-ai)"
        : "var(--wf-mute)";
  const phaseLabel =
    phase === "live"
      ? "● LIVE NOW"
      : phase === "scheduled"
        ? "● UPCOMING"
        : "● ENDED";

  const relative = (() => {
    if (phase === "scheduled") {
      const diffMin = Math.round((startsAt.getTime() - now) / 60_000);
      if (diffMin < 1) return "starting now";
      if (diffMin < 60) return `starts in ${diffMin}m`;
      const diffHr = Math.round(diffMin / 60);
      if (diffHr < 24) return `starts in ${diffHr}h`;
      const diffDay = Math.round(diffHr / 24);
      return `starts in ${diffDay}d`;
    }
    if (phase === "live") {
      const diffMin = Math.round((endsAt.getTime() - now) / 60_000);
      return diffMin > 0 ? `ends in ${diffMin}m` : "wrapping up";
    }
    // ended
    const diffMin = Math.round((now - endsAt.getTime()) / 60_000);
    if (diffMin < 60) return `ended ${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `ended ${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `ended ${diffDay}d ago`;
  })();

  const formattedWhen = startsAt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const canJoin = phase === "live" && joinUrl !== "";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          className="wf-mono"
          style={{
            fontSize: 10,
            color: phaseColor,
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {phaseLabel}
        </span>
        <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
          {relative}
        </span>
      </div>
      {title && (
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 6,
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          fontSize: 12,
          color: "var(--wf-body)",
          marginBottom: 12,
        }}
      >
        {formattedWhen} · {durationMin} min
      </div>
      {joinUrl ? (
        <a
          href={canJoin ? joinUrl : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!canJoin}
          onClick={(e) => {
            if (!canJoin) e.preventDefault();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            borderRadius: 3,
            // Big-accent button only when actually live; otherwise muted
            // so the page doesn't tempt students to click prematurely.
            background:
              phase === "live"
                ? "var(--wf-accent)"
                : phase === "scheduled"
                  ? "var(--wf-fillsoft)"
                  : "var(--wf-fill)",
            color:
              phase === "live"
                ? "white"
                : phase === "scheduled"
                  ? "var(--wf-mute)"
                  : "var(--wf-mute)",
            cursor: canJoin ? "pointer" : "not-allowed",
            textDecoration: "none",
            opacity: canJoin ? 1 : 0.85,
          }}
        >
          {phase === "live"
            ? "Join now →"
            : phase === "scheduled"
              ? "Join opens at start time"
              : "Session ended"}
        </a>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: "var(--wf-mute)",
            fontStyle: "italic",
          }}
        >
          Join link hasn&apos;t been added yet.
        </div>
      )}
    </div>
  );
}

/* ── BRANCHING ────────────────────────────────────────────── */

function BranchingBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"BRANCHING">;
}) {
  // settings.nodes is BranchingNode[] | undefined; runtime filter is
  // defensive against malformed JSON edited outside the inspector.
  const rawNodes: BranchingNode[] = (settings.nodes ?? []).filter(
    (n): n is BranchingNode =>
      !!n &&
      typeof n === "object" &&
      typeof n.id === "string" &&
      typeof n.title === "string" &&
      typeof n.body === "string" &&
      Array.isArray(n.choices)
  );

  // Build a lookup once per render. The graph is small (≤8 nodes) so
  // even rebuilding every render is negligible.
  const byId = useMemo(() => {
    const m = new Map<string, BranchingNode>();
    for (const n of rawNodes) m.set(n.id, n);
    return m;
  }, [rawNodes]);

  const startId = rawNodes[0]?.id ?? null;
  const [currentId, setCurrentId] = useState<string | null>(startId);
  // Visited path for the breadcrumb. Trims the head if the student
  // loops, so the breadcrumb stays linear-ish.
  const [path, setPath] = useState<string[]>(
    startId ? [startId] : []
  );

  // Track terminals we've already completed in this page-load so a
  // student bouncing back to the same terminal via restart-and-walk
  // doesn't double-fire the mutation. New terminals (alt paths) DO
  // re-fire — exploratory XP rewards alt-route discovery.
  // Dedup tracker only (never rendered) — a ref, so marking a terminal
  // complete doesn't setState inside the effect below.
  const completedTerminalsRef = useRef<Set<string>>(new Set());
  const [terminalFeedback, setTerminalFeedback] = useState<{
    nodeId: string;
    points: number;
    bonusPoints: number;
    streak: { current: number; milestone: number | null } | null;
    badgeAwarded: string | null;
  } | null>(null);

  const complete = trpc.lesson.completeBranching.useMutation({
    onSuccess: (res) => {
      setTerminalFeedback({
        nodeId: res.terminalNodeId,
        points: res.points,
        bonusPoints: res.bonusPoints,
        streak: res.streak,
        badgeAwarded: res.badgeAwarded,
      });
    },
    // Silent on error — terminal still renders fine; we just don't
    // award XP. The lesson page isn't blocked.
  });

  // Fire on terminal entry. Must live above the early returns so the
  // hook call order stays consistent across renders.
  useEffect(() => {
    const cur = currentId ? byId.get(currentId) : null;
    if (!cur || cur.choices.length !== 0) return;
    if (completedTerminalsRef.current.has(cur.id)) return;
    completedTerminalsRef.current.add(cur.id);
    // Branching plays entirely client-side, so the lesson works offline;
    // only the XP-award mutation needs the network. Offline → queue it.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void queueBranching({ blockId, terminalNodeId: cur.id });
    } else {
      complete.mutate({ blockId, terminalNodeId: cur.id });
    }
    // Re-fire only when currentId changes to a not-yet-completed
    // terminal; `complete` is intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  if (rawNodes.length === 0 || !startId) {
    return (
      <EmptyBlockHint message="Your teacher hasn't built the branching scenario yet." />
    );
  }

  const node = currentId ? byId.get(currentId) : null;

  const onChoose = (targetId: string) => {
    if (!byId.has(targetId)) return; // dangling — render handles it
    setCurrentId(targetId);
    setPath((prev) =>
      prev[prev.length - 1] === targetId ? prev : [...prev, targetId]
    );
  };
  const onRestart = () => {
    setCurrentId(startId);
    setPath([startId]);
  };

  // Dangling-target edge: teacher deleted a node, an old choice still
  // points at it. Bail to a friendly "End" rather than crashing.
  if (!node) {
    return (
      <div>
        <div
          style={{
            fontSize: 13,
            color: "var(--wf-mute)",
            fontStyle: "italic",
            marginBottom: 10,
          }}
        >
          This branch ends here — destination node is missing.
        </div>
        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: "5px 10px",
            fontSize: 11,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            cursor: "pointer",
            color: "var(--wf-body)",
          }}
        >
          Restart
        </button>
      </div>
    );
  }

  const isTerminal = node.choices.length === 0;
  const isStart = node.id === startId;

  return (
    <div>
      {/* Breadcrumb */}
      <div
        className="wf-mono"
        style={{
          fontSize: 9,
          color: "var(--wf-mute)",
          letterSpacing: "0.06em",
          marginBottom: 10,
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {path.map((id, i) => {
          const n = byId.get(id);
          const title = n?.title || "(missing)";
          return (
            <span key={`${id}-${i}`}>
              {i > 0 && <span style={{ margin: "0 4px" }}>›</span>}
              {title.toUpperCase()}
            </span>
          );
        })}
      </div>

      {/* Current node */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {node.title}
      </div>
      {node.body && (
        <div
          style={{
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.5,
            marginBottom: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {node.body}
        </div>
      )}

      {/* Choices or End */}
      {isTerminal ? (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              className="wf-mono"
              style={{
                fontSize: 10,
                color: "var(--wf-good)",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              ● END
            </span>
            {terminalFeedback?.nodeId === node.id &&
              terminalFeedback.points > 0 && (
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 2,
                    background: "var(--wf-good)",
                    color: "white",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  +{terminalFeedback.points} XP
                </span>
              )}
            {terminalFeedback?.nodeId === node.id &&
              terminalFeedback.bonusPoints > 0 && (
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 2,
                    background: "var(--wf-accent)",
                    color: "white",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  +{terminalFeedback.bonusPoints} STREAK
                </span>
              )}
            {terminalFeedback?.nodeId === node.id &&
              terminalFeedback.streak?.milestone && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--wf-accent)",
                    fontWeight: 600,
                  }}
                >
                  🔥 {terminalFeedback.streak.milestone}-day streak!
                </span>
              )}
          </div>
          {!isStart && (
            <button
              type="button"
              onClick={onRestart}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                border: "1px solid var(--wf-hairline)",
                borderRadius: 3,
                background: "white",
                cursor: "pointer",
                color: "var(--wf-body)",
              }}
            >
              ↺ Restart
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {node.choices.map((c, i) => {
            const targetExists = byId.has(c.to);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChoose(c.to)}
                disabled={!targetExists}
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  textAlign: "left",
                  border: "1px solid var(--wf-hairline)",
                  background: targetExists ? "white" : "var(--wf-fill)",
                  borderRadius: 3,
                  cursor: targetExists ? "pointer" : "not-allowed",
                  color: targetExists ? "var(--wf-ink)" : "var(--wf-mute)",
                  fontFamily: "inherit",
                }}
              >
                {c.label || `(unlabeled choice ${i + 1})`}
                {!targetExists && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: "var(--wf-mute)",
                    }}
                  >
                    (missing target)
                  </span>
                )}
              </button>
            );
          })}
          {!isStart && (
            <button
              type="button"
              onClick={onRestart}
              style={{
                marginTop: 4,
                padding: "5px 10px",
                fontSize: 11,
                border: "1px solid var(--wf-hairline)",
                borderRadius: 3,
                background: "white",
                cursor: "pointer",
                color: "var(--wf-body)",
                alignSelf: "flex-start",
              }}
            >
              ↺ Restart
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── SPEAK ────────────────────────────────────────────────── */

/**
 * Minimal shape for the WebSpeech SpeechRecognition API. The full
 * types live in the DOM lib but aren't always shipped under standard
 * names — we just need start/stop, the event shape, and a couple of
 * properties we set on the instance.
 */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ── FREE_RESPONSE ───────────────────────────────────────── */

/**
 * Student writes a short answer; the server grades it against the
 * teacher's rubric (AI when a key is set, honest keyword heuristic in
 * demo mode) and returns a 0-100 score + feedback. Resubmits allowed —
 * each shows the fresh grade; the per-user AI quota is the brake.
 */
function FreeResponseBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"FREE_RESPONSE">;
}) {
  const t = useTranslations("LessonReader");
  const [answer, setAnswer] = useState("");
  const grade = trpc.lesson.gradeFreeResponse.useMutation();
  const result = grade.data ?? null;

  const prompt =
    typeof settings.prompt === "string" && settings.prompt.trim()
      ? settings.prompt.trim()
      : null;
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const tooShort = answer.trim().length < 20;

  if (!prompt) {
    return (
      <div
        style={{
          padding: 12,
          border: "1px dashed var(--wf-hairline)",
          borderRadius: 3,
          fontSize: 12,
          color: "var(--wf-mute)",
          lineHeight: 1.5,
        }}
      >
        {t("frEmpty")}
      </div>
    );
  }

  const scoreColor =
    result === null
      ? "var(--wf-mute)"
      : result.score >= 80
        ? "var(--wf-good)"
        : result.score >= 60
          ? "var(--wf-warn)"
          : "var(--wf-accent)";

  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
        {prompt}
      </div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        maxLength={5_000}
        disabled={grade.isPending}
        placeholder={t("frPlaceholder")}
        style={{
          width: "100%",
          fontSize: 13,
          lineHeight: 1.6,
          padding: 10,
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          outline: "none",
          resize: "vertical",
          fontFamily: "var(--font-sans-stack)",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 8,
        }}
      >
        <button
          type="button"
          disabled={grade.isPending || tooShort}
          onClick={() => grade.mutate({ blockId, answer })}
          style={{
            padding: "7px 14px",
            borderRadius: 4,
            border: "none",
            background: "var(--wf-ink)",
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: grade.isPending || tooShort ? "default" : "pointer",
            opacity: grade.isPending || tooShort ? 0.55 : 1,
          }}
        >
          {grade.isPending
            ? t("frGrading")
            : result
              ? t("frResubmit")
              : t("frSubmit")}
        </button>
        <span
          className="wf-mono"
          style={{ fontSize: 10, color: "var(--wf-mute)" }}
        >
          {t("frWords", { count: words })}
          {tooShort && answer.length > 0 ? t("frWriteMore") : ""}
        </span>
      </div>

      {grade.error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--wf-accent)",
            padding: "6px 10px",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 4,
          }}
        >
          {grade.error.message}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            border: "1px solid var(--wf-hairline)",
            borderLeft: `3px solid ${scoreColor}`,
            borderRadius: 4,
            background: "var(--wf-fillsoft)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <span
              className="wf-serif"
              style={{ fontSize: 20, fontWeight: 700, color: scoreColor }}
            >
              {result.score}/100
            </span>
            {result.points > 0 && (
              <span
                className="wf-mono"
                style={{ fontSize: 10, color: "var(--wf-good)" }}
              >
                +{result.points + result.bonusPoints} XP
              </span>
            )}
            {result.mode === "demo" && (
              <span
                className="wf-mono"
                style={{ fontSize: 9, color: "var(--wf-mute)" }}
              >
                {t("frDemoGrader")}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {result.feedback}
          </div>
          {result.strengths.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
              {result.strengths.map((s, i) => (
                <div key={i} style={{ color: "var(--wf-good)" }}>
                  ✓ {s}
                </div>
              ))}
            </div>
          )}
          {result.improvements.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6 }}>
              {result.improvements.map((s, i) => (
                <div key={i} style={{ color: "var(--wf-body)" }}>
                  → {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpeakBody({ settings }: { settings: Record<string, unknown> }) {
  const prompt =
    typeof settings.prompt === "string" ? settings.prompt.trim() : "";
  const expected =
    typeof settings.expected === "string" ? settings.expected.trim() : "";
  const language =
    typeof settings.language === "string" && settings.language.trim() !== ""
      ? settings.language.trim()
      : "en-US";

  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [typedFallback, setTypedFallback] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // SSR-safe browser-capability detection via useSyncExternalStore: the
  // server snapshot is no-capability, the client resolves the real value
  // on mount — no effect, no setState, no hydration mismatch (the same
  // primitive as useMediaQuery). getSpeechRecognitionCtor returns a
  // stable constructor reference, so getSnapshot stays referentially
  // stable (no re-render loop).
  const recognitionCtor = useSyncExternalStore(
    noopSubscribe,
    () => getSpeechRecognitionCtor(),
    () => null
  );
  const ttsAvailable = useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false
  );

  // A real ref: `.current` is mutable by contract, so assigning the live
  // SpeechRecognition instance to it (in startListening) is allowed under
  // the React Compiler. A useMemo-created object would trip
  // react-hooks/immutability — that was KNOWN_ISSUES S1-3.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Cleanup any in-flight TTS / STT when the component unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current?.abort();
      } catch {
        // Some browsers throw when abort() is called on an already-stopped
        // instance. The cleanup path doesn't care.
      }
    };
  }, [recognitionRef]);

  if (!prompt) {
    return (
      <EmptyBlockHint message="Your teacher hasn't added a speaking prompt yet." />
    );
  }

  const speakPrompt = () => {
    if (!ttsAvailable) return;
    // Cancel any in-flight utterance so re-clicks restart cleanly
    // instead of queueing.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(prompt);
    utterance.lang = language;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (!recognitionCtor) return;
    setErrorMsg(null);
    setTranscript("");
    const r = new recognitionCtor();
    r.lang = language;
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (event) => {
      // Collect all final + interim segments into one string so the
      // student sees their words appear as they speak.
      let out = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const alt = event.results[i][0];
        if (alt) out += alt.transcript;
      }
      setTranscript(out);
    };
    r.onerror = (event) => {
      // "no-speech" fires when the user starts then doesn't say
      // anything — friendlier wording than the raw event name.
      const friendly =
        event.error === "no-speech"
          ? "Didn't catch anything — try again."
          : event.error === "not-allowed"
            ? "Microphone permission denied. Allow access and retry."
            : `Recognition error: ${event.error}`;
      setErrorMsg(friendly);
      setListening(false);
    };
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setErrorMsg("Couldn't start recording. Refresh and try again.");
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // No-op — same defensive pattern as the unmount cleanup.
    }
    setListening(false);
  };

  // Compare transcript (or typed fallback) to expected. Case-
  // insensitive, whitespace-collapsed, punctuation-stripped. Good
  // enough for k-12 speaking exercises; full phonetic match is a
  // future iteration.
  const submittedText = (transcript || typedFallback).trim();
  const checkResult: "match" | "close" | "different" | null =
    expected && submittedText
      ? matchScore(submittedText, expected)
      : null;

  return (
    <div>
      <div
        style={{
          fontSize: 14,
          color: "var(--wf-body)",
          lineHeight: 1.5,
          marginBottom: 12,
          padding: "10px 12px",
          background: "var(--wf-fillsoft)",
          borderLeft: "3px solid var(--wf-ai)",
          borderRadius: 3,
        }}
      >
        {prompt}
      </div>

      {/* TTS row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {ttsAvailable ? (
          <button
            type="button"
            onClick={speakPrompt}
            disabled={speaking}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid var(--wf-ai)",
              borderRadius: 3,
              background: speaking ? "var(--wf-fillsoft)" : "white",
              color: "var(--wf-ai)",
              cursor: speaking ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {speaking ? "🔊 Speaking…" : "🔊 Read aloud"}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
            Text-to-speech isn&apos;t available in this browser.
          </span>
        )}
      </div>

      {/* STT row OR text fallback */}
      {recognitionCtor ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "none",
              borderRadius: 3,
              background: listening ? "var(--wf-accent)" : "var(--wf-ink)",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {listening ? "● Stop" : "🎤 Speak your answer"}
          </button>
          {listening && (
            <span style={{ fontSize: 11, color: "var(--wf-accent)" }}>
              Listening — speak now.
            </span>
          )}
        </div>
      ) : (
        // Firefox / Safari iOS — fall back to a text input so the
        // student can still complete the exercise.
        <div style={{ marginBottom: 10 }}>
          <div
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-mute)",
              marginBottom: 4,
              letterSpacing: "0.06em",
            }}
          >
            TYPE YOUR ANSWER (VOICE NOT AVAILABLE)
          </div>
          <input
            type="text"
            value={typedFallback}
            onChange={(e) => setTypedFallback(e.target.value)}
            placeholder="Type what you would say…"
            maxLength={500}
            style={{
              width: "100%",
              padding: "6px 9px",
              fontSize: 13,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              fontFamily: "inherit",
            }}
          />
        </div>
      )}

      {(transcript || typedFallback) && (
        <div
          style={{
            padding: "8px 10px",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            fontSize: 13,
            color: "var(--wf-body)",
            background: "white",
            marginBottom: 8,
            minHeight: 32,
          }}
        >
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-mute)",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            HEARD
          </div>
          {transcript || typedFallback}
        </div>
      )}

      {checkResult && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color:
              checkResult === "match"
                ? "var(--wf-good)"
                : checkResult === "close"
                  ? "var(--wf-ai)"
                  : "var(--wf-accent)",
            marginBottom: 8,
          }}
        >
          {checkResult === "match"
            ? "✓ Match!"
            : checkResult === "close"
              ? "Close — try again for an exact match."
              : `Different — expected: "${expected}"`}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            fontSize: 11,
            color: "var(--wf-accent)",
            marginBottom: 4,
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}

/** Quick lexical match: normalize then compare. Counts a "close"
 *  result when the Levenshtein-style word-set overlap is high. */
function matchScore(
  said: string,
  expected: string
): "match" | "close" | "different" {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(said);
  const b = norm(expected);
  if (a === b) return "match";
  if (!a || !b) return "different";
  // Word-set overlap heuristic — good enough for speaking practice.
  const aSet = new Set(a.split(" "));
  const bSet = new Set(b.split(" "));
  let shared = 0;
  for (const w of aSet) if (bSet.has(w)) shared += 1;
  const overlap = shared / Math.max(aSet.size, bSet.size);
  return overlap >= 0.7 ? "close" : "different";
}

/* ── SIMULATION ───────────────────────────────────────────── */

function SimulationBody({ settings }: { settings: Record<string, unknown> }) {
  const rawUrl =
    typeof settings.url === "string" ? settings.url.trim() : "";
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  if (!rawUrl) {
    return (
      <EmptyBlockHint message="Your teacher hasn't added a simulation URL yet." />
    );
  }

  // Cheap URL validity check — bad strings render the link fallback
  // instead of an iframe with a broken src that the browser would
  // chew on for a few seconds before erroring.
  let valid = false;
  try {
    new URL(rawUrl);
    valid = true;
  } catch {
    valid = false;
  }

  return (
    <div>
      {valid ? (
        <div
          style={{
            position: "relative",
            paddingTop: "62.5%", // 16:10 — most sims sit between 16:9 and 4:3
            background: "var(--wf-fill)",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <iframe
            src={rawUrl}
            title="Simulation"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            // SIMULATION is the most-permissive iframe surface —
            // teacher-supplied URLs include PhET, Desmos, GeoGebra,
            // arbitrary HTML widgets. Grants the union of what those
            // hosts need: scripts/same-origin for runtime + cookies,
            // forms for data entry, popups+escape for "Open in new
            // tab" affordances, presentation for fullscreen, downloads
            // for "export data" UIs. Still NOT granted:
            // allow-top-navigation (the sim can't pull the parent
            // window away from /student/lesson/...).
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads"
            allowFullScreen
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      ) : (
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--wf-ink)",
            textDecoration: "none",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            padding: "8px 12px",
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          Open simulation ↗
        </a>
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 12,
          color: "var(--wf-body)",
          flexWrap: "wrap",
        }}
      >
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            textDecoration: "none",
            letterSpacing: "0.06em",
          }}
        >
          OPEN IN NEW TAB ↗
        </a>
        {caption && (
          <span style={{ color: "var(--wf-body)" }}>· {caption}</span>
        )}
      </div>
    </div>
  );
}

/* ── QUIZ ─────────────────────────────────────────────────── */

function QuizBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"QUIZ">;
}) {
  const questions: QuizQuestion[] = settings.questions ?? [];

  // Validate each question has the expected shape — defensive in case
  // teacher saves a malformed JSON (shouldn't happen via inspector but
  // settings is open JSON).
  const valid = questions.filter(
    (q) =>
      q !== null &&
      typeof q === "object" &&
      typeof q.stem === "string" &&
      Array.isArray(q.answers) &&
      q.answers.length >= 2 &&
      q.answers.some((a: { correct?: boolean }) => a?.correct === true)
  );

  if (valid.length === 0) {
    return (
      <EmptyBlockHint message="Your teacher hasn't added any questions to this quiz yet." />
    );
  }

  return (
    <div>
      <div
        className="wf-mono"
        style={{
          fontSize: 9,
          color: "var(--wf-mute)",
          letterSpacing: "0.06em",
          marginBottom: 12,
        }}
      >
        {valid.length} QUESTION{valid.length === 1 ? "" : "S"} · SELF-CHECK
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {valid.map((q, i) => (
          <QuizQuestionCard
            key={i}
            blockId={blockId}
            subIndex={i}
            index={i}
            question={q}
          />
        ))}
      </div>
    </div>
  );
}

/* ── DRAG_MATCH ───────────────────────────────────────────── */

function DragMatchBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"DRAG_MATCH">;
}) {
  // DRAG_MATCH stores a `prompt` for the activity caption even though
  // it's not on `DragMatchSettings` — read defensively for legacy
  // JSON. (Move into DragMatchSettings if the inspector ever adopts a
  // prompt editor.)
  const promptRaw = (settings as { prompt?: unknown }).prompt;
  const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
  const rawPairs: DragMatchPair[] = (settings.pairs ?? []).filter(
    (p): p is DragMatchPair =>
      !!p &&
      typeof p.left === "string" &&
      typeof p.right === "string" &&
      p.left.trim() !== "" &&
      p.right.trim() !== ""
  );

  // Stable shuffle of right-side items so the pool isn't pre-aligned.
  // Seeded by blockId so re-renders within a session don't re-shuffle
  // (would feel jittery to the student).
  const shuffledRightIndices = useMemo(
    () => seededShuffle(rawPairs.map((_, i) => i), blockId),
    // blockId fixes the seed; rawPairs.length covers teacher edits
    // adding/removing pairs without re-shuffling on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockId, rawPairs.length]
  );

  // placements[leftIdx] = rightIdx (or null when slot is empty).
  const [placements, setPlacements] = useState<Record<number, number | null>>(
    () => Object.fromEntries(rawPairs.map((_, i) => [i, null]))
  );
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    correctCount: number;
    totalPairs: number;
    points: number;
    bonusPoints: number;
    streak: { current: number; milestone: number | null } | null;
    badgeAwarded: string | null;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);

  const complete = trpc.lesson.completeDragMatch.useMutation({
    onSuccess: (res) => {
      setFeedback(res);
      setSubmitError(null);
    },
    onError: (err) => {
      setSubmitError(
        err.data?.code === "UNAUTHORIZED"
          ? "Sign in to save your matches."
          : err.message ?? "Couldn't submit your matches. Try again."
      );
    },
  });

  const checked = feedback !== null || offlineSaved;
  const pending = complete.isPending;

  const sensors = useSensors(
    // Match the course-builder activation distance so a click doesn't
    // arm the drag mid-tap on touch devices.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  if (rawPairs.length < 2) {
    return (
      <EmptyBlockHint message="Your teacher hasn't finished setting up the matching pairs yet." />
    );
  }

  const usedRightIndices = new Set(
    Object.values(placements).filter((v): v is number => v !== null)
  );
  const poolIndices = shuffledRightIndices.filter(
    (i) => !usedRightIndices.has(i)
  );
  const allFilled =
    Object.values(placements).every((v) => v !== null) &&
    poolIndices.length === 0;

  const onDragEnd = (event: DragEndEvent) => {
    if (checked) return; // freeze on check; Reset re-enables
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Decode active: "pool-N" or "placed-N" (N = rightIdx)
    const match = activeId.match(/^(?:pool|placed)-(\d+)$/);
    if (!match) return;
    const rightIdx = parseInt(match[1], 10);
    if (Number.isNaN(rightIdx)) return;

    setPlacements((prev) => {
      const next = { ...prev };

      // Remove this rightIdx from any slot it currently occupies.
      for (const k of Object.keys(next)) {
        if (next[Number(k)] === rightIdx) next[Number(k)] = null;
      }

      // Drop targets: "slot-N" or "pool"
      if (overId === "pool") {
        // Already removed from slots above; nothing else to do.
        return next;
      }
      const slotMatch = overId.match(/^slot-(\d+)$/);
      if (!slotMatch) return prev;
      const slotIdx = parseInt(slotMatch[1], 10);
      if (Number.isNaN(slotIdx) || slotIdx >= rawPairs.length) return prev;

      // If the slot is occupied by another rightIdx, that one bounces
      // back to the pool (i.e. just clear its placement — usedRightIndices
      // recomputes from `next` on next render so it'll appear in the pool).
      next[slotIdx] = rightIdx;
      return next;
    });
  };

  const onReset = () => {
    setPlacements(Object.fromEntries(rawPairs.map((_, i) => [i, null])));
    setFeedback(null);
    setSubmitError(null);
    setOfflineSaved(false);
  };

  const onCheck = () => {
    if (!allFilled || pending || checked) return;
    setSubmitError(null);
    // Server expects a flat array of (number | null) indexed by slot.
    const placementsArr = rawPairs.map((_, i) => placements[i] ?? null);
    // Offline: we can't compute the server-authoritative score, so save the
    // placements for replay and show a neutral "saved offline" state.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOfflineSaved(true);
      void queueDragMatch({ blockId, placements: placementsArr });
      return;
    }
    complete.mutate({ blockId, placements: placementsArr });
  };

  return (
    <div>
      {prompt && (
        <div
          style={{
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          {prompt}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {/* Pool */}
        <DragMatchPool poolIndices={poolIndices} pairs={rawPairs} />

        {/* Slots */}
        <div
          style={{
            display: "grid",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {rawPairs.map((pair, slotIdx) => {
            const placedRightIdx = placements[slotIdx];
            const placedPair =
              placedRightIdx !== null ? rawPairs[placedRightIdx] : null;
            const isCorrect =
              checked &&
              placedPair !== null &&
              placedPair.right === pair.right;
            const isWrong =
              checked && placedPair !== null && placedPair.right !== pair.right;
            return (
              <div
                key={slotIdx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                {/* Left side (anchored) */}
                <div
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--wf-hairline)",
                    borderRadius: 4,
                    fontSize: 13,
                    background: "var(--wf-fillsoft)",
                  }}
                >
                  {pair.left}
                </div>
                <span
                  style={{
                    color: isCorrect
                      ? "var(--wf-good)"
                      : isWrong
                        ? "var(--wf-accent)"
                        : "var(--wf-mute)",
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  {isCorrect ? "✓" : isWrong ? "✗" : "↔"}
                </span>
                {/* Right slot (drop target + draggable when filled) */}
                <DragMatchSlot
                  slotIdx={slotIdx}
                  placedRightIdx={placedRightIdx}
                  pairs={rawPairs}
                  isCorrect={isCorrect}
                  isWrong={isWrong}
                  disabled={checked}
                />
              </div>
            );
          })}
        </div>
      </DndContext>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCheck}
          disabled={!allFilled || checked || pending}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: "none",
            borderRadius: 3,
            background:
              !allFilled || checked || pending
                ? "var(--wf-fill)"
                : "var(--wf-ink)",
            color:
              !allFilled || checked || pending
                ? "var(--wf-mute)"
                : "white",
            cursor:
              !allFilled || checked || pending ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          {pending ? "Checking…" : "Check matches"}
        </button>
        {checked && (
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              cursor: "pointer",
              color: "var(--wf-body)",
            }}
          >
            Reset
          </button>
        )}
        {feedback && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: feedback.correct
                ? "var(--wf-good)"
                : "var(--wf-accent)",
            }}
          >
            {feedback.correct
              ? "✓ All matched!"
              : `${feedback.correctCount} / ${feedback.totalPairs} correct`}
          </span>
        )}
        {offlineSaved && (
          <span
            style={{ fontSize: 12, fontWeight: 600, color: "var(--wf-mute)" }}
          >
            ✓ Saved offline — syncs when you reconnect
          </span>
        )}
        {feedback && feedback.points > 0 && (
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              background: "var(--wf-good)",
              color: "white",
              letterSpacing: "0.06em",
              fontWeight: 700,
            }}
          >
            +{feedback.points} XP
          </span>
        )}
        {feedback?.bonusPoints && feedback.bonusPoints > 0 ? (
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              background: "var(--wf-accent)",
              color: "white",
              letterSpacing: "0.06em",
              fontWeight: 700,
            }}
          >
            +{feedback.bonusPoints} STREAK
          </span>
        ) : null}
        {feedback?.streak?.milestone && (
          <span
            style={{
              fontSize: 11,
              color: "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            🔥 {feedback.streak.milestone}-day streak!
          </span>
        )}
      </div>
      {submitError && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--wf-accent)",
          }}
        >
          {submitError}
        </div>
      )}
    </div>
  );
}

function DragMatchPool({
  poolIndices,
  pairs,
}: {
  poolIndices: number[];
  pairs: DragMatchPair[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 56,
        padding: 8,
        marginBottom: 12,
        border: isOver
          ? "1.5px dashed var(--wf-accent)"
          : "1px dashed var(--wf-hairline)",
        background: isOver ? "var(--wf-accent-soft)" : "var(--wf-fill)",
        borderRadius: 4,
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      {poolIndices.length === 0 ? (
        <span
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            letterSpacing: "0.06em",
          }}
        >
          ALL PLACED — DRAG A SLOT ITEM HERE TO RETURN IT
        </span>
      ) : (
        poolIndices.map((rightIdx) => (
          <DragMatchChip
            key={rightIdx}
            id={`pool-${rightIdx}`}
            label={pairs[rightIdx].right}
          />
        ))
      )}
    </div>
  );
}

function DragMatchSlot({
  slotIdx,
  placedRightIdx,
  pairs,
  isCorrect,
  isWrong,
  disabled,
}: {
  slotIdx: number;
  placedRightIdx: number | null;
  pairs: DragMatchPair[];
  isCorrect: boolean;
  isWrong: boolean;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slotIdx}`,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 38,
        padding: 4,
        border: isCorrect
          ? "1.5px solid var(--wf-good)"
          : isWrong
            ? "1.5px solid var(--wf-accent)"
            : isOver
              ? "1.5px dashed var(--wf-accent)"
              : "1px dashed var(--wf-hairline)",
        background: isCorrect
          ? "rgba(34,176,90,0.06)"
          : isWrong
            ? "var(--wf-accent-soft)"
            : isOver
              ? "var(--wf-fillsoft)"
              : "white",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
      }}
    >
      {placedRightIdx !== null ? (
        <DragMatchChip
          id={`placed-${placedRightIdx}`}
          label={pairs[placedRightIdx].right}
          inline
        />
      ) : (
        <span
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            letterSpacing: "0.06em",
            padding: "0 6px",
          }}
        >
          DROP HERE
        </span>
      )}
    </div>
  );
}

function DragMatchChip({
  id,
  label,
  inline,
}: {
  id: string;
  label: string;
  inline?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    padding: "6px 10px",
    border: "1px solid var(--wf-ink)",
    background: "white",
    borderRadius: 3,
    fontSize: 12,
    cursor: isDragging ? "grabbing" : "grab",
    userSelect: "none",
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? "0 4px 8px rgba(0,0,0,0.12)" : undefined,
    touchAction: "none",
    ...(inline ? { flex: 1, textAlign: "left" } : {}),
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {label}
    </div>
  );
}

/** Deterministic shuffle keyed by a string — same input always returns same order. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = arr.slice();
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  // Mulberry32 with the seed for a tiny stable PRNG.
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── AI_QUIZ ──────────────────────────────────────────────── */

function AiQuizBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: SettingsFor<"AI_QUIZ">;
}) {
  const generated = settings.generated;

  if (
    !generated ||
    !Array.isArray(generated.questions) ||
    generated.questions.length === 0
  ) {
    return (
      <EmptyBlockHint message="Your teacher hasn't generated questions for this quiz yet." />
    );
  }

  return (
    <div>
      <div
        className="wf-mono"
        style={{
          fontSize: 9,
          color: "var(--wf-ai)",
          letterSpacing: "0.06em",
          marginBottom: 12,
        }}
      >
        AI-GENERATED · {generated.questions.length} QUESTION
        {generated.questions.length === 1 ? "" : "S"} · SELF-CHECK
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {generated.questions.map((q, i) => (
          <QuizQuestionCard
            key={i}
            blockId={blockId}
            subIndex={i}
            index={i}
            question={q}
          />
        ))}
      </div>
    </div>
  );
}

type QuizCardFeedback = {
  correct: boolean;
  points: number;
  bonusPoints: number;
  correctIndex: number;
  streak: { current: number; milestone: number | null } | null;
  badgeAwarded: string | null;
};

function QuizQuestionCard({
  blockId,
  subIndex,
  index,
  question,
}: {
  blockId: string;
  subIndex: number;
  index: number;
  question: QuizQuestion;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<QuizCardFeedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);

  const attempt = trpc.lesson.attemptBlock.useMutation({
    onSuccess: (res) => {
      setFeedback(res);
      setSubmitError(null);
    },
    onError: (err) => {
      setSubmitError(
        err.data?.code === "UNAUTHORIZED"
          ? "Sign in to save your answer."
          : err.message ?? "Couldn't submit your answer. Try again."
      );
    },
  });

  // Map between server's positional `correctIndex` and the question's
  // lettered `key` (A/B/C/D) used for display. Server is authoritative
  // for correctness once the response arrives; before that we don't
  // colour anything.
  const checked = feedback !== null || offlineSaved;
  const pending = attempt.isPending;
  const correctKey =
    feedback !== null
      ? question.answers[feedback.correctIndex]?.key ?? ""
      : "";
  const chosenIndex =
    selected !== null
      ? question.answers.findIndex((a) => a.key === selected)
      : -1;

  const onCheck = () => {
    if (selected === null || chosenIndex < 0 || pending) return;
    setSubmitError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOfflineSaved(true);
      void queueAttempt({
        blockId,
        subIndex,
        chosenIndex,
        hintsUsed: showHint ? 1 : 0,
      });
      return;
    }
    attempt.mutate({
      blockId,
      subIndex,
      chosenIndex,
      hintsUsed: showHint ? 1 : 0,
    });
  };

  const onReset = () => {
    setSelected(null);
    setFeedback(null);
    setShowHint(false);
    setSubmitError(null);
    setOfflineSaved(false);
  };

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "var(--wf-body)",
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        <span
          className="wf-mono"
          style={{ color: "var(--wf-mute)", marginRight: 6 }}
        >
          Q{index + 1}.
        </span>
        {question.stem}
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {question.answers.map((a) => {
          const isMine = selected === a.key;
          const isCorrect = checked && a.key === correctKey;
          const isWrong = checked && isMine && a.key !== correctKey;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => {
                if (checked || pending) return;
                setSelected(a.key);
              }}
              disabled={checked || pending}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                fontSize: 12,
                textAlign: "left",
                border: isCorrect
                  ? "1.5px solid var(--wf-good)"
                  : isWrong
                    ? "1.5px solid var(--wf-accent)"
                    : isMine
                      ? "1.5px solid var(--wf-ink)"
                      : "1px solid var(--wf-hairline)",
                background: isCorrect
                  ? "rgba(34,176,90,0.08)"
                  : isWrong
                    ? "var(--wf-accent-soft)"
                    : "white",
                borderRadius: 3,
                cursor: checked ? "default" : "pointer",
                color: "var(--wf-ink)",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "1.5px solid currentColor",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  fontWeight: 700,
                }}
              >
                {a.key}
              </span>
              <span style={{ flex: 1 }}>{a.text}</span>
              {isCorrect && <Icon name="check" size={11} color="var(--wf-good)" />}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCheck}
          disabled={!selected || checked || pending}
          style={{
            padding: "5px 10px",
            fontSize: 11,
            border: "none",
            borderRadius: 3,
            background:
              !selected || checked || pending
                ? "var(--wf-fill)"
                : "var(--wf-ink)",
            color:
              !selected || checked || pending
                ? "var(--wf-mute)"
                : "white",
            cursor:
              !selected || checked || pending ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          {pending ? "Checking…" : "Check"}
        </button>
        {checked && (
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              cursor: "pointer",
              color: "var(--wf-body)",
            }}
          >
            Try again
          </button>
        )}
        {question.hint && !checked && (
          <button
            type="button"
            onClick={() => setShowHint((s) => !s)}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              cursor: "pointer",
              color: "var(--wf-ai)",
              fontWeight: 600,
            }}
          >
            {showHint ? "Hide hint" : "💡 Hint"}
          </button>
        )}
        {feedback && (
          <span
            style={{
              fontSize: 11,
              color: feedback.correct ? "var(--wf-good)" : "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            {feedback.correct
              ? "✓ Correct"
              : `Correct answer: ${correctKey || "—"}`}
          </span>
        )}
        {feedback?.correct && feedback.points > 0 && (
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              background: "var(--wf-good)",
              color: "white",
              letterSpacing: "0.06em",
              fontWeight: 700,
            }}
          >
            +{feedback.points} XP
          </span>
        )}
        {feedback?.bonusPoints && feedback.bonusPoints > 0 ? (
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 2,
              background: "var(--wf-accent)",
              color: "white",
              letterSpacing: "0.06em",
              fontWeight: 700,
            }}
          >
            +{feedback.bonusPoints} STREAK
          </span>
        ) : null}
        {feedback?.streak?.milestone && (
          <span
            style={{
              fontSize: 11,
              color: "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            🔥 {feedback.streak.milestone}-day streak!
          </span>
        )}
        {offlineSaved && (
          <span style={{ fontSize: 11, color: "var(--wf-mute)", fontWeight: 600 }}>
            ✓ Saved offline — syncs when you reconnect
          </span>
        )}
      </div>
      {submitError && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--wf-accent)",
          }}
        >
          {submitError}
        </div>
      )}
      {showHint && question.hint && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--wf-body)",
            background: "var(--wf-ai-soft, rgba(124,58,237,0.06))",
            padding: "6px 8px",
            borderLeft: "2px solid var(--wf-ai)",
            borderRadius: 2,
            lineHeight: 1.4,
          }}
        >
          {question.hint}
        </div>
      )}
    </div>
  );
}

/* ── DISCUSSION ───────────────────────────────────────────── */

function DiscussionBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: Record<string, unknown>;
}) {
  const prompt =
    typeof settings.prompt === "string" ? settings.prompt.trim() : "";

  const thread = trpc.lesson.discussionThread.useQuery({ blockId });
  const utils = trpc.useUtils();
  const post = trpc.lesson.postComment.useMutation({
    onSuccess: (res) => {
      utils.lesson.discussionThread.setData({ blockId }, res);
      setDraft("");
      setSubmitError(null);
    },
    onError: (err) => {
      setSubmitError(
        err.data?.code === "UNAUTHORIZED"
          ? "Sign in to post."
          : err.message ?? "Couldn't post your comment. Try again."
      );
    },
  });
  const del = trpc.lesson.deleteComment.useMutation({
    onSuccess: (res) => {
      utils.lesson.discussionThread.setData({ blockId }, res);
    },
    onError: (err) => {
      setSubmitError(err.message ?? "Couldn't delete that comment.");
    },
  });

  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const comments = thread.data?.comments ?? [];
  const trimmed = draft.trim();
  const canPost = trimmed.length > 0 && !post.isPending;

  return (
    <div>
      {prompt && (
        <div
          style={{
            padding: "8px 10px",
            background: "var(--wf-fillsoft)",
            border: "1px solid var(--wf-hairline)",
            borderLeft: "3px solid var(--wf-accent)",
            borderRadius: 3,
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          {prompt}
        </div>
      )}

      {/* Thread */}
      {thread.isLoading ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--wf-mute)",
            padding: "4px 0 14px",
          }}
        >
          Loading thread…
        </div>
      ) : comments.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--wf-mute)",
            fontStyle: "italic",
            padding: "4px 0 14px",
          }}
        >
          No comments yet — be the first.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              onDelete={
                c.isMine ? () => del.mutate({ commentId: c.id }) : undefined
              }
              deleting={del.isPending && del.variables?.commentId === c.id}
            />
          ))}
        </div>
      )}

      {/* Composer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Share a thought…"
          rows={2}
          maxLength={2_000}
          disabled={post.isPending}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 13,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            background: "white",
            fontFamily: "inherit",
            resize: "vertical",
            color: "var(--wf-ink)",
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!canPost) return;
            post.mutate({ blockId, body: trimmed });
          }}
          disabled={!canPost}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 3,
            background: canPost ? "var(--wf-ink)" : "var(--wf-fill)",
            color: canPost ? "white" : "var(--wf-mute)",
            cursor: canPost ? "pointer" : "default",
            alignSelf: "stretch",
          }}
        >
          {post.isPending ? "Posting…" : "Post"}
        </button>
      </div>
      {submitError && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--wf-accent)",
          }}
        >
          {submitError}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  onDelete,
  deleting,
}: {
  comment: {
    id: string;
    body: string;
    createdAt: Date | string;
    author: { id: string; name: string; avatarUrl: string | null };
    isMine: boolean;
  };
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const created =
    typeof comment.createdAt === "string"
      ? new Date(comment.createdAt)
      : comment.createdAt;
  const initials = initialsOf(comment.author.name);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 10,
        border: "1px solid var(--wf-hairline)",
        background: comment.isMine ? "var(--wf-fillsoft)" : "white",
        borderRadius: 4,
      }}
    >
      <Avatar initials={initials} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {comment.author.name}
            {comment.isMine && (
              <span
                className="wf-mono"
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                }}
              >
                YOU
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: "var(--wf-mute)" }}>
            {relativeTime(created)}
          </span>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              title="Delete your comment"
              style={{
                marginLeft: "auto",
                border: "none",
                background: "none",
                padding: 0,
                fontSize: 10,
                color: "var(--wf-mute)",
                cursor: deleting ? "default" : "pointer",
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {comment.body}
        </div>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Coarse relative time — minute / hour / day / explicit date. */
function relativeTime(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.floor(diffMs / 1_000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/* ── SECTION ──────────────────────────────────────────────── */

function SectionBody({ settings }: { settings: Record<string, unknown> }) {
  const title =
    typeof settings.title === "string" ? settings.title.trim() : "";
  const subtitle =
    typeof settings.subtitle === "string" ? settings.subtitle.trim() : "";

  if (!title) {
    return (
      <EmptyBlockHint message="Your teacher hasn't named this section yet." />
    );
  }

  return (
    <div>
      <h3
        className="wf-serif"
        style={{
          fontSize: 22,
          fontWeight: 700,
          margin: 0,
          color: "var(--wf-ink)",
          lineHeight: 1.25,
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "var(--wf-mute)",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ── shared helpers ──────────────────────────────────────── */

function EmptyBlockHint({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 10,
        border: "1px dashed var(--wf-hairline)",
        borderRadius: 3,
        fontSize: 12,
        color: "var(--wf-mute)",
        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  );
}
