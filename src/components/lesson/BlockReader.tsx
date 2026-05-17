"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Avatar, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { findBlockMeta, type BlockType } from "@/lib/blocks";
import { trpc } from "@/lib/trpc/react";

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

function renderBody(block: BlockReaderProps) {
  switch (block.type) {
    case "VIDEO":
      return <VideoBody settings={block.settings} />;
    case "READING":
      return <ReadingBody settings={block.settings} />;
    case "MCQ":
      return <McqBody blockId={block.id} settings={block.settings} />;
    case "SLIDES":
      return <SlidesBody settings={block.settings} />;
    case "PDF":
      return <PdfBody settings={block.settings} />;
    case "SECTION":
      return <SectionBody settings={block.settings} />;
    case "POLL":
      return <PollBody blockId={block.id} settings={block.settings} />;
    case "DISCUSSION":
      return <DiscussionBody blockId={block.id} settings={block.settings} />;
    case "AI_QUIZ":
      return <AiQuizBody settings={block.settings} />;
    case "DRAG_MATCH":
      return <DragMatchBody blockId={block.id} settings={block.settings} />;
    case "LIVE":
      return <LiveBody settings={block.settings} />;
    case "QUIZ":
      return <QuizBody settings={block.settings} />;
    case "SIMULATION":
      return <SimulationBody settings={block.settings} />;
    case "SPEAK":
      return <SpeakBody settings={block.settings} />;
    default:
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
          Reader for <b>{block.type}</b> blocks is on the way. Your
          teacher has added this to the lesson; the student-side
          rendering ships next.
        </div>
      );
  }
}

/* ── VIDEO ───────────────────────────────────────────────── */

function VideoBody({ settings }: { settings: Record<string, unknown> }) {
  const rawUrl =
    typeof settings.url === "string" ? settings.url.trim() : "";
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  if (!rawUrl) {
    return (
      <EmptyBlockHint message="Your teacher hasn't added a video URL yet." />
    );
  }

  const embed = toEmbedUrl(rawUrl);
  return (
    <div>
      {embed ? (
        <div
          style={{
            position: "relative",
            paddingTop: "56.25%", // 16:9
            background: "var(--wf-fill)",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <iframe
            src={embed}
            title="Video"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
        // Unknown host — link out instead of risking a broken embed.
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
          Open video ↗
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
 * Convert a watch URL to its embed form for the major hosts we
 * support. Returns null when the host is unknown — caller falls back
 * to a plain link so we don't render a misleading iframe.
 *
 * Conservative on purpose: only handles the patterns the teacher
 * is likely to paste from the browser address bar.
 */
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
  }
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "");
    if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (/^\d+$/.test(id))
      return `https://player.vimeo.com/video/${id}`;
  }
  return null;
}

/* ── READING ─────────────────────────────────────────────── */

function ReadingBody({ settings }: { settings: Record<string, unknown> }) {
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
      <EmptyBlockHint message="Your teacher hasn't added the reading content yet." />
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

type McqOption = { text: string; correct: boolean };

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
  settings: Record<string, unknown>;
}) {
  const stem = typeof settings.stem === "string" ? settings.stem : "";
  const opts: McqOption[] = Array.isArray(settings.options)
    ? (settings.options as McqOption[]).filter(
        (o): o is McqOption =>
          o !== null &&
          typeof o === "object" &&
          typeof o.text === "string" &&
          typeof o.correct === "boolean"
      )
    : [];

  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<McqFeedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      <EmptyBlockHint message="Your teacher hasn't finished setting up this question yet." />
    );
  }

  // Once the server returns, `feedback.correctIndex` is authoritative.
  // Before submit we don't know which is correct (the client receives
  // `correct: true/false` per option in settings, but UI shouldn't
  // colour anything until the student commits an answer).
  const correctIdx = feedback ? feedback.correctIndex : -1;
  const checked = feedback !== null;
  const pending = attempt.isPending;

  const onCheck = () => {
    if (selected === null || pending) return;
    setSubmitError(null);
    attempt.mutate({ blockId, chosenIndex: selected });
  };

  const onReset = () => {
    setSelected(null);
    setFeedback(null);
    setSubmitError(null);
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
          {pending ? "Checking…" : "Check answer"}
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
            {feedback.correct ? "✓ Correct" : "Not quite — try again"}
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
  const rawUrl =
    typeof settings.url === "string" ? settings.url.trim() : "";
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  if (!rawUrl) {
    return (
      <EmptyBlockHint message="Your teacher hasn't added a slides URL yet." />
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
          Open slides ↗
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
  const rawUrl =
    typeof settings.url === "string" ? settings.url.trim() : "";
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  if (!rawUrl) {
    return (
      <EmptyBlockHint message="Your teacher hasn't added a PDF URL yet." />
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
          Open PDF in new tab ↗
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
  settings: Record<string, unknown>;
}) {
  const stem = typeof settings.stem === "string" ? settings.stem : "";
  const opts: string[] = Array.isArray(settings.options)
    ? (settings.options as unknown[]).filter(
        (o): o is string => typeof o === "string"
      )
    : [];

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
          ? "Sign in to vote."
          : err.message ?? "Couldn't record your vote. Try again."
      );
    },
  });

  const [localError, setLocalError] = useState<string | null>(null);

  if (!stem.trim() || opts.length < 2) {
    return (
      <EmptyBlockHint message="Your teacher hasn't finished setting up this poll yet." />
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
          const isMine = data.myChoice === i;

          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (pending) return;
                if (data.myChoice === i) return; // already mine — noop
                vote.mutate({ blockId, chosenIndex: i });
              }}
              disabled={pending}
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
            ? `${data.totalVotes} ${data.totalVotes === 1 ? "vote" : "votes"} · click another option to change yours`
            : `${data.totalVotes} ${data.totalVotes === 1 ? "vote" : "votes"} so far — pick one to see the results`}
        </span>
        {pending && (
          <span className="wf-mono" style={{ fontSize: 10 }}>
            saving…
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
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

  // Feature-detect on mount and remember per-render. The actual
  // recognition instance lives in a ref so the same one is reused
  // across start/stop cycles.
  const recognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);
  const ttsAvailable = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    []
  );

  const recognitionRef = useMemo(() => {
    // useRef would be more conventional but useMemo with stable deps
    // gives the same single-instance semantic without an extra import.
    return { current: null as SpeechRecognitionLike | null };
  }, []);

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

function QuizBody({ settings }: { settings: Record<string, unknown> }) {
  const questions = (
    Array.isArray(settings.questions) ? settings.questions : []
  ) as QuizQuestion[];

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
          <QuizQuestionCard key={i} index={i} question={q} />
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: 10,
          color: "var(--wf-mute)",
          fontStyle: "italic",
        }}
      >
        Self-check only — XP persistence ships in a follow-up.
      </div>
    </div>
  );
}

/* ── DRAG_MATCH ───────────────────────────────────────────── */

type DragMatchPair = { left: string; right: string };

function DragMatchBody({
  blockId,
  settings,
}: {
  blockId: string;
  settings: Record<string, unknown>;
}) {
  const prompt =
    typeof settings.prompt === "string" ? settings.prompt.trim() : "";
  const rawPairs: DragMatchPair[] = Array.isArray(settings.pairs)
    ? (settings.pairs as Array<{ left?: unknown; right?: unknown }>)
        .filter(
          (p): p is DragMatchPair =>
            !!p &&
            typeof p.left === "string" &&
            typeof p.right === "string" &&
            p.left.trim() !== "" &&
            p.right.trim() !== ""
        )
    : [];

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
  const [checked, setChecked] = useState(false);

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
    setChecked(false);
  };

  const correctCount = checked
    ? rawPairs.reduce((n, _, i) => {
        const placed = placements[i];
        return placed !== null && rawPairs[placed].right === rawPairs[i].right
          ? n + 1
          : n;
      }, 0)
    : 0;

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
          onClick={() => setChecked(true)}
          disabled={!allFilled || checked}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: "none",
            borderRadius: 3,
            background:
              !allFilled || checked ? "var(--wf-fill)" : "var(--wf-ink)",
            color: !allFilled || checked ? "var(--wf-mute)" : "white",
            cursor: !allFilled || checked ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          Check matches
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
        {checked && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color:
                correctCount === rawPairs.length
                  ? "var(--wf-good)"
                  : "var(--wf-accent)",
            }}
          >
            {correctCount === rawPairs.length
              ? "✓ All matched!"
              : `${correctCount} / ${rawPairs.length} correct`}
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "var(--wf-mute)",
          fontStyle: "italic",
        }}
      >
        Self-check only — XP persistence ships in a follow-up.
      </div>
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

type QuizQuestion = {
  stem: string;
  difficulty: number;
  answers: Array<{ key: string; text: string; correct: boolean }>;
  hint?: string | null;
};

function AiQuizBody({ settings }: { settings: Record<string, unknown> }) {
  const generated = settings.generated as
    | {
        questions: QuizQuestion[];
        generatedAt: string;
        mode?: string;
      }
    | undefined;

  if (!generated || !Array.isArray(generated.questions) || generated.questions.length === 0) {
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
          <QuizQuestionCard key={i} index={i} question={q} />
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: 10,
          color: "var(--wf-mute)",
          fontStyle: "italic",
        }}
      >
        Self-check only — XP persistence ships in a follow-up.
      </div>
    </div>
  );
}

function QuizQuestionCard({
  index,
  question,
}: {
  index: number;
  question: QuizQuestion;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const correctKey = question.answers.find((a) => a.correct)?.key ?? "";

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
                if (checked) return;
                setSelected(a.key);
              }}
              disabled={checked}
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
          onClick={() => setChecked(true)}
          disabled={!selected || checked}
          style={{
            padding: "5px 10px",
            fontSize: 11,
            border: "none",
            borderRadius: 3,
            background:
              !selected || checked ? "var(--wf-fill)" : "var(--wf-ink)",
            color: !selected || checked ? "var(--wf-mute)" : "white",
            cursor: !selected || checked ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          Check
        </button>
        {checked && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setChecked(false);
              setShowHint(false);
            }}
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
        {checked && (
          <span
            style={{
              fontSize: 11,
              color: selected === correctKey ? "var(--wf-good)" : "var(--wf-accent)",
              fontWeight: 600,
            }}
          >
            {selected === correctKey ? "✓ Correct" : `Correct answer: ${correctKey}`}
          </span>
        )}
      </div>
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
            <CommentRow key={c.id} comment={c} />
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
}: {
  comment: {
    id: string;
    body: string;
    createdAt: Date | string;
    author: { id: string; name: string; avatarUrl: string | null };
    isMine: boolean;
  };
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
