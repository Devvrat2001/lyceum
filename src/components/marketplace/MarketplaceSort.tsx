"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Popover, PopoverOption } from "@/components/ui/Popover";
import {
  MARKETPLACE_DEFAULT_SORT,
  MARKETPLACE_SORTS,
} from "@/lib/marketplace";

/**
 * Sort control for the marketplace grid — the right-hand sibling of the
 * filter chips. Replaces the old static "POPULAR ▾" label.
 *
 * URL contract: `?sort=<slug>`. Like the filters, picking a value pushes a
 * new URL so the Server Component re-runs `marketplace.featured` with the
 * new `orderBy`. "popular" is the default, so picking it (or having no
 * param) drops `?sort=` entirely — the canonical homepage URL stays clean.
 * Other params (topic/grade/subject/price/length/rating) are preserved.
 */
export function MarketplaceSort() {
  const router = useRouter();
  // Pathname-aware: drives "/" and "/browse" alike.
  const pathname = usePathname() ?? "/";
  const sp = useSearchParams();
  const sort = sp?.get("sort") ?? null;
  const tc = useTranslations("MarketplaceCatalog");
  const tf = useTranslations("MarketplaceFilters");
  // Unknown / missing slug shows the default label (mirrors the server,
  // which falls back to the popularity ranking for the same input).
  const effectiveSort =
    sort && MARKETPLACE_SORTS.some((s) => s.value === sort)
      ? sort
      : MARKETPLACE_DEFAULT_SORT;
  const sortLabel = tc(`sorts.${effectiveSort}`);

  const pick = (value: string) => {
    const next = new URLSearchParams(sp?.toString() ?? "");
    if (value === MARKETPLACE_DEFAULT_SORT) next.delete("sort");
    else next.set("sort", value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Popover
      // Non-default sort gets the accent treatment so it's visible the grid
      // isn't in its default order.
      active={!!sort && sort !== MARKETPLACE_DEFAULT_SORT}
      triggerLabel={tf("triggerActive", { dim: tf("dimSort"), label: sortLabel })}
    >
      {({ close }) => (
        <>
          {MARKETPLACE_SORTS.map((s) => (
            <PopoverOption
              key={s.value}
              active={(sort ?? MARKETPLACE_DEFAULT_SORT) === s.value}
              onClick={() => {
                pick(s.value);
                close();
              }}
            >
              {tc(`sorts.${s.value}`)}
            </PopoverOption>
          ))}
        </>
      )}
    </Popover>
  );
}
