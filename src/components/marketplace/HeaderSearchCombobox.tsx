"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Annot, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/**
 * Debounced typeahead in the marketplace header.
 *
 * Behaviour:
 * - Types ≥2 chars → debounced 220ms → `marketplace.semanticSearch` fires
 * - When OPENAI_API_KEY is configured the backend embeds the query and
 *   ranks by pgvector cosine similarity ("physics" → "electromagnetism");
 *   otherwise it falls back to plain ILIKE so the dropdown still works.
 *   The response carries `mode: "semantic" | "keyword"` for the badge.
 * - Dropdown shows up to 6 matches: course title + author label + tag
 * - ↑/↓ navigates highlight; Enter goes to highlighted result (or first
 *   result if none highlighted); Esc closes; click-outside closes
 * - "View all <N> results" footer when more than 6 matches (links to
 *   `/?q=…` — not yet wired to a results page, but the URL is set up
 *   so we can flesh that out without changing the combobox)
 *
 * The dropdown lives inside the header so it inherits the header's
 * z-index and doesn't need a portal; the parent must be
 * `position: relative` (already is in MarketChrome).
 *
 * `compact` mode renders a narrower input suitable for the role
 * chromes' sidebars (Student/Teacher/Admin) — same logic, smaller
 * footprint, no flex-grow (sidebars are flex-column, so the default
 * `flex: 1` would stretch the wrapper vertically and detach the
 * dropdown from the input). Without `compact`, defaults match the
 * MarketChrome header treatment unchanged.
 */
export function HeaderSearchCombobox({
  compact = false,
}: {
  compact?: boolean;
} = {}) {
  const router = useRouter();
  const inputId = useId();
  const listId = `${inputId}-list`;

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Debounce: only update the trpc query key after the input has been
  // quiet for 220ms. Keeps us from firing on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  const enabled = debouncedQ.length >= 2;
  const searchQuery = trpc.marketplace.semanticSearch.useQuery(
    { q: debouncedQ, limit: 7 },
    {
      enabled,
      // Result set is cheap; keep previous data visible while the next
      // query is in flight so the dropdown doesn't flicker between
      // keystrokes.
      placeholderData: (prev) => prev,
    }
  );
  const searchMode = searchQuery.data?.mode ?? "keyword";

  const results = useMemo(() => {
    if (!enabled) return [];
    return searchQuery.data?.courses ?? [];
  }, [enabled, searchQuery.data]);
  const visibleResults = results.slice(0, 6);
  const overflow = results.length > 6;

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [isOpen]);

  // Reset highlight is folded into the input's onChange below — using
  // useEffect for "when debouncedQ changes, reset highlight" trips the
  // react-hooks/set-state-in-effect rule (setState in effect → cascading
  // render). Per React docs the correct place is the event handler that
  // *causes* the change, which is the input's onChange.

  const goTo = (slug: string) => {
    setIsOpen(false);
    setQ("");
    setDebouncedQ("");
    router.push(`/course/${slug}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) =>
        visibleResults.length === 0 ? -1 : (h + 1) % visibleResults.length
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        visibleResults.length === 0
          ? -1
          : (h - 1 + visibleResults.length) % visibleResults.length
      );
    } else if (e.key === "Enter") {
      const pick =
        highlight >= 0 && highlight < visibleResults.length
          ? visibleResults[highlight]
          : visibleResults[0];
      if (pick) {
        e.preventDefault();
        goTo(pick.slug);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown =
    isOpen &&
    (enabled || q.length > 0); // open the panel even mid-debounce so it doesn't pop in/out

  return (
    <div
      ref={wrapRef}
      style={
        compact
          ? { width: "100%", position: "relative" }
          : { flex: 1, position: "relative", maxWidth: 480 }
      }
    >
      <label
        htmlFor={inputId}
        style={{
          display: "flex",
          gap: 10,
          padding: "8px 12px",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 4,
          color: "var(--wf-mute)",
          fontSize: 12,
          alignItems: "center",
          cursor: "text",
          background: "white",
        }}
      >
        <Icon name="search" size={14} color="var(--wf-mute)" />
        <input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlight >= 0 ? `${listId}-${highlight}` : undefined
          }
          placeholder={
            compact ? "Search…" : "Search 12,400+ courses, skills, or grades…"
          }
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIsOpen(true);
            // Typing means the previous highlighted result is stale —
            // drop it so Enter selects the top result from the new
            // (debounced) query rather than whatever was highlighted
            // before.
            setHighlight(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 12,
            color: "var(--wf-ink)",
            fontFamily: "inherit",
          }}
        />
        {/* Honest label about what the backend is doing. When OPENAI_API_KEY
            isn't set, semanticSearch degrades to ILIKE — say so rather than
            mislabeling it as "Semantic search". */}
        <Annot ai={searchMode === "semantic"}>
          {searchMode === "semantic" ? "Semantic search" : "Keyword search"}
        </Annot>
      </label>

      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 20,
            maxHeight: 340,
            overflow: "auto",
          }}
        >
          {!enabled ? (
            <div
              style={{
                padding: "10px 14px",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              Keep typing — 2 characters minimum.
            </div>
          ) : searchQuery.isFetching && visibleResults.length === 0 ? (
            <div
              style={{
                padding: "10px 14px",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              Searching for &ldquo;{debouncedQ}&rdquo;…
            </div>
          ) : visibleResults.length === 0 ? (
            <div
              style={{
                padding: "10px 14px",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              No matches for &ldquo;{debouncedQ}&rdquo;.
            </div>
          ) : (
            <>
              {visibleResults.map((c, i) => {
                const active = i === highlight;
                return (
                  <button
                    key={c.slug}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => goTo(c.slug)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      border: "none",
                      borderBottom: "1px solid var(--wf-hairline)",
                      background: active ? "var(--wf-fillsoft)" : "white",
                      textAlign: "left",
                      cursor: "pointer",
                      color: "var(--wf-ink)",
                    }}
                  >
                    <Icon name="play" size={12} color="var(--wf-body)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--wf-mute)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.authorLabel}
                        {c.tag ? ` · ${c.tag}` : ""}
                      </div>
                    </div>
                    {typeof c.ratingAvg === "number" && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--wf-mute)",
                        }}
                      >
                        ★ {c.ratingAvg.toFixed(1)}
                      </span>
                    )}
                  </button>
                );
              })}
              {overflow && (
                <div
                  style={{
                    padding: "8px 14px",
                    fontSize: 10,
                    color: "var(--wf-mute)",
                    background: "var(--wf-fillsoft)",
                  }}
                >
                  Showing first 6 of {results.length} matches. Press Enter
                  on a result to open it.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
