"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";

/**
 * Global ⌘K / Ctrl-K command palette (REQUIREMENTS R14). Mounted once in
 * the root layout so it works on every page: type-ahead course search
 * through the existing hybrid semanticSearch + a few always-safe nav
 * jumps. Enter opens the highlighted row; arrows move; Esc closes.
 */

const NAV_ITEMS = [
  { label: "Marketplace home", href: "/" },
  { label: "Browse all courses", href: "/browse" },
  { label: "Account settings", href: "/settings" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Mirror of `open` for the once-registered hotkey listener — lets the
  // open/close + reset happen entirely inside the event handler (where
  // setState is fine) instead of a state-syncing effect.
  const openRef = useRef(false);

  const setOpenTracked = (v: boolean) => {
    openRef.current = v;
    setOpen(v);
  };

  // Global hotkey. ⌘K (mac) / Ctrl-K (win) toggles; Esc closes. Opening
  // starts from a clean slate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) {
          setOpenTracked(false);
        } else {
          setQ("");
          setDebouncedQ("");
          setHighlight(0);
          setOpenTracked(true);
        }
      } else if (e.key === "Escape") {
        setOpenTracked(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the input after the overlay paints (DOM sync only).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounce the search input so we don't hit the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const search = trpc.marketplace.semanticSearch.useQuery(
    { q: debouncedQ, limit: 6 },
    { enabled: open && debouncedQ.length > 0, staleTime: 30_000 }
  );

  if (!open) return null;

  const courseRows = (search.data?.courses ?? []).map((c) => ({
    kind: "course" as const,
    label: c.title,
    sub: c.authorLabel ?? undefined,
    href: `/course/${c.slug}`,
  }));
  const navRows = NAV_ITEMS.filter(
    (n) => !q || n.label.toLowerCase().includes(q.toLowerCase())
  ).map((n) => ({ kind: "nav" as const, label: n.label, sub: undefined, href: n.href }));
  const rows = [...courseRows, ...navRows];
  const active = Math.min(highlight, Math.max(0, rows.length - 1));

  const go = (href: string) => {
    setOpenTracked(false);
    router.push(href);
  };

  return (
    <div
      onClick={() => setOpenTracked(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20, 18, 14, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          background: "var(--wf-bg)",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 8,
          boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && rows[active]) {
              e.preventDefault();
              go(rows[active].href);
            }
          }}
          placeholder="Search courses, or jump to a page…"
          style={{
            width: "100%",
            padding: "14px 16px",
            border: "none",
            borderBottom: "1px solid var(--wf-hairline)",
            outline: "none",
            fontSize: 15,
            background: "transparent",
            color: "inherit",
          }}
        />
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {debouncedQ && search.isLoading && (
            <div
              style={{ padding: "12px 16px", fontSize: 12, color: "var(--wf-mute)" }}
            >
              Searching…
            </div>
          )}
          {rows.map((r, i) => (
            <button
              key={`${r.kind}-${r.href}`}
              onClick={() => go(r.href)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                background:
                  i === active ? "var(--wf-fillsoft)" : "transparent",
                color: "inherit",
              }}
            >
              <span
                className="wf-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: "var(--wf-mute)",
                  width: 52,
                  flexShrink: 0,
                }}
              >
                {r.kind === "course" ? "COURSE" : "GO TO"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                {r.label}
              </span>
              {r.sub && (
                <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                  {r.sub}
                </span>
              )}
            </button>
          ))}
          {rows.length === 0 && !search.isLoading && (
            <div
              style={{ padding: "14px 16px", fontSize: 12, color: "var(--wf-mute)" }}
            >
              No matches — try a subject like “fractions” or “origami”.
            </div>
          )}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--wf-hairline)",
            display: "flex",
            gap: 14,
            fontSize: 10,
            color: "var(--wf-mute)",
          }}
          className="wf-mono"
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
