"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/react";
import { Btn, Card, Eyebrow } from "@/components/wf/primitives";
import { CourseCard } from "./CourseCard";
import { MarketplaceFilters } from "./MarketplaceFilters";
import { MarketplaceSort } from "./MarketplaceSort";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

/**
 * The /browse catalog body: a search box that filters the full course
 * list as the user types. Input is debounced 250ms into a server-side
 * `marketplace.browse` query (so results stay correct as the catalog
 * outgrows what one page could hold), and `keepPreviousData` keeps the
 * previous grid on screen while the next keystroke's results load — no
 * flicker. "Load more" walks the cursor for big catalogs.
 */
export function BrowseClient({ initialQ }: { initialQ: string }) {
  const [q, setQ] = useState(initialQ);
  const debouncedQ = useDebouncedValue(q.trim(), 250);

  // Chip filters + sort live in the URL (the same MarketplaceFilters /
  // MarketplaceSort components as the homepage — they're pathname-aware)
  // while the search text stays local state for keystroke-speed updates.
  const sp = useSearchParams();
  const filters = {
    topic: sp?.get("topic") ?? undefined,
    subject: sp?.get("subject") ?? undefined,
    grade: sp?.get("grade") ?? undefined,
    price: sp?.get("price") ?? undefined,
    length: sp?.get("length") ?? undefined,
    rating: sp?.get("rating") ?? undefined,
    format: sp?.get("format") ?? undefined,
    sort: sp?.get("sort") ?? undefined,
  };

  const browse = trpc.marketplace.browse.useInfiniteQuery(
    { q: debouncedQ || undefined, ...filters, limit: 24 },
    {
      getNextPageParam: (last) => last.nextCursor,
      placeholderData: keepPreviousData,
    }
  );
  // Badge cards the student already owns ([] for anon visitors).
  const enrolled = trpc.course.myEnrolledIds.useQuery();
  const enrolledIds = new Set(enrolled.data ?? []);

  const courses = browse.data?.pages.flatMap((p) => p.courses) ?? [];
  const total = browse.data?.pages[0]?.total ?? 0;

  return (
    <div
      style={{
        padding: "24px 28px 40px",
        maxWidth: 1600,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <Eyebrow>Catalog</Eyebrow>
      <h1 className="wf-h1" style={{ fontSize: 28, margin: "6px 0 14px" }}>
        All courses
      </h1>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, subject, or teacher…"
          autoFocus
          aria-label="Search courses"
          style={{
            fontSize: 13,
            padding: "9px 12px",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            fontFamily: "inherit",
            width: "100%",
            maxWidth: 420,
            boxSizing: "border-box",
          }}
        />
        <span
          className="wf-mono"
          style={{ fontSize: 11, color: "var(--wf-mute)" }}
        >
          {browse.isLoading
            ? "…"
            : `${total.toLocaleString()} course${total === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Same filter row as the homepage — the chips write this page's
          URL, and the query above re-runs from it. */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 18,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Eyebrow style={{ marginRight: 8 }}>Filter</Eyebrow>
        <MarketplaceFilters />
        <div style={{ flex: 1 }} />
        <MarketplaceSort />
      </div>

      {browse.isLoading ? null : courses.length === 0 ? (
        <Card p={28} style={{ textAlign: "center" }}>
          <Eyebrow>No courses found</Eyebrow>
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "var(--wf-body)",
            }}
          >
            Nothing matches &ldquo;{debouncedQ}&rdquo;.{" "}
            <button
              type="button"
              onClick={() => setQ("")}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: "var(--wf-accent)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear search
            </button>
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(240px, 100%), 1fr))",
            gap: 12,
          }}
        >
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} owned={enrolledIds.has(c.id)} />
          ))}
        </div>
      )}

      {browse.hasNextPage && (
        <div style={{ marginTop: 18, textAlign: "center" }}>
          <Btn
            variant="ghost"
            disabled={browse.isFetchingNextPage}
            onClick={() => browse.fetchNextPage()}
          >
            {browse.isFetchingNextPage ? "Loading…" : "Load more"}
          </Btn>
        </div>
      )}
    </div>
  );
}
