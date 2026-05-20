"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/react";
import { Icon } from "@/components/wf/primitives";
import { BLOCK_GROUPS, findBlockMeta, type BlockType } from "@/lib/blocks";
import { BLOCK_TEMPLATES } from "@/lib/blockTemplates";

/**
 * Click "+ block" on a lesson row → opens this popover → pick a type
 * → `teacher.addBlock` fires → block count increments + popover closes.
 *
 * This file owns its own open/close state because the menu is per-row
 * and several may be on screen at once (one per lesson when units are
 * expanded). Using the shared `Popover` primitive would require
 * lifting state up; keeping it local is simpler.
 *
 * After a successful mutation we call `onAdded()` so the parent can
 * trigger a refetch of the course query (the builder uses a local
 * `units` mirror that needs to learn about the new block count).
 */
export function AddBlockPopover({
  lessonId,
  onAdded,
}: {
  lessonId: string;
  /** Receives the freshly-created block so the caller can append it
   *  to its local list (and let the count badge derive from list
   *  length). Settings is always `{}` for a new block — the
   *  inspector populates it after the user clicks the row. */
  onAdded?: (block: {
    id: string;
    type: BlockType;
    order: number;
    settings: Record<string, unknown>;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBlock = trpc.teacher.addBlock.useMutation({
    onSuccess: (r) => {
      // The server returns settings as Prisma.JsonValue; narrow to
      // the Record shape the caller expects (settings is always
      // {} on creation).
      onAdded?.({
        id: r.block.id,
        type: r.block.type,
        order: r.block.order,
        settings: (r.block.settings ?? {}) as Record<string, unknown>,
      });
      setOpen(false);
    },
    onError: (e) => setError(e.message),
  });

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={(e) => {
          // Stop bubbling so a click on this button inside the
          // sortable lesson row doesn't accidentally start a drag.
          e.stopPropagation();
          setError(null);
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add a block to this lesson"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--wf-body)",
          cursor: "pointer",
        }}
      >
        <Icon name="plus" size={10} color="currentColor" /> block
      </button>
      {open && (
        <>
          {/* Backdrop catches outside clicks. Cheaper than wiring a
              document-level pointerdown listener here because the menu
              is short-lived; we don't care about nested scroll. */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 11,
              background: "transparent",
            }}
          />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              minWidth: 240,
              background: "white",
              border: "1px solid var(--wf-hairline)",
              borderRadius: 4,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              padding: 6,
              zIndex: 12,
              maxHeight: 420,
              overflow: "auto",
            }}
          >
            {/* Templates: pre-populated starter blocks. Click one and
                the server seeds Block.settings with sensible defaults
                (4-option MCQ, 5-pair matching, etc.) so teachers skip
                the boilerplate-typing step. Resolved server-side from
                the catalog in @/lib/blockTemplates. */}
            <div style={{ marginBottom: 8 }}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 9,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                  padding: "4px 6px",
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
                    role="menuitem"
                    disabled={addBlock.isPending}
                    onClick={() =>
                      addBlock.mutate({
                        lessonId,
                        type: t.type,
                        templateId: t.id,
                      })
                    }
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      width: "100%",
                      padding: "6px 8px",
                      border: "none",
                      borderRadius: 3,
                      background: "transparent",
                      textAlign: "left",
                      cursor: addBlock.isPending ? "wait" : "pointer",
                      fontSize: 12,
                      color: meta.ai ? "var(--wf-ai)" : "var(--wf-ink)",
                    }}
                  >
                    <Icon
                      name={meta.icon as "play"}
                      size={12}
                      color="currentColor"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{t.label}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--wf-mute)",
                          marginTop: 1,
                          lineHeight: 1.3,
                        }}
                      >
                        {t.description}
                      </div>
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              style={{
                margin: "4px 0",
                borderTop: "1px solid var(--wf-hairline)",
              }}
            />
            {/* Blank-block insert (legacy path) — settings stays {}. */}
            {BLOCK_GROUPS.map((grp) => (
              <div key={grp.group} style={{ marginBottom: 8 }}>
                <div
                  className="wf-mono"
                  style={{
                    fontSize: 9,
                    color: "var(--wf-mute)",
                    letterSpacing: "0.06em",
                    padding: "4px 6px",
                  }}
                >
                  {grp.group.toUpperCase()}
                </div>
                {grp.items.map((it) => (
                  <button
                    key={it.type}
                    type="button"
                    role="menuitem"
                    disabled={addBlock.isPending}
                    onClick={() => addBlock.mutate({ lessonId, type: it.type })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "6px 8px",
                      border: "none",
                      borderRadius: 3,
                      background: "transparent",
                      textAlign: "left",
                      cursor: addBlock.isPending ? "wait" : "pointer",
                      fontSize: 12,
                      color: it.ai ? "var(--wf-ai)" : "var(--wf-ink)",
                    }}
                  >
                    <Icon
                      name={it.icon as "play"}
                      size={12}
                      color="currentColor"
                    />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.ai && (
                      <span
                        className="wf-mono"
                        style={{ fontSize: 8, letterSpacing: "0.06em" }}
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
                style={{
                  margin: "4px 6px 0",
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
          </div>
        </>
      )}
    </span>
  );
}
