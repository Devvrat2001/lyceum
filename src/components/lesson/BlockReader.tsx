"use client";

import { useMemo, useState } from "react";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
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
