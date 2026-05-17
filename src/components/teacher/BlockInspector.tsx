"use client";

import { useEffect, useState } from "react";
import { Btn, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { findBlockMeta, type BlockType } from "@/lib/blocks";

/**
 * Lightweight per-block editor that replaces the course-level
 * inspector on the right side of the builder when a block is
 * selected.
 *
 * v1 ships two universal fields: `label` (the display title shown
 * in the lesson reader; falls back to the type's catalog label) and
 * `notes` (teacher-internal scratch). Type-specific fields (video
 * URL, quiz prompt template, sim config) land in a follow-up that
 * dispatches on `block.type`.
 *
 * The form keeps a local draft so users can type freely without
 * triggering a network roundtrip on every keystroke. Save fires the
 * mutation, then the parent's `onSaved` callback updates local state
 * so the in-canvas block label re-renders.
 *
 * Settings is fully replaced server-side, not merged — so the spread
 * of the incoming block.settings preserves any future fields we
 * haven't yet added an editor for (forward-compatibility).
 */
export type BlockSettingsShape = {
  label?: string;
  notes?: string;
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
  const [label, setLabel] = useState(
    typeof block.settings.label === "string" ? block.settings.label : ""
  );
  const [notes, setNotes] = useState(
    typeof block.settings.notes === "string" ? block.settings.notes : ""
  );
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; msg: string } | null
  >(null);

  // Reset draft when the selected block changes underneath us
  // (clicking a different block in the canvas should NOT show the
  // previous one's draft). Re-keying via parent would also work,
  // but this keeps the state local and survives quick toggling.
  useEffect(() => {
    setLabel(
      typeof block.settings.label === "string" ? block.settings.label : ""
    );
    setNotes(
      typeof block.settings.notes === "string" ? block.settings.notes : ""
    );
    setFeedback(null);
  }, [block.id, block.settings.label, block.settings.notes]);

  const updateBlock = trpc.teacher.updateBlock.useMutation({
    onSuccess: ({ block: saved }) => {
      const settings = (saved.settings ?? {}) as BlockSettingsShape;
      onSaved(settings);
      setFeedback({ kind: "ok", msg: "Saved." });
      setTimeout(() => setFeedback(null), 1800);
    },
    onError: (e) => setFeedback({ kind: "error", msg: e.message }),
  });

  const dirty =
    (label ?? "") !== (block.settings.label ?? "") ||
    (notes ?? "") !== (block.settings.notes ?? "");

  const onSave = () => {
    const trimmedLabel = label.trim();
    const trimmedNotes = notes.trim();
    // Strip empty strings out of the saved JSON — keeps the column
    // tidy and means the "no custom label" check on the row stays
    // simple (`typeof === "string" && .trim()`).
    const nextSettings: BlockSettingsShape = {
      ...block.settings,
      ...(trimmedLabel ? { label: trimmedLabel } : { label: undefined }),
      ...(trimmedNotes ? { notes: trimmedNotes } : { notes: undefined }),
    };
    // Drop keys we set to undefined so the shape is clean on the wire.
    const cleaned = Object.fromEntries(
      Object.entries(nextSettings).filter(([, v]) => v !== undefined)
    ) as BlockSettingsShape;
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
          LABEL
        </div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={meta.label}
          maxLength={120}
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
        <div style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 4 }}>
          Shown to students. Blank = use the default ({meta.label}).
        </div>
      </label>

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
          TEACHER NOTES
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reminders for you. Not visible to students."
          rows={4}
          maxLength={2000}
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
      </label>

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

      <div
        style={{
          marginTop: 18,
          padding: 10,
          border: "1px dashed var(--wf-hairline)",
          borderRadius: 3,
          background: "transparent",
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
          COMING SOON
        </div>
        <div style={{ fontSize: 11, color: "var(--wf-body)", lineHeight: 1.5 }}>
          Type-specific fields land next (video URL for Video, prompt
          template for AI quiz, link list for Reading, etc.).
        </div>
      </div>
    </div>
  );
}
