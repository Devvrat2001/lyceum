"use client";

import { useState } from "react";
import { Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { BLOCK_GROUPS, findBlockMeta, type BlockType } from "@/lib/blocks";
import { BLOCK_TEMPLATES } from "@/lib/blockTemplates";

/**
 * Left-rail block library for the course builder.
 *
 * Replaces the original decorative `BLOCKS` placeholder. Shows two
 * sections:
 *   1. STARTERS — pre-populated templates from `BLOCK_TEMPLATES`
 *      (Tier 4.4 catalog). Click → inserts into `selectedLessonId`
 *      with the template's settings applied server-side.
 *   2. BLANK BLOCKS — the 15-type catalog from `BLOCK_GROUPS`. Click
 *      → inserts an empty block of that type into `selectedLessonId`.
 *
 * Insertion target is the lesson row the teacher most recently clicked
 * in the builder canvas. When nothing is selected we render a hint and
 * disable the items (cheaper than throwing an error after the click).
 *
 * Drag-and-drop from library to a lesson is a planned follow-up — it
 * needs the builder's three nested DndContexts collapsed into one
 * top-level context so a library draggable and a per-lesson droppable
 * can share `onDragEnd`. Click-to-insert delivers most of the
 * discoverability win in the meantime.
 */
export function BlockLibrary({
  selectedLessonId,
  selectedLessonLabel,
  onBlockAdded,
}: {
  selectedLessonId: string | null;
  /** Optional human-readable lesson name shown in the "inserting into…"
   *  chip. Falls back to the lessonId tail when omitted. */
  selectedLessonLabel?: string | null;
  /** Callback fired with the freshly-created block so the parent can
   *  append it to its local units state (mirrors AddBlockPopover). */
  onBlockAdded?: (
    lessonId: string,
    block: {
      id: string;
      type: BlockType;
      order: number;
      settings: Record<string, unknown>;
    }
  ) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const addBlock = trpc.teacher.addBlock.useMutation({
    onSuccess: (r, vars) => {
      setError(null);
      onBlockAdded?.(vars.lessonId, {
        id: r.block.id,
        type: r.block.type,
        order: r.block.order,
        settings: (r.block.settings ?? {}) as Record<string, unknown>,
      });
    },
    onError: (e) => setError(e.message),
  });

  const insertTemplate = (templateId: string, type: BlockType) => {
    if (!selectedLessonId) return;
    setError(null);
    addBlock.mutate({ lessonId: selectedLessonId, type, templateId });
  };

  const insertBlank = (type: BlockType) => {
    if (!selectedLessonId) return;
    setError(null);
    addBlock.mutate({ lessonId: selectedLessonId, type });
  };

  const disabled = !selectedLessonId || addBlock.isPending;

  return (
    <aside
      style={{
        borderRight: "1px solid var(--wf-hairline)",
        padding: "16px 14px",
        overflow: "auto",
        background: "var(--wf-fillsoft)",
      }}
    >
      <div
        className="wf-mono"
        style={{
          fontSize: 9,
          color: "var(--wf-mute)",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        BLOCK LIBRARY
      </div>

      {/* Target-lesson chip — explicit so teachers know where a click
          will insert. The "no lesson" state is intentionally non-
          actionable: every button below disables until a lesson row is
          picked in the canvas. */}
      <div
        style={{
          padding: "6px 8px",
          marginBottom: 12,
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: selectedLessonId ? "white" : "transparent",
          fontSize: 10,
          color: selectedLessonId ? "var(--wf-body)" : "var(--wf-mute)",
          lineHeight: 1.3,
        }}
      >
        {selectedLessonId ? (
          <>
            <span style={{ color: "var(--wf-mute)" }}>Insert into → </span>
            <strong style={{ color: "var(--wf-ink)" }}>
              {selectedLessonLabel ?? `lesson ${selectedLessonId.slice(-6)}`}
            </strong>
          </>
        ) : (
          <em>Click any lesson in the canvas to set the insert target.</em>
        )}
      </div>

      {/* STARTERS — templated blocks with pre-populated settings. */}
      <div style={{ marginBottom: 16 }}>
        <div
          className="wf-mono"
          style={{
            fontSize: 9,
            color: "var(--wf-mute)",
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          STARTERS
        </div>
        {BLOCK_TEMPLATES.map((t) => {
          const meta = findBlockMeta(t.type);
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => insertTemplate(t.id, t.type)}
              title={t.description}
              className="wf-block-card"
              data-ai={Boolean(meta.ai)}
              style={{
                width: "100%",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                textAlign: "left",
              }}
            >
              <Icon name="plus" size={11} color="var(--wf-mute)" />
              <Icon name={meta.icon as "play"} size={13} color="currentColor" />
              <span style={{ flex: 1, minWidth: 0 }}>{t.label}</span>
              {meta.ai && (
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 8,
                    color: "var(--wf-ai)",
                  }}
                >
                  AI
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* BLANK BLOCKS — same 15-type catalog as the popover; insert
          empty so the teacher fills via the inspector. */}
      {BLOCK_GROUPS.map((grp) => (
        <div key={grp.group} style={{ marginBottom: 16 }}>
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-mute)",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            {grp.group.toUpperCase()}
          </div>
          {grp.items.map((it) => (
            <button
              key={it.type}
              type="button"
              disabled={disabled}
              onClick={() => insertBlank(it.type)}
              className="wf-block-card"
              data-ai={Boolean(it.ai)}
              style={{
                width: "100%",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                textAlign: "left",
              }}
            >
              <Icon name="plus" size={11} color="var(--wf-mute)" />
              <Icon name={it.icon as "play"} size={13} color="currentColor" />
              <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
              {it.ai && (
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 8,
                    color: "var(--wf-ai)",
                  }}
                >
                  AI
                </span>
              )}
            </button>
          ))}
        </div>
      ))}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: 6,
            fontSize: 10,
            color: "var(--wf-accent)",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 3,
          }}
        >
          {error}
        </div>
      )}
    </aside>
  );
}
