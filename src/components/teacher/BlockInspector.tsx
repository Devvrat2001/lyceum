"use client";

import { useEffect, useState } from "react";
import { Btn, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { findBlockMeta, type BlockType } from "@/lib/blocks";

/**
 * Per-block editor. Replaces the course-level inspector on the
 * right side of the builder when a block is selected.
 *
 * v2 ships type-specific fields for VIDEO / READING / MCQ on top
 * of the universal `label` + `notes`. Everything else stays with
 * just the universal fields. Type dispatch lives in renderTypeFields
 * — add a new case there + extend BlockSettingsShape when the next
 * type's editor is ready.
 *
 * The form keeps a single local `draft` so users can edit several
 * fields freely without firing a network roundtrip per keystroke.
 * Save fires the mutation; the parent's `onSaved` callback updates
 * its local block-list state so the in-canvas row re-renders
 * (custom label, row hints).
 *
 * Settings is fully replaced server-side, not merged. We spread
 * `block.settings` into the draft on init and into the save payload
 * — preserves any future fields we haven't yet added an editor for
 * (forward-compatibility).
 */
export type McqOption = { text: string; correct: boolean };

export type BlockSettingsShape = {
  // universal
  label?: string;
  notes?: string;
  // VIDEO, SLIDES, PDF (all use a single share/embed URL + optional caption)
  url?: string;
  caption?: string;
  // READING
  body?: string;
  // MCQ
  stem?: string;
  options?: McqOption[];
  // SECTION (structural divider — title is the visible heading, subtitle is optional)
  title?: string;
  subtitle?: string;
  // DISCUSSION
  prompt?: string;
  // AI_QUIZ
  topic?: string;
  count?: number;
  generated?: {
    questions: Array<{
      stem: string;
      difficulty: number;
      answers: Array<{ key: string; text: string; correct: boolean }>;
      hint?: string | null;
    }>;
    generatedAt: string;
    mode?: string;
  };
  // DRAG_MATCH
  pairs?: Array<{ left: string; right: string }>;
  // LIVE (scheduled session)
  startsAt?: string; // ISO timestamp
  durationMin?: number;
  joinUrl?: string;
  // unknown / future
  [k: string]: unknown;
};

export function BlockInspector({
  block,
  onSaved,
  onDeselect,
}: {
  block: {
    id: string;
    type: BlockType;
    order: number;
    settings: BlockSettingsShape;
  };
  onSaved: (settings: BlockSettingsShape) => void;
  onDeselect: () => void;
}) {
  const meta = findBlockMeta(block.type);
  const [draft, setDraft] = useState<BlockSettingsShape>(block.settings);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; msg: string } | null
  >(null);

  // Reset draft when the selected block changes underneath us.
  useEffect(() => {
    setDraft(block.settings);
    setFeedback(null);
  }, [block.id, block.settings]);

  const updateBlock = trpc.teacher.updateBlock.useMutation({
    onSuccess: ({ block: saved }) => {
      const settings = (saved.settings ?? {}) as BlockSettingsShape;
      onSaved(settings);
      setFeedback({ kind: "ok", msg: "Saved." });
      setTimeout(() => setFeedback(null), 1800);
    },
    onError: (e) => setFeedback({ kind: "error", msg: e.message }),
  });

  // JSON.stringify is fine at our settings sizes (handful of fields)
  // and saves us writing a deep-equality helper that would have to
  // handle the McqOption array shape specifically.
  const dirty = JSON.stringify(draft) !== JSON.stringify(block.settings);

  const update = <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const onSave = () => {
    // Strip empty strings / empty arrays from the saved JSON so the
    // shape stays tidy and downstream "has X set?" checks remain
    // simple. Spread block.settings first to preserve unknown keys.
    const cleaned: BlockSettingsShape = { ...block.settings, ...draft };
    for (const k of Object.keys(cleaned) as (keyof BlockSettingsShape)[]) {
      const v = cleaned[k];
      if (typeof v === "string" && !v.trim()) delete cleaned[k];
      else if (Array.isArray(v) && v.length === 0) delete cleaned[k];
    }
    updateBlock.mutate({ blockId: block.id, settings: cleaned });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Eyebrow>Inspector · Block</Eyebrow>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onDeselect}
          aria-label="Close inspector"
          title="Deselect block"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--wf-mute)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "var(--wf-fillsoft)",
          marginBottom: 14,
        }}
      >
        <Icon
          name={meta.icon as "play"}
          size={14}
          color={meta.ai ? "var(--wf-ai)" : "var(--wf-body)"}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: meta.ai ? "var(--wf-ai)" : "var(--wf-ink)",
            }}
          >
            {meta.label}
          </div>
          <div
            className="wf-mono"
            style={{ fontSize: 9, color: "var(--wf-mute)", marginTop: 2 }}
          >
            #{block.order} · {block.type}
          </div>
        </div>
      </div>

      <TextField
        label="LABEL"
        value={draft.label ?? ""}
        onChange={(v) => update("label", v)}
        placeholder={meta.label}
        maxLength={120}
        hint={`Shown to students. Blank = use the default (${meta.label}).`}
      />

      {renderTypeFields(block.type, block.id, draft, update, onSaved)}

      <TextAreaField
        label="TEACHER NOTES"
        value={draft.notes ?? ""}
        onChange={(v) => update("notes", v)}
        placeholder="Reminders for you. Not visible to students."
        rows={4}
        maxLength={2000}
      />

      <Btn
        full
        variant="primary"
        disabled={!dirty || updateBlock.isPending}
        onClick={onSave}
      >
        {updateBlock.isPending
          ? "Saving…"
          : dirty
            ? "Save block"
            : "Saved"}
      </Btn>

      {feedback && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            fontSize: 11,
            color:
              feedback.kind === "ok" ? "var(--wf-good)" : "var(--wf-accent)",
            border:
              feedback.kind === "ok"
                ? "1px solid var(--wf-good)"
                : "1px solid var(--wf-accent)",
            background:
              feedback.kind === "ok"
                ? "transparent"
                : "var(--wf-accent-soft)",
            borderRadius: 3,
          }}
        >
          {feedback.kind === "ok" ? "✓ " : ""}
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

/**
 * Type dispatch — extend the switch when the next type's editor
 * is ready. Unknown types render no extra fields; the universal
 * label + notes are still there.
 */
function renderTypeFields(
  type: BlockType,
  blockId: string,
  draft: BlockSettingsShape,
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void,
  // Only AI_QUIZ needs to bubble fresh settings up to the parent
  // mid-edit (after a generate). Other types stay on the universal
  // Save flow.
  onSaved: (settings: BlockSettingsShape) => void
) {
  switch (type) {
    case "VIDEO":
      return <VideoFields draft={draft} update={update} />;
    case "READING":
      return <ReadingFields draft={draft} update={update} />;
    case "MCQ":
      return <McqFields draft={draft} update={update} />;
    case "SLIDES":
      return <SlidesFields draft={draft} update={update} />;
    case "PDF":
      return <PdfFields draft={draft} update={update} />;
    case "SECTION":
      return <SectionFields draft={draft} update={update} />;
    case "POLL":
      return <PollFields draft={draft} update={update} />;
    case "DISCUSSION":
      return <DiscussionFields draft={draft} update={update} />;
    case "AI_QUIZ":
      return (
        <AiQuizFields
          blockId={blockId}
          draft={draft}
          update={update}
          onSaved={onSaved}
        />
      );
    case "DRAG_MATCH":
      return <DragMatchFields draft={draft} update={update} />;
    case "LIVE":
      return <LiveFields draft={draft} update={update} />;
    default:
      return (
        <div
          style={{
            marginBottom: 12,
            padding: 8,
            border: "1px dashed var(--wf-hairline)",
            borderRadius: 3,
            fontSize: 10,
            color: "var(--wf-mute)",
            lineHeight: 1.5,
          }}
        >
          No type-specific fields for {type} yet.
        </div>
      );
  }
}

function VideoFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  return (
    <>
      <TextField
        label="VIDEO URL"
        value={typeof draft.url === "string" ? draft.url : ""}
        onChange={(v) => update("url", v)}
        placeholder="https://… (YouTube, Vimeo, Mux)"
        maxLength={500}
        hint="Paste the share link. Embed rendering ships later."
      />
      <TextField
        label="CAPTION (OPTIONAL)"
        value={typeof draft.caption === "string" ? draft.caption : ""}
        onChange={(v) => update("caption", v)}
        placeholder="One-line description shown under the player"
        maxLength={200}
      />
    </>
  );
}

function ReadingFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  return (
    <TextAreaField
      label="READING (MARKDOWN)"
      value={typeof draft.body === "string" ? draft.body : ""}
      onChange={(v) => update("body", v)}
      placeholder="# Heading\n\nWrite the lesson content in markdown…"
      rows={10}
      maxLength={20_000}
      hint="Markdown rendering ships with the reader UI."
    />
  );
}

function McqFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  const options: McqOption[] = Array.isArray(draft.options)
    ? (draft.options as McqOption[])
    : [];

  const setOptions = (next: McqOption[]) => update("options", next);

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, { text: "", correct: false }]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return; // keep at least 2
    setOptions(options.filter((_, i) => i !== idx));
  };

  const setText = (idx: number, text: string) => {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  };

  const setCorrect = (idx: number) => {
    // MCQ in this app is single-correct (matches the existing Question
    // shape). If we ever support multi-select, this becomes a checkbox.
    setOptions(options.map((o, i) => ({ ...o, correct: i === idx })));
  };

  return (
    <>
      <TextAreaField
        label="QUESTION STEM"
        value={typeof draft.stem === "string" ? draft.stem : ""}
        onChange={(v) => update("stem", v)}
        placeholder="What's 3 × 4?"
        rows={3}
        maxLength={500}
      />
      <div style={{ marginBottom: 12 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            marginBottom: 4,
            letterSpacing: "0.06em",
          }}
        >
          ANSWER OPTIONS · 2 – 6 · ONE CORRECT
        </div>
        {options.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              padding: "8px 0",
            }}
          >
            No options yet — add at least two.
          </div>
        ) : (
          options.map((o, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <input
                type="radio"
                name="mcq-correct"
                checked={o.correct}
                onChange={() => setCorrect(i)}
                aria-label={`Mark option ${i + 1} as correct`}
                style={{ accentColor: "var(--wf-good)" }}
              />
              <input
                type="text"
                value={o.text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={200}
                style={{
                  flex: 1,
                  padding: "5px 7px",
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={options.length <= 2}
                title={
                  options.length <= 2
                    ? "Need at least 2 options"
                    : "Remove option"
                }
                aria-label={`Remove option ${i + 1}`}
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    options.length <= 2
                      ? "var(--wf-hairline)"
                      : "var(--wf-mute)",
                  cursor:
                    options.length <= 2 ? "not-allowed" : "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= 6}
          style={{
            marginTop: 6,
            padding: "4px 8px",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontSize: 10,
            fontWeight: 600,
            color:
              options.length >= 6 ? "var(--wf-mute)" : "var(--wf-body)",
            cursor: options.length >= 6 ? "not-allowed" : "pointer",
          }}
        >
          + Add option ({options.length}/6)
        </button>
      </div>
    </>
  );
}

function SlidesFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  return (
    <>
      <TextField
        label="SLIDES URL"
        value={typeof draft.url === "string" ? draft.url : ""}
        onChange={(v) => update("url", v)}
        placeholder="https://docs.google.com/presentation/d/…"
        maxLength={500}
        hint="Google Slides /edit or /pubembed links work — the reader normalizes them."
      />
      <TextField
        label="CAPTION (OPTIONAL)"
        value={typeof draft.caption === "string" ? draft.caption : ""}
        onChange={(v) => update("caption", v)}
        placeholder="One-line description shown under the deck"
        maxLength={200}
      />
    </>
  );
}

function PdfFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  return (
    <>
      <TextField
        label="PDF URL"
        value={typeof draft.url === "string" ? draft.url : ""}
        onChange={(v) => update("url", v)}
        placeholder="https://… (direct .pdf link)"
        maxLength={500}
        hint="Some hosts block cross-origin embeds — the reader falls back to a download link."
      />
      <TextField
        label="CAPTION (OPTIONAL)"
        value={typeof draft.caption === "string" ? draft.caption : ""}
        onChange={(v) => update("caption", v)}
        placeholder="One-line description shown under the PDF"
        maxLength={200}
      />
    </>
  );
}

function PollFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  // POLL options are plain strings — no correctness flag, no shared
  // shape with MCQ. Stored in the same `options` field; the router
  // discriminates by Block.type and filters to typeof "string".
  const options: string[] = Array.isArray(draft.options)
    ? (draft.options as unknown[]).filter(
        (o): o is string => typeof o === "string"
      )
    : [];

  const setOptions = (next: string[]) =>
    // The Json type accepts string[] but the shared BlockSettingsShape
    // declares `options` as McqOption[] for the MCQ case. Cast through
    // unknown — the runtime shape is just "array of strings", which
    // the POLL inspector and reader both expect.
    update("options", next as unknown as BlockSettingsShape["options"]);

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, ""]);
  };
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };
  const setText = (idx: number, text: string) => {
    setOptions(options.map((o, i) => (i === idx ? text : o)));
  };

  return (
    <>
      <TextAreaField
        label="POLL QUESTION"
        value={typeof draft.stem === "string" ? draft.stem : ""}
        onChange={(v) => update("stem", v)}
        placeholder="Which method is easier to remember?"
        rows={3}
        maxLength={500}
      />
      <div style={{ marginBottom: 12 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            marginBottom: 4,
            letterSpacing: "0.06em",
          }}
        >
          POLL OPTIONS · 2 – 6
        </div>
        {options.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              padding: "8px 0",
            }}
          >
            No options yet — add at least two.
          </div>
        ) : (
          options.map((text, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <input
                type="text"
                value={text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={200}
                style={{
                  flex: 1,
                  padding: "5px 7px",
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={options.length <= 2}
                title={
                  options.length <= 2
                    ? "Need at least 2 options"
                    : "Remove option"
                }
                aria-label={`Remove option ${i + 1}`}
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    options.length <= 2
                      ? "var(--wf-hairline)"
                      : "var(--wf-mute)",
                  cursor:
                    options.length <= 2 ? "not-allowed" : "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= 6}
          style={{
            marginTop: 6,
            padding: "4px 8px",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontSize: 10,
            fontWeight: 600,
            color:
              options.length >= 6 ? "var(--wf-mute)" : "var(--wf-body)",
            cursor: options.length >= 6 ? "not-allowed" : "pointer",
          }}
        >
          + Add option ({options.length}/6)
        </button>
      </div>
    </>
  );
}

function AiQuizFields({
  blockId,
  draft,
  update,
  onSaved,
}: {
  blockId: string;
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
  // Bubble the freshly-generated questions up to the parent so the
  // course-builder canvas re-reads the block's settings without a
  // full inspector re-mount.
  onSaved: (settings: BlockSettingsShape) => void;
}) {
  const topic = typeof draft.topic === "string" ? draft.topic : "";
  const count =
    typeof draft.count === "number" && draft.count >= 1 && draft.count <= 10
      ? draft.count
      : 5;
  const generated = draft.generated;
  const [status, setStatus] = useState<
    { kind: "ok" | "error"; msg: string } | null
  >(null);

  const generate = trpc.generator.generateAiQuiz.useMutation({
    onSuccess: (res) => {
      // Mirror the new generated block server-side so the local draft
      // reflects what just saved, and surface to parent for canvas
      // re-render.
      const fresh: BlockSettingsShape = {
        ...draft,
        topic,
        count,
        generated: {
          questions: res.questions.map((q) => ({
            stem: q.stem,
            difficulty: q.difficulty,
            answers: q.answers,
            hint: q.hint ?? null,
          })),
          generatedAt: res.generatedAt,
        },
      };
      update("generated", fresh.generated);
      onSaved(fresh);
      setStatus({
        kind: "ok",
        msg: `Generated ${res.questions.length} questions in ${(res.elapsedMs / 1_000).toFixed(1)}s.`,
      });
      setTimeout(() => setStatus(null), 4_000);
    },
    onError: (err) =>
      setStatus({
        kind: "error",
        msg: err.message ?? "Generation failed. Try again.",
      }),
  });

  return (
    <>
      <TextAreaField
        label="TOPIC (OPTIONAL)"
        value={topic}
        onChange={(v) => update("topic", v)}
        placeholder="Defaults to the lesson title. Override to scope the questions."
        rows={2}
        maxLength={500}
      />
      <div style={{ marginBottom: 12 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            marginBottom: 4,
            letterSpacing: "0.06em",
          }}
        >
          QUESTION COUNT · 1 – 10
        </div>
        <input
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 10) update("count", n);
          }}
          style={{
            width: 80,
            padding: "5px 7px",
            fontSize: 11,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontFamily: "inherit",
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => generate.mutate({ blockId, count, topic: topic || undefined })}
        disabled={generate.isPending}
        style={{
          padding: "8px 12px",
          border: "1px solid var(--wf-ai)",
          background: generate.isPending ? "var(--wf-fillsoft)" : "white",
          color: "var(--wf-ai)",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 3,
          cursor: generate.isPending ? "default" : "pointer",
          marginBottom: 10,
        }}
      >
        {generate.isPending
          ? "Generating…"
          : generated
            ? "Regenerate questions"
            : "Generate questions ✨"}
      </button>
      {status && (
        <div
          style={{
            fontSize: 11,
            padding: "6px 8px",
            background:
              status.kind === "ok"
                ? "rgba(34,176,90,0.08)"
                : "var(--wf-accent-soft)",
            color:
              status.kind === "ok" ? "var(--wf-good)" : "var(--wf-accent)",
            borderRadius: 3,
            marginBottom: 10,
          }}
        >
          {status.msg}
        </div>
      )}
      {generated && (
        <div
          style={{
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            padding: 10,
            background: "var(--wf-fillsoft)",
          }}
        >
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-mute)",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            {generated.questions.length} QUESTIONS · GENERATED{" "}
            {new Date(generated.generatedAt).toLocaleTimeString()}
            {generated.mode ? ` · ${generated.mode}` : ""}
          </div>
          {generated.questions.map((q, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "var(--wf-body)",
                marginBottom: 4,
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: "var(--wf-mute)" }}>{i + 1}.</span>{" "}
              {q.stem}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function LiveFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  // datetime-local inputs work in local time without offset; convert
  // both directions so storage stays canonical ISO with timezone.
  const localValue = (() => {
    if (typeof draft.startsAt !== "string" || !draft.startsAt) return "";
    const d = new Date(draft.startsAt);
    if (Number.isNaN(d.getTime())) return "";
    // YYYY-MM-DDTHH:mm in local time (what datetime-local expects)
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const durationMin =
    typeof draft.durationMin === "number" && draft.durationMin > 0
      ? draft.durationMin
      : 60;
  const joinUrl = typeof draft.joinUrl === "string" ? draft.joinUrl : "";
  const title = typeof draft.title === "string" ? draft.title : "";

  return (
    <>
      <TextField
        label="SESSION TITLE (OPTIONAL)"
        value={title}
        onChange={(v) => update("title", v)}
        placeholder="Live review · Q&A"
        maxLength={120}
      />
      <div style={{ marginBottom: 12 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            marginBottom: 4,
            letterSpacing: "0.06em",
          }}
        >
          STARTS AT (LOCAL TIME)
        </div>
        <input
          type="datetime-local"
          value={localValue}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              update("startsAt", "");
              return;
            }
            // datetime-local gives a no-offset string; constructing a Date
            // from it uses local zone, then toISOString() canonicalizes to UTC.
            const iso = new Date(v).toISOString();
            update("startsAt", iso);
          }}
          style={{
            width: "100%",
            padding: "5px 7px",
            fontSize: 11,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontFamily: "inherit",
          }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            marginBottom: 4,
            letterSpacing: "0.06em",
          }}
        >
          DURATION (MINUTES)
        </div>
        <input
          type="number"
          min={5}
          max={600}
          step={5}
          value={durationMin}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 5 && n <= 600)
              update("durationMin", n);
          }}
          style={{
            width: 100,
            padding: "5px 7px",
            fontSize: 11,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontFamily: "inherit",
          }}
        />
      </div>
      <TextField
        label="JOIN URL"
        value={joinUrl}
        onChange={(v) => update("joinUrl", v)}
        placeholder="https://meet.google.com/… or https://zoom.us/…"
        maxLength={500}
        hint="Zoom / Google Meet / Teams — whatever your class uses."
      />
    </>
  );
}

function DragMatchFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  const pairs: Array<{ left: string; right: string }> = Array.isArray(
    draft.pairs
  )
    ? (draft.pairs as Array<{ left?: unknown; right?: unknown }>)
        .filter(
          (p): p is { left: string; right: string } =>
            !!p &&
            typeof p.left === "string" &&
            typeof p.right === "string"
        )
    : [];

  const setPairs = (next: Array<{ left: string; right: string }>) =>
    update("pairs", next);

  const addPair = () => {
    if (pairs.length >= 8) return;
    setPairs([...pairs, { left: "", right: "" }]);
  };
  const removePair = (idx: number) => {
    if (pairs.length <= 2) return;
    setPairs(pairs.filter((_, i) => i !== idx));
  };
  const setLeft = (idx: number, left: string) =>
    setPairs(pairs.map((p, i) => (i === idx ? { ...p, left } : p)));
  const setRight = (idx: number, right: string) =>
    setPairs(pairs.map((p, i) => (i === idx ? { ...p, right } : p)));

  return (
    <>
      <TextAreaField
        label="MATCHING PROMPT (OPTIONAL)"
        value={typeof draft.prompt === "string" ? draft.prompt : ""}
        onChange={(v) => update("prompt", v)}
        placeholder="Match each fraction to its decimal equivalent."
        rows={2}
        maxLength={500}
      />
      <div style={{ marginBottom: 12 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            marginBottom: 6,
            letterSpacing: "0.06em",
          }}
        >
          PAIRS · 2 – 8 · LEFT ↔ RIGHT
        </div>
        {pairs.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              padding: "8px 0",
            }}
          >
            No pairs yet — add at least two.
          </div>
        ) : (
          pairs.map((p, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr auto",
                gap: 6,
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <input
                type="text"
                value={p.left}
                onChange={(e) => setLeft(i, e.target.value)}
                placeholder={`Left ${i + 1}`}
                maxLength={120}
                style={{
                  padding: "5px 7px",
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                  minWidth: 0,
                }}
              />
              <span style={{ color: "var(--wf-mute)", fontSize: 11 }}>↔</span>
              <input
                type="text"
                value={p.right}
                onChange={(e) => setRight(i, e.target.value)}
                placeholder={`Right ${i + 1}`}
                maxLength={120}
                style={{
                  padding: "5px 7px",
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={() => removePair(i)}
                disabled={pairs.length <= 2}
                aria-label={`Remove pair ${i + 1}`}
                title={
                  pairs.length <= 2 ? "Need at least 2 pairs" : "Remove pair"
                }
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    pairs.length <= 2
                      ? "var(--wf-hairline)"
                      : "var(--wf-mute)",
                  cursor: pairs.length <= 2 ? "not-allowed" : "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={addPair}
          disabled={pairs.length >= 8}
          style={{
            marginTop: 6,
            padding: "4px 8px",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontSize: 10,
            fontWeight: 600,
            color:
              pairs.length >= 8 ? "var(--wf-mute)" : "var(--wf-body)",
            cursor: pairs.length >= 8 ? "not-allowed" : "pointer",
          }}
        >
          + Add pair ({pairs.length}/8)
        </button>
      </div>
    </>
  );
}

function DiscussionFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  // DISCUSSION is mostly student-driven — the only authoring control
  // is an optional prompt question that opens the thread. Stored in
  // the `prompt` field; falls back to a generic placeholder if unset.
  return (
    <TextAreaField
      label="DISCUSSION PROMPT (OPTIONAL)"
      value={typeof draft.prompt === "string" ? draft.prompt : ""}
      onChange={(v) => update("prompt", v)}
      placeholder="What's one moment in this lesson that confused you, and how did you work past it?"
      rows={3}
      maxLength={500}
      hint="Shown above the thread to anchor the conversation."
    />
  );
}

function SectionFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  // SECTION is a pure presentational divider — title is the visible
  // heading, subtitle is an optional intro line. Useful for grouping a
  // long lesson into thematic sections without nesting structure.
  return (
    <>
      <TextField
        label="SECTION TITLE"
        value={typeof draft.title === "string" ? draft.title : ""}
        onChange={(v) => update("title", v)}
        placeholder="Part 1 — Setting up"
        maxLength={120}
      />
      <TextField
        label="SUBTITLE (OPTIONAL)"
        value={typeof draft.subtitle === "string" ? draft.subtitle : ""}
        onChange={(v) => update("subtitle", v)}
        placeholder="One-line description of what this section covers"
        maxLength={200}
      />
    </>
  );
}

/* ── small field primitives, kept inline so the inspector file
   stays self-contained ──────────────────────────────────────── */

function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div
        className="wf-mono"
        style={{
          fontSize: 10,
          color: "var(--wf-mute)",
          marginBottom: 4,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: 12,
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          fontFamily: "inherit",
        }}
      />
      {hint && (
        <div style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div
        className="wf-mono"
        style={{
          fontSize: 10,
          color: "var(--wf-mute)",
          marginBottom: 4,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: 12,
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      {hint && (
        <div style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </label>
  );
}
