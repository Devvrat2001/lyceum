"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/wf/primitives";

/**
 * Bare-bones anchored popover. Used by the marketplace filter chips
 * and (eventually) anywhere else a small "click chip → reveal options"
 * panel is needed.
 *
 * - `triggerLabel` is what's rendered inside the chip; the caller
 *   formats it (e.g. "Grade ▾" vs "Grade 7 ▾" when filtered).
 * - `active` flips the chip to `wf-chip--accent` so the user can tell
 *   at a glance which filters are non-default. This is a render-time
 *   prop, not derived from `children` — the caller already knows.
 * - `children` receives `close()` so option clicks can dismiss the
 *   panel after navigation kicks off.
 *
 * Click-outside + Escape both close. We attach the document listener
 * only while open so the no-op case is free.
 *
 * We deliberately don't portal — the popover is anchored to the chip
 * inside the filter row, which is at z-index above most page content
 * but below the sticky header. If we ever need it inside an
 * overflow:hidden ancestor, swap to a portal then.
 */
export function Popover({
  triggerLabel,
  active,
  children,
}: {
  triggerLabel: string;
  active?: boolean;
  children: (api: { close: () => void }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        className={`wf-chip${active ? " wf-chip--accent" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
        }}
      >
        {triggerLabel}
        <Icon
          name="arrow"
          size={10}
          color="currentColor"
          style={{
            transform: open ? "rotate(-90deg)" : "rotate(90deg)",
            transition: "transform 0.12s",
          }}
        />
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 180,
            background: "white",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            padding: 4,
            zIndex: 9,
          }}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}

/**
 * Option row meant for use inside <Popover>. Keeps option styling
 * consistent and writes the `aria-selected` attribute that screen
 * readers expect when listbox children are option buttons.
 */
export function PopoverOption({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={!!active}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 10px",
        border: "none",
        borderRadius: 3,
        background: active ? "var(--wf-fillsoft)" : "transparent",
        textAlign: "left",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--wf-accent)" : "var(--wf-ink)",
      }}
    >
      <span
        style={{
          width: 12,
          display: "inline-flex",
          justifyContent: "center",
        }}
      >
        {active ? (
          <Icon name="check" size={11} color="var(--wf-accent)" />
        ) : null}
      </span>
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}
