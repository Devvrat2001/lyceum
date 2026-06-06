"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Btn, Eyebrow, Icon, Toggle } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import {
  findBlockMeta,
  type BlockType,
  type SettingsFor,
  type McqOption,
  type QuizQuestion,
  type BranchingNode,
  type DragMatchPair,
} from "@/lib/blocks";

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
export type BlockSettingsShape = {
  // universal
  label?: string;
  notes?: string;
  // VIDEO, SLIDES, PDF (all use a single share/embed URL + optional caption)
  url?: string;
  caption?: string;
  // VIDEO upload (Mux) — `source` flips the block from embed-URL to an
  // uploaded video; `mux` holds the upload/asset state.
  source?: "url" | "mux";
  mux?: {
    uploadId?: string;
    assetId?: string;
    playbackId?: string;
    status?: "waiting" | "preparing" | "ready" | "errored";
    aspectRatio?: string;
  };
  // READING
  body?: string;
  // MCQ stores `McqOption[]`; POLL reuses the same `options` key for its
  // plain `string[]` choices (the discriminator is `Block.type`, not a
  // field inside the JSON). Hence the union — `lib/blocks.ts` holds the
  // canonical per-type split (`McqSettings` vs `PollSettings`).
  stem?: string;
  options?: McqOption[] | string[];
  // SECTION (structural divider — title is the visible heading, subtitle is optional)
  title?: string;
  subtitle?: string;
  // DISCUSSION
  prompt?: string;
  // AI_QUIZ
  topic?: string;
  count?: number;
  generated?: {
    // questions reuse the canonical QuizQuestion (difficulty optional —
    // matching what the generator returns) instead of a stricter inline copy.
    questions: QuizQuestion[];
    generatedAt: string;
    mode?: string;
  };
  // DRAG_MATCH
  pairs?: DragMatchPair[];
  // QUIZ (curated multi-question MCQ deck; same shape as AI_QUIZ's generated.questions)
  questions?: QuizQuestion[];
  // LIVE (scheduled session)
  startsAt?: string; // ISO timestamp
  durationMin?: number;
  joinUrl?: string;
  // SPEAK (voice prompt + transcription)
  expected?: string;
  language?: string;
  // BRANCHING (choose-your-own-adventure graph). nodes[0] is the start.
  nodes?: BranchingNode[];
  // APPEARANCE — "how the block looks" (Course Builder v2 inspector).
  // Persisted forward-compatibly; the student reader honors these as it
  // grows. `accent` is a hex string.
  appearance?: {
    optionLayout?: "list" | "grid" | "inline";
    accent?: string;
    showLetters?: boolean;
    cardStyle?: boolean;
    showCorrect?: boolean;
  };
  // BEHAVIOR — pedagogy + gamification knobs.
  behavior?: {
    adaptive?: boolean;
    aiHints?: boolean;
    required?: boolean;
    retake?: boolean;
    xp?: number;
  };
  // unknown / future
  [k: string]: unknown;
};

// ---------------------------------------------------------------------------
// Drift guard (type-only, zero runtime cost). The prior pass unified this
// inspector bag with the canonical per-type shapes in `lib/blocks.ts`. This
// assertion keeps them from silently diverging: every `SettingsFor<T>` must
// stay assignable to `BlockSettingsShape`, so adding a field to a `*Settings`
// type in blocks.ts forces it to be mirrored here too (or `tsc` fails). If one
// drifts out, the mapped union picks up `false` and `_Assert<false>` errors,
// pointing straight at the divergent block type.
// ---------------------------------------------------------------------------
type _Assert<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _BagCoversCanonical = _Assert<
  {
    [K in BlockType]: SettingsFor<K> extends BlockSettingsShape ? true : false;
  }[BlockType] extends true
    ? true
    : false
>;

/** Block types that expose APPEARANCE controls (option-layout etc.). */
const OPTION_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "MCQ",
  "QUIZ",
  "POLL",
  "DRAG_MATCH",
]);
/** Block types that expose adaptive-difficulty + AI-hint BEHAVIOR. */
const PRACTICE_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "MCQ",
  "QUIZ",
  "AI_QUIZ",
  "POLL",
  "DRAG_MATCH",
  "SPEAK",
  "BRANCHING",
  "SIMULATION",
]);

const ACCENT_SWATCHES = [
  "#ff5b1f",
  "#2a6fdb",
  "#1d7a4d",
  "#6b3df5",
  "#1f1d1a",
] as const;

export function BlockInspector({
  block,
  onSaved,
  onDeselect,
  embedded = false,
  onDelete,
  moveTargets,
  onMove,
}: {
  block: {
    id: string;
    type: BlockType;
    order: number;
    settings: BlockSettingsShape;
  };
  onSaved: (settings: BlockSettingsShape) => void;
  onDeselect: () => void;
  /** When true, the parent (Course Builder v2 inspector chrome) owns the
   *  header + identity card + tabs, so we render content only. */
  embedded?: boolean;
  /** When provided, renders a "Delete block" action at the bottom. */
  onDelete?: () => void;
  /** Other lessons in the course. When non-empty, renders a
   *  "Move to lesson" control above Delete. */
  moveTargets?: { id: string; label: string }[];
  onMove?: (toLessonId: string) => void;
}) {
  const meta = findBlockMeta(block.type);
  const [draft, setDraft] = useState<BlockSettingsShape>(block.settings);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; msg: string } | null
  >(null);

  // Resync the draft when the selected block (or its settings) changes
  // underneath us — a new block is selected, a save cleans empty fields,
  // or an AI generate writes fresh settings. Guarded against the
  // last-synced snapshot so we don't setState on every render
  // (react-hooks/set-state-in-effect).
  const lastSyncedRef = useRef<string>("");
  useEffect(() => {
    const incoming = JSON.stringify(block.settings ?? {});
    if (incoming !== lastSyncedRef.current) {
      lastSyncedRef.current = incoming;
      setDraft(block.settings);
      setFeedback(null);
    }
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
      {!embedded && (
        <>
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
        </>
      )}

      <SectionLabel>CONTENT</SectionLabel>
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

      {OPTION_TYPES.has(block.type) && (
        <AppearanceSection draft={draft} update={update} />
      )}
      <BehaviorSection type={block.type} draft={draft} update={update} />

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

      {moveTargets && moveTargets.length > 0 && onMove && (
        <div style={{ marginTop: 10 }}>
          <label
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-mute)",
              letterSpacing: "0.06em",
              display: "block",
              marginBottom: 4,
            }}
          >
            MOVE TO LESSON
          </label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onMove(e.target.value);
            }}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 7,
              border: "1px solid var(--wf-hairline)",
              background: "white",
              fontSize: 12,
              color: "var(--wf-ink)",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <option value="">Move this block to…</option>
            {moveTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "8px",
            borderRadius: 7,
            border: "1px solid var(--wf-hairline)",
            background: "white",
            color: "var(--wf-accent)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Delete block
        </button>
      )}

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
      return (
        <VideoFields
          blockId={blockId}
          draft={draft}
          update={update}
          onSaved={onSaved}
        />
      );
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
    case "QUIZ":
      return <QuizFields draft={draft} update={update} />;
    case "SIMULATION":
      return <SimulationFields draft={draft} update={update} />;
    case "SPEAK":
      return <SpeakFields draft={draft} update={update} />;
    case "BRANCHING":
      return <BranchingFields draft={draft} update={update} />;
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

// Mux's chunked uploader widget. ssr:false because it registers a custom
// element that can't render on the server.
const MuxUploader = dynamic(() => import("@mux/mux-uploader-react"), {
  ssr: false,
});

function VideoFields({
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
  onSaved: (settings: BlockSettingsShape) => void;
}) {
  return (
    <>
      <MuxVideoField
        blockId={blockId}
        draft={draft}
        update={update}
        onSaved={onSaved}
      />
      <TextField
        label="OR PASTE A VIDEO LINK"
        value={typeof draft.url === "string" ? draft.url : ""}
        onChange={(v) => update("url", v)}
        placeholder="https://… (YouTube or Vimeo)"
        maxLength={500}
        hint="Used when you haven't uploaded a video."
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

/**
 * In-builder video upload. The browser uploads straight to Mux via a
 * one-time URL minted by `teacher.createVideoUpload`; while Mux transcodes
 * we poll `teacher.videoStatus` until the asset is "ready". All settings
 * writes happen server-side (the mutations merge `source`/`mux` into the
 * block) and propagate to the builder + draft via `onSaved`.
 */
function MuxVideoField({
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
  onSaved: (settings: BlockSettingsShape) => void;
}) {
  const mux = draft.mux;
  const status = draft.source === "mux" ? mux?.status : undefined;
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySettings = (settings: BlockSettingsShape) => {
    update("source", settings.source);
    update("mux", settings.mux);
    onSaved(settings);
  };

  const createUpload = trpc.teacher.createVideoUpload.useMutation({
    onSuccess: (res) => {
      setError(null);
      setUploaded(false);
      setUploadUrl(res.uploadUrl);
      applySettings(res.settings as BlockSettingsShape);
    },
    onError: (e) =>
      setError(
        e.data?.code === "PRECONDITION_FAILED"
          ? e.message
          : "Couldn't start the upload. Try again."
      ),
  });

  const statusMut = trpc.teacher.videoStatus.useMutation({
    onSuccess: (res) => applySettings(res.settings as BlockSettingsShape),
  });
  // React Query's `mutate` is referentially stable, so depending on it
  // doesn't churn the interval — and calling it (not setState) inside the
  // effect keeps us clear of react-hooks/set-state-in-effect.
  const pollStatus = statusMut.mutate;

  useEffect(() => {
    const active =
      draft.source === "mux" &&
      status !== undefined &&
      status !== "ready" &&
      status !== "errored";
    if (!active) return;
    const id = setInterval(() => pollStatus({ blockId }), 3000);
    return () => clearInterval(id);
  }, [blockId, draft.source, status, pollStatus]);

  const reset = () => {
    setUploadUrl(null);
    setUploaded(false);
    setError(null);
    update("source", "url");
    update("mux", undefined);
    const cleared: BlockSettingsShape = { ...draft, source: "url" };
    delete cleared.mux;
    onSaved(cleared);
  };

  if (status === "ready" && mux?.playbackId) {
    return (
      <VideoFieldShell label="UPLOADED VIDEO">
        <StatusRow tone="good" text="Ready — plays in the lesson." />
        <Btn variant="ghost" sm onClick={reset}>
          Replace video
        </Btn>
      </VideoFieldShell>
    );
  }
  if (status === "errored") {
    return (
      <VideoFieldShell label="UPLOADED VIDEO">
        <StatusRow tone="bad" text="Processing failed. Try another file." />
        <Btn variant="ghost" sm onClick={reset}>
          Try again
        </Btn>
      </VideoFieldShell>
    );
  }
  if (draft.source === "mux" && (uploaded || status === "preparing")) {
    return (
      <VideoFieldShell label="UPLOADED VIDEO">
        <StatusRow
          tone="mute"
          text="Processing… this can take a minute. You can keep editing — it'll go live once ready."
        />
        <Btn variant="ghost" sm onClick={reset}>
          Cancel
        </Btn>
      </VideoFieldShell>
    );
  }
  if (uploadUrl) {
    return (
      <VideoFieldShell label="UPLOAD A VIDEO">
        <div style={{ width: "100%" }}>
          <MuxUploader
            endpoint={uploadUrl}
            onSuccess={() => setUploaded(true)}
            onUploadError={() => setError("Upload failed. Try again.")}
          />
        </div>
        {error && <StatusRow tone="bad" text={error} />}
        <Btn variant="ghost" sm onClick={reset}>
          Cancel
        </Btn>
      </VideoFieldShell>
    );
  }
  return (
    <VideoFieldShell label="UPLOAD A VIDEO">
      <Btn
        sm
        onClick={() =>
          createUpload.mutate({
            blockId,
            origin:
              typeof window !== "undefined"
                ? window.location.origin
                : undefined,
          })
        }
        disabled={createUpload.isPending}
      >
        {createUpload.isPending ? "Starting…" : "Choose a video to upload"}
      </Btn>
      {error && <StatusRow tone="bad" text={error} />}
    </VideoFieldShell>
  );
}

function VideoFieldShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        className="wf-mono"
        style={{
          fontSize: 10,
          color: "var(--wf-mute)",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusRow({
  tone,
  text,
}: {
  tone: "good" | "bad" | "mute";
  text: string;
}) {
  const color =
    tone === "good"
      ? "var(--wf-good)"
      : tone === "bad"
        ? "var(--wf-accent)"
        : "var(--wf-mute)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color,
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {text}
    </div>
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

  // `options` is typed `McqOption[] | string[]`; POLL writes the string[]
  // arm directly — no cast needed now that the union admits both shapes.
  const setOptions = (next: string[]) => update("options", next);

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

const ANSWER_KEYS = ["A", "B", "C", "D"] as const;

function blankQuizQuestion(): QuizQuestion {
  return {
    stem: "",
    answers: ANSWER_KEYS.map((key, i) => ({
      key,
      text: "",
      // First option defaults to correct so a new question is always
      // valid (exactly-one-correct) even before the teacher edits.
      correct: i === 0,
    })),
    hint: "",
  };
}

let _branchingIdSeq = 0;
function nextNodeId(): string {
  _branchingIdSeq += 1;
  // Prefix is stable enough that we don't need crypto.randomUUID for
  // an in-block identifier.
  return `n${Date.now().toString(36)}${_branchingIdSeq}`;
}

function blankBranchingNode(label: string): BranchingNode {
  return {
    id: nextNodeId(),
    title: label,
    body: "",
    choices: [],
  };
}

function BranchingFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  const nodes: BranchingNode[] = Array.isArray(draft.nodes)
    ? (draft.nodes as BranchingNode[])
    : [];

  const setNodes = (next: BranchingNode[]) => update("nodes", next);

  const addNode = () => {
    if (nodes.length >= 8) return;
    setNodes([
      ...nodes,
      blankBranchingNode(`Node ${nodes.length + 1}`),
    ]);
  };
  const removeNode = (idx: number) => {
    if (nodes.length <= 2) return;
    const removedId = nodes[idx]?.id;
    // Drop the node, and prune any choice still pointing at it so the
    // reader doesn't render a dangling "(missing)" target. Teacher
    // would have to rewire choices anyway; do it for them.
    const next = nodes
      .filter((_, i) => i !== idx)
      .map((n) => ({
        ...n,
        choices: n.choices.filter((c) => c.to !== removedId),
      }));
    setNodes(next);
  };
  const updateNode = (idx: number, patch: Partial<BranchingNode>) =>
    setNodes(nodes.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
  const addChoice = (nodeIdx: number) => {
    const node = nodes[nodeIdx];
    if (!node || node.choices.length >= 4) return;
    // Default target: the next node in the array, or self if last.
    const defaultTo = nodes[nodeIdx + 1]?.id ?? node.id;
    updateNode(nodeIdx, {
      choices: [...node.choices, { label: "", to: defaultTo }],
    });
  };
  const removeChoice = (nodeIdx: number, choiceIdx: number) => {
    const node = nodes[nodeIdx];
    if (!node) return;
    updateNode(nodeIdx, {
      choices: node.choices.filter((_, i) => i !== choiceIdx),
    });
  };
  const updateChoice = (
    nodeIdx: number,
    choiceIdx: number,
    patch: Partial<{ label: string; to: string }>
  ) => {
    const node = nodes[nodeIdx];
    if (!node) return;
    updateNode(nodeIdx, {
      choices: node.choices.map((c, i) =>
        i === choiceIdx ? { ...c, ...patch } : c
      ),
    });
  };

  // Seed two nodes on first render so the teacher has a meaningful
  // starting graph (single-node graphs are also valid but unusual).
  useEffect(() => {
    if (nodes.length === 0) {
      setNodes([
        blankBranchingNode("Start"),
        blankBranchingNode("Outcome"),
      ]);
    }
    // Mount-only seed: gives an empty BRANCHING block a starter graph
    // exactly once. Re-running on `nodes` changes would fight the
    // teacher's edits, so the deps stay empty by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        style={{
          fontSize: 11,
          color: "var(--wf-mute)",
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        The student starts at the first node and walks the graph by
        clicking choices. Each choice points at another node (or loops
        back).
      </div>
      {nodes.map((node, idx) => (
        <div
          key={node.id}
          style={{
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
            background: idx === 0 ? "var(--wf-fillsoft)" : "white",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span
              className="wf-mono"
              style={{
                fontSize: 10,
                color:
                  idx === 0 ? "var(--wf-accent)" : "var(--wf-mute)",
                fontWeight: idx === 0 ? 700 : 500,
                letterSpacing: "0.06em",
              }}
            >
              {idx === 0 ? "START · " : ""}NODE {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeNode(idx)}
              disabled={nodes.length <= 2}
              aria-label={`Remove node ${idx + 1}`}
              title={
                nodes.length <= 2
                  ? "Need at least 2 nodes"
                  : "Remove this node"
              }
              style={{
                border: "none",
                background: "transparent",
                color:
                  nodes.length <= 2
                    ? "var(--wf-hairline)"
                    : "var(--wf-mute)",
                cursor: nodes.length <= 2 ? "not-allowed" : "pointer",
                fontSize: 13,
                lineHeight: 1,
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
          <input
            type="text"
            value={node.title}
            onChange={(e) => updateNode(idx, { title: e.target.value })}
            placeholder="Node title"
            maxLength={120}
            style={{
              width: "100%",
              padding: "5px 7px",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              fontFamily: "inherit",
              marginBottom: 4,
            }}
          />
          <textarea
            value={node.body}
            onChange={(e) => updateNode(idx, { body: e.target.value })}
            placeholder="Body shown to the student at this node"
            rows={3}
            maxLength={2_000}
            style={{
              width: "100%",
              padding: "5px 7px",
              fontSize: 11,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              fontFamily: "inherit",
              resize: "vertical",
              marginBottom: 6,
            }}
          />
          {/* Choices */}
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-mute)",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            CHOICES ·{" "}
            {node.choices.length === 0
              ? "TERMINAL"
              : `${node.choices.length}/4`}
          </div>
          {node.choices.map((c, cIdx) => (
            <div
              key={cIdx}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 4,
                marginBottom: 4,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={c.label}
                onChange={(e) =>
                  updateChoice(idx, cIdx, { label: e.target.value })
                }
                placeholder={`Choice ${cIdx + 1} label`}
                maxLength={120}
                style={{
                  padding: "4px 6px",
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                  minWidth: 0,
                }}
              />
              <select
                value={c.to}
                onChange={(e) =>
                  updateChoice(idx, cIdx, { to: e.target.value })
                }
                style={{
                  padding: "4px 6px",
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                }}
              >
                {nodes.map((n, ni) => (
                  <option key={n.id} value={n.id}>
                    → {n.title || `Node ${ni + 1}`}
                    {n.id === node.id ? " (self)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeChoice(idx, cIdx)}
                aria-label={`Remove choice ${cIdx + 1}`}
                title="Remove choice"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--wf-mute)",
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addChoice(idx)}
            disabled={node.choices.length >= 4}
            style={{
              marginTop: 2,
              padding: "3px 8px",
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              fontSize: 10,
              fontWeight: 600,
              color:
                node.choices.length >= 4
                  ? "var(--wf-mute)"
                  : "var(--wf-body)",
              cursor:
                node.choices.length >= 4 ? "not-allowed" : "pointer",
            }}
          >
            + Add choice ({node.choices.length}/4)
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addNode}
        disabled={nodes.length >= 8}
        style={{
          marginTop: 4,
          padding: "5px 10px",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          fontSize: 10,
          fontWeight: 600,
          color:
            nodes.length >= 8 ? "var(--wf-mute)" : "var(--wf-body)",
          cursor: nodes.length >= 8 ? "not-allowed" : "pointer",
        }}
      >
        + Add node ({nodes.length}/8)
      </button>
    </>
  );
}

function SpeakFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  // SPEAK has two parts: the prompt the reader reads aloud, and an
  // optional `expected` target phrase the reader compares the
  // transcript against. Language is BCP-47 (default en-US) so
  // SpeechRecognition + voice picker stay correct for non-English
  // classrooms.
  return (
    <>
      <TextAreaField
        label="PROMPT (READ ALOUD)"
        value={typeof draft.prompt === "string" ? draft.prompt : ""}
        onChange={(v) => update("prompt", v)}
        placeholder="Read this sentence aloud, paying attention to the underlined words."
        rows={3}
        maxLength={500}
        hint="The reader speaks this via the browser's text-to-speech."
      />
      <TextField
        label="EXPECTED RESPONSE (OPTIONAL)"
        value={typeof draft.expected === "string" ? draft.expected : ""}
        onChange={(v) => update("expected", v)}
        placeholder="The phrase the student should say back"
        maxLength={300}
        hint="When set, the reader compares the student's transcript to this."
      />
      <TextField
        label="LANGUAGE CODE"
        value={typeof draft.language === "string" ? draft.language : ""}
        onChange={(v) => update("language", v)}
        placeholder="en-US"
        maxLength={16}
        hint="BCP-47 code. Leave blank for en-US. Examples: es-ES, fr-FR, hi-IN."
      />
    </>
  );
}

function SimulationFields({
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
        label="SIMULATION URL"
        value={typeof draft.url === "string" ? draft.url : ""}
        onChange={(v) => update("url", v)}
        placeholder="https://phet.colorado.edu/… · https://www.desmos.com/… · any iframe-able URL"
        maxLength={500}
        hint="Most PhET, Desmos, and GeoGebra sims embed cleanly. Reader falls back to a link for hosts that block embedding."
      />
      <TextField
        label="CAPTION (OPTIONAL)"
        value={typeof draft.caption === "string" ? draft.caption : ""}
        onChange={(v) => update("caption", v)}
        placeholder="One-line description shown under the sim"
        maxLength={200}
      />
    </>
  );
}

function QuizFields({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: <K extends keyof BlockSettingsShape>(
    key: K,
    value: BlockSettingsShape[K]
  ) => void;
}) {
  const questions: QuizQuestion[] = Array.isArray(draft.questions)
    ? (draft.questions as QuizQuestion[])
    : [];

  const setQuestions = (next: QuizQuestion[]) => update("questions", next);

  const addQuestion = () => {
    if (questions.length >= 8) return;
    setQuestions([...questions, blankQuizQuestion()]);
  };
  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };
  const setStem = (idx: number, stem: string) =>
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, stem } : q)));
  const setHint = (idx: number, hint: string) =>
    setQuestions(
      questions.map((q, i) => (i === idx ? { ...q, hint } : q))
    );
  const setAnswerText = (qIdx: number, aIdx: number, text: string) =>
    setQuestions(
      questions.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              answers: q.answers.map((a, j) =>
                j === aIdx ? { ...a, text } : a
              ),
            }
          : q
      )
    );
  const setCorrect = (qIdx: number, aIdx: number) =>
    setQuestions(
      questions.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              answers: q.answers.map((a, j) => ({
                ...a,
                correct: j === aIdx,
              })),
            }
          : q
      )
    );

  // Start a question on first render if the inspector is empty — saves
  // the teacher from staring at a do-nothing pane.
  useEffect(() => {
    if (questions.length === 0) {
      setQuestions([blankQuizQuestion()]);
    }
    // questions.length is enough — setQuestions identity isn't stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {questions.map((q, qIdx) => (
        <div
          key={qIdx}
          style={{
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
            background: "var(--wf-fillsoft)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span
              className="wf-mono"
              style={{
                fontSize: 10,
                color: "var(--wf-mute)",
                letterSpacing: "0.06em",
              }}
            >
              Q{qIdx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeQuestion(qIdx)}
              disabled={questions.length <= 1}
              aria-label={`Remove question ${qIdx + 1}`}
              title={
                questions.length <= 1
                  ? "Need at least 1 question"
                  : "Remove this question"
              }
              style={{
                border: "none",
                background: "transparent",
                color:
                  questions.length <= 1
                    ? "var(--wf-hairline)"
                    : "var(--wf-mute)",
                cursor:
                  questions.length <= 1 ? "not-allowed" : "pointer",
                fontSize: 13,
                lineHeight: 1,
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
          <textarea
            value={q.stem}
            onChange={(e) => setStem(qIdx, e.target.value)}
            placeholder="Question stem (e.g. 'What is 3 × 4?')"
            rows={2}
            maxLength={500}
            style={{
              width: "100%",
              padding: "5px 7px",
              fontSize: 11,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              fontFamily: "inherit",
              resize: "vertical",
              marginBottom: 6,
            }}
          />
          {q.answers.map((a, aIdx) => (
            <div
              key={aIdx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <input
                type="radio"
                name={`quiz-correct-${qIdx}`}
                checked={a.correct}
                onChange={() => setCorrect(qIdx, aIdx)}
                aria-label={`Mark answer ${a.key} as correct`}
                style={{ accentColor: "var(--wf-good)" }}
              />
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  width: 12,
                }}
              >
                {a.key}
              </span>
              <input
                type="text"
                value={a.text}
                onChange={(e) => setAnswerText(qIdx, aIdx, e.target.value)}
                placeholder={`Answer ${a.key}`}
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
            </div>
          ))}
          <input
            type="text"
            value={q.hint ?? ""}
            onChange={(e) => setHint(qIdx, e.target.value)}
            placeholder="Hint (optional)"
            maxLength={200}
            style={{
              width: "100%",
              marginTop: 4,
              padding: "5px 7px",
              fontSize: 11,
              border: "1px solid var(--wf-hairline)",
              borderRadius: 3,
              background: "white",
              fontFamily: "inherit",
              color: "var(--wf-ai)",
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addQuestion}
        disabled={questions.length >= 8}
        style={{
          marginTop: 4,
          padding: "5px 10px",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          fontSize: 10,
          fontWeight: 600,
          color:
            questions.length >= 8 ? "var(--wf-mute)" : "var(--wf-body)",
          cursor: questions.length >= 8 ? "not-allowed" : "pointer",
        }}
      >
        + Add question ({questions.length}/8)
      </button>
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

/* ── APPEARANCE / BEHAVIOR sections (Course Builder v2) ─────────── */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="wf-mono"
      style={{
        fontSize: 9,
        letterSpacing: "0.08em",
        color: "var(--wf-mute)",
        margin: "18px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
  divider = true,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: divider ? "1px solid var(--wf-hairline)" : "none",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--wf-body)" }}>{label}</span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

type UpdateFn = <K extends keyof BlockSettingsShape>(
  key: K,
  value: BlockSettingsShape[K]
) => void;

function AppearanceSection({
  draft,
  update,
}: {
  draft: BlockSettingsShape;
  update: UpdateFn;
}) {
  const a = draft.appearance ?? {};
  const setA = (patch: Partial<NonNullable<BlockSettingsShape["appearance"]>>) =>
    update("appearance", { ...a, ...patch });
  const layout = a.optionLayout ?? "list";
  const accent = a.accent ?? ACCENT_SWATCHES[0];
  return (
    <>
      <SectionLabel>APPEARANCE</SectionLabel>
      <div
        style={{ fontSize: 10.5, color: "var(--wf-mute)", marginBottom: 6 }}
      >
        Option layout
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["list", "grid", "inline"] as const).map((opt) => {
          const on = layout === opt;
          const txt =
            opt === "list" ? "List" : opt === "grid" ? "Grid 2×2" : "Inline";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setA({ optionLayout: opt })}
              style={{
                flex: 1,
                padding: "7px 4px",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: on ? 600 : 500,
                border: `1.5px solid ${on ? "var(--wf-ink)" : "var(--wf-hairline)"}`,
                background: on ? "var(--wf-ink)" : "white",
                color: on ? "white" : "var(--wf-body)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {txt}
            </button>
          );
        })}
      </div>
      <div
        style={{ fontSize: 10.5, color: "var(--wf-mute)", marginBottom: 6 }}
      >
        Accent
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        {ACCENT_SWATCHES.map((c) => {
          const on = accent.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              onClick={() => setA({ accent: c })}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: c,
                border: on
                  ? "2px solid var(--wf-ink)"
                  : "1px solid var(--wf-hairline)",
                boxShadow: on ? "0 0 0 2px white inset" : "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>
      <ToggleRow
        label="Show option letters (A–D)"
        on={a.showLetters ?? true}
        onChange={(v) => setA({ showLetters: v })}
      />
      <ToggleRow
        label="Card style"
        on={a.cardStyle ?? true}
        onChange={(v) => setA({ cardStyle: v })}
      />
      <ToggleRow
        label="Show correct after submit"
        on={a.showCorrect ?? true}
        onChange={(v) => setA({ showCorrect: v })}
        divider={false}
      />
    </>
  );
}

function BehaviorSection({
  type,
  draft,
  update,
}: {
  type: BlockType;
  draft: BlockSettingsShape;
  update: UpdateFn;
}) {
  const b = draft.behavior ?? {};
  const setB = (patch: Partial<NonNullable<BlockSettingsShape["behavior"]>>) =>
    update("behavior", { ...b, ...patch });
  const isPractice = PRACTICE_TYPES.has(type);
  const xp = typeof b.xp === "number" ? b.xp : 20;
  return (
    <>
      <SectionLabel>BEHAVIOR</SectionLabel>
      {isPractice && (
        <>
          <ToggleRow
            label="Adaptive difficulty"
            on={b.adaptive ?? true}
            onChange={(v) => setB({ adaptive: v })}
          />
          <ToggleRow
            label="Allow AI tutor hints"
            on={b.aiHints ?? true}
            onChange={(v) => setB({ aiHints: v })}
          />
        </>
      )}
      <ToggleRow
        label="Required to pass"
        on={b.required ?? isPractice}
        onChange={(v) => setB({ required: v })}
      />
      <ToggleRow
        label="Allow retake"
        on={b.retake ?? true}
        onChange={(v) => setB({ retake: v })}
        divider={false}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0 2px",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--wf-body)" }}>XP reward</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={0}
            max={500}
            step={5}
            value={xp}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n >= 0 && n <= 500) setB({ xp: n });
            }}
            style={{
              width: 64,
              padding: "3px 8px",
              fontSize: 12,
              textAlign: "right",
              border: "1px solid var(--wf-hairline)",
              borderRadius: 6,
              background: "white",
              fontFamily: "var(--font-mono-stack)",
              color: "var(--wf-ink)",
            }}
          />
          <span
            className="wf-mono"
            style={{ fontSize: 11, color: "var(--wf-mute)" }}
          >
            XP
          </span>
        </div>
      </div>
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
