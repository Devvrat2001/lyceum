"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Popover, PopoverOption } from "@/components/ui/Popover";
import {
  MARKETPLACE_GRADES,
  MARKETPLACE_LENGTH_BUCKETS,
  MARKETPLACE_PRICE_BUCKETS,
  MARKETPLACE_SUBJECTS,
  labelFor,
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
  const sp = useSearchParams();
  const grade = sp?.get("grade") ?? null;
  const subject = sp?.get("subject") ?? null;
  const price = sp?.get("price") ?? null;
  const length = sp?.get("length") ?? null;

  // Preserve any other params (notably `topic`) when we mutate one
  // dimension — losing the topic filter when picking a grade would be
  // a surprise.
  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp?.toString() ?? "");
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const gradeLabel = labelFor(MARKETPLACE_GRADES, grade ?? undefined);
  const subjectLabel = labelFor(MARKETPLACE_SUBJECTS, subject ?? undefined);
  const priceLabel = labelFor(MARKETPLACE_PRICE_BUCKETS, price ?? undefined);
  const lengthLabel = labelFor(MARKETPLACE_LENGTH_BUCKETS, length ?? undefined);

  const anyActive = !!(grade || subject || price || length);

  const clearAll = useMemo(() => {
    return () => {
      // Keep `topic` if present; clear our three dimensions only.
      const next = new URLSearchParams(sp?.toString() ?? "");
      next.delete("grade");
      next.delete("subject");
      next.delete("price");
      next.delete("length");
      const qs = next.toString();
      router.push(qs ? `/?${qs}` : "/");
    };
  }, [router, sp]);

  return (
    <>
      <Popover
        active={!!grade}
        // gradeLabel already includes "Grade" / "Kindergarten" — no
        // double-prefix needed.
        triggerLabel={gradeLabel ?? "Grade"}
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
                {g.label}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!subject}
        triggerLabel={subjectLabel ? `Subject · ${subjectLabel}` : "Subject"}
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
                {s.label}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!price}
        triggerLabel={priceLabel ? `Price · ${priceLabel}` : "Price"}
      >
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
                {b.label}
              </PopoverOption>
            ))}
          </>
        )}
      </Popover>

      <Popover
        active={!!length}
        triggerLabel={lengthLabel ? `Length · ${lengthLabel}` : "Length"}
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
                {b.label}
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
          CLEAR FILTERS
        </button>
      )}
    </>
  );
}
