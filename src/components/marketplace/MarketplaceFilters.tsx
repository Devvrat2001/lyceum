"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverOption } from "@/components/ui/Popover";
import {
  MARKETPLACE_BOARD_BUCKETS,
  MARKETPLACE_FORMAT_BUCKETS,
  MARKETPLACE_GRADES,
  MARKETPLACE_LENGTH_BUCKETS,
  MARKETPLACE_PRICE_BUCKETS,
  MARKETPLACE_RATING_BUCKETS,
  MARKETPLACE_SUBJECTS,
} from "@/lib/marketplace";

/**
 * The 3 active marketplace filter dimensions wired into the URL.
 *
 * URL contract: each is a separate searchParam (`?grade=7&subject=ela&price=free`).
 * `topic` is owned by the chip row above and composes orthogonally —
 * the server side prioritises topic over subject in `topicWhere` /
 * `marketplace.featured`, but the UI still shows the subject chip's
 * selected value so the user can switch back.
 *
 * Picking a value navigates via router.push (shallow URL update so
 * the Server Component re-renders with new params + re-runs the
 * featured query). Picking the already-active value clears that
 * single filter (matches the topic-chip toggle behaviour).
 */
export function MarketplaceFilters() {
  const router = useRouter();
  // Pathname-aware so the same chips drive both the homepage ("/") and
  // the /browse catalog — each writes its own URL.
  const pathname = usePathname() ?? "/";
  const sp = useSearchParams();
  const grade = sp?.get("grade") ?? null;
  const board = sp?.get("board") ?? null;
  const subject = sp?.get("subject") ?? null;
  const price = sp?.get("price") ?? null;
  const length = sp?.get("length") ?? null;
  const rating = sp?.get("rating") ?? null;
  const format = sp?.get("format") ?? null;

  // Catalog labels (option + trigger text) come from MarketplaceCatalog,
  // keyed by the stable value; the filter chrome (dimension names, the
  // "Dim · value" trigger, CLEAR FILTERS) from MarketplaceFilters.
  const tc = useTranslations("MarketplaceCatalog");
  const tf = useTranslations("MarketplaceFilters");
  // Translate a stored value via its catalog category, guarding unknown
  // (junk URL) values to null so a bad `?grade=zzz` degrades to the
  // dimension fallback instead of throwing on a missing message key.
  const catLabel = (
    items: { value: string }[],
    cat: string,
    value: string | null
  ): string | null =>
    value && items.some((i) => i.value === value) ? tc(`${cat}.${value}`) : null;

  // Preserve any other params (notably `topic`) when we mutate one
  // dimension — losing the topic filter when picking a grade would be
  // a surprise.
  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp?.toString() ?? "");
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const gradeLabel = catLabel(MARKETPLACE_GRADES, "grades", grade);
  const boardLabel = catLabel(MARKETPLACE_BOARD_BUCKETS, "board", board);
  const subjectLabel = catLabel(MARKETPLACE_SUBJECTS, "subjects", subject);
  const priceLabel = catLabel(MARKETPLACE_PRICE_BUCKETS, "price", price);
  const lengthLabel = catLabel(MARKETPLACE_LENGTH_BUCKETS, "length", length);
  const ratingLabel = catLabel(MARKETPLACE_RATING_BUCKETS, "rating", rating);
  const formatLabel = catLabel(MARKETPLACE_FORMAT_BUCKETS, "format", format);

  // "Dim · value" trigger for an active filter; bare dimension name otherwise.
  const trigger = (dimKey: string, label: string | null) =>
    label ? tf("triggerActive", { dim: tf(dimKey), label }) : tf(dimKey);

  const anyActive = !!(
    grade ||
    board ||
    subject ||
    price ||
    length ||
    rating ||
    format
  );

  const clearAll = useMemo(() => {
    return () => {
      // Keep `topic` if present; clear our own dimensions only.
      const next = new URLSearchParams(sp?.toString() ?? "");
      next.delete("grade");
      next.delete("board");
      next.delete("subject");
      next.delete("price");
      next.delete("length");
      next.delete("rating");
      next.delete("format");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    };
  }, [router, sp, pathname]);

  return (
    <>
      <Popover
        active={!!grade}
        // gradeLabel already includes "Grade" / "Kindergarten" — no
        // double-prefix needed.
        triggerLabel={gradeLabel ?? tf("dimGrade")}
      >
        {({ close }) => (
          <>
            {MARKETPLACE_GRADES.map((g) => (
              <PopoverOption
                key={g.value}
                active={grade === g.value}
                onClick={() => {
                  updateParam("grade", grade === g.value ? null : g.value);
                  close();
                }}
              >
                {tc(`grades.${g.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover active={!!board} triggerLabel={trigger("dimBoard", boardLabel)}>
        {({ close }) => (
          <>
            {MARKETPLACE_BOARD_BUCKETS.map((b) => (
              <PopoverOption
                key={b.value}
                active={board === b.value}
                onClick={() => {
                  updateParam("board", board === b.value ? null : b.value);
                  close();
                }}
              >
                {tc(`board.${b.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!subject}
        triggerLabel={trigger("dimSubject", subjectLabel)}
      >
        {({ close }) => (
          <>
            {MARKETPLACE_SUBJECTS.map((s) => (
              <PopoverOption
                key={s.value}
                active={subject === s.value}
                onClick={() => {
                  updateParam(
                    "subject",
                    subject === s.value ? null : s.value
                  );
                  close();
                }}
              >
                {tc(`subjects.${s.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover active={!!price} triggerLabel={trigger("dimPrice", priceLabel)}>
        {({ close }) => (
          <>
            {MARKETPLACE_PRICE_BUCKETS.map((b) => (
              <PopoverOption
                key={b.value}
                active={price === b.value}
                onClick={() => {
                  updateParam("price", price === b.value ? null : b.value);
                  close();
                }}
              >
                {tc(`price.${b.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!length}
        triggerLabel={trigger("dimLength", lengthLabel)}
      >
        {({ close }) => (
          <>
            {MARKETPLACE_LENGTH_BUCKETS.map((b) => (
              <PopoverOption
                key={b.value}
                active={length === b.value}
                onClick={() => {
                  updateParam("length", length === b.value ? null : b.value);
                  close();
                }}
              >
                {tc(`length.${b.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!rating}
        triggerLabel={trigger("dimRating", ratingLabel)}
      >
        {({ close }) => (
          <>
            {MARKETPLACE_RATING_BUCKETS.map((b) => (
              <PopoverOption
                key={b.value}
                active={rating === b.value}
                onClick={() => {
                  updateParam("rating", rating === b.value ? null : b.value);
                  close();
                }}
              >
                {tc(`rating.${b.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!format}
        triggerLabel={trigger("dimFormat", formatLabel)}
      >
        {({ close }) => (
          <>
            {MARKETPLACE_FORMAT_BUCKETS.map((b) => (
              <PopoverOption
                key={b.value}
                active={format === b.value}
                onClick={() => {
                  updateParam("format", format === b.value ? null : b.value);
                  close();
                }}
              >
                {tc(`format.${b.value}`)}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          className="wf-mono"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--wf-accent)",
            fontSize: 10,
            letterSpacing: "0.06em",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          {tf("clearFilters")}
        </button>
      )}
    </>
  );
}
