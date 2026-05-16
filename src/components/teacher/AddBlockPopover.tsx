"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/react";
import { Icon } from "@/components/wf/primitives";

/**
 * Block-type catalog the popover offers. Mirrors `BlockType` in
 * prisma/schema.prisma but adds the user-facing label + icon + an
 * `ai` flag so AI-powered blocks can pick up the purple accent.
 *
 * Grouped to match the block library sidebar's visual order.
 */
const BLOCK_GROUPS: ReadonlyArray<{
  group: string;
  items: ReadonlyArray<{
    type:
      | "VIDEO"
      | "READING"
      | "SLIDES"
      | "PDF"
      | "QUIZ"
      | "MCQ"
      | "SPEAK"
      | "AI_QUIZ"
      | "SIMULATION"
      | "BRANCHING"
      | "DRAG_MATCH"
      | "POLL"
      | "SECTION"
      | "DISCUSSION"
      | "LIVE";
    icon: string;
    label: string;
    ai?: boolean;
  }>;
}> = [
  {
    group: "Content",
    items: [
      { type: "VIDEO", icon: "play", label: "Video" },
      { type: "READING", icon: "book", label: "Reading" },
      { type: "SLIDES", icon: "grid", label: "Slides" },
      { type: "PDF", icon: "download", label: "PDF / file" },
    ],
  },
  {
    group: "Practice",
    items: [
      { type: "QUIZ", icon: "star", label: "Quiz" },
      { type: "MCQ", icon: "check", label: "Multiple choice" },
      { type: "SPEAK", icon: "mic", label: "Speak / record" },
      { type: "AI_QUIZ", icon: "sparkles", label: "AI quiz", ai: true },
    ],
  },
  {
    group: "Interactive",
    items: [
      { type: "SIMULATION", icon: "bolt", label: "Simulation" },
      { type: "BRANCHING", icon: "branch", label: "Branching scenario" },
      { type: "DRAG_MATCH", icon: "grid", label: "Drag & match" },
      { type: "POLL", icon: "chart", label: "Live poll" },
    ],
  },
  {
    group: "Structure",
    items: [
      { type: "SECTION", icon: "plus", label: "Section break" },
      { type: "DISCUSSION", icon: "chat", label: "Discussion thread" },
      { type: "LIVE", icon: "user", label: "Live session" },
    ],
  },
];

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
  onAdded?: (newCount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBlock = trpc.teacher.addBlock.useMutation({
    onSuccess: () => {
      // Defer to caller for the block count update — they own the
      // local state and may want to do something else too (toast etc).
      onAdded?.(0);
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
              minWidth: 200,
              background: "white",
              border: "1px solid var(--wf-hairline)",
              borderRadius: 4,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              padding: 6,
              zIndex: 12,
              maxHeight: 360,
              overflow: "auto",
            }}
          >
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
