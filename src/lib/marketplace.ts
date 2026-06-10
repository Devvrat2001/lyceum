/**
 * Marketplace topic chip metadata. Lives outside `src/server/` so both
 * the public page (which reads the active slug from `?topic=` and
 * renders chip UI) and the marketplace router (which translates the
 * slug into a Prisma `where` fragment) can share the source of truth.
 *
 * Slugs are lowercase + dashed because they go into URLs unencoded.
 * The router's topic→where translation lives inline in
 * `src/server/routers/marketplace.ts::topicWhere()` — keeping
 * Prisma types out of this file means it stays import-light enough
 * to use anywhere.
 */
export type MarketplaceTopic = {
  slug: string;
  label: string;
};

export const MARKETPLACE_TOPICS: MarketplaceTopic[] = [
  { slug: "stem", label: "STEM" },
  { slug: "reading", label: "Reading" },
  { slug: "coding", label: "Coding for kids" },
  { slug: "science-fair", label: "Science fair" },
  { slug: "test-prep", label: "Test prep" },
  { slug: "spanish", label: "Spanish" },
  { slug: "art", label: "Art" },
  { slug: "music", label: "Music" },
];

export function findTopic(slug: string | undefined): MarketplaceTopic | null {
  if (!slug) return null;
  const norm = slug.toLowerCase();
  return MARKETPLACE_TOPICS.find((t) => t.slug === norm) ?? null;
}

/**
 * Grade picker options. Hard-coded for now — the seed only covers
 * Grade 6 but the filter still wants to show the full K-12 range so
 * the UI feels real. Empty results in non-6 grades surface the
 * existing "No courses found" empty state.
 */
export const MARKETPLACE_GRADES: { value: string; label: string }[] = [
  { value: "K", label: "Kindergarten" },
  { value: "1", label: "Grade 1" },
  { value: "2", label: "Grade 2" },
  { value: "3", label: "Grade 3" },
  { value: "4", label: "Grade 4" },
  { value: "5", label: "Grade 5" },
  { value: "6", label: "Grade 6" },
  { value: "7", label: "Grade 7" },
  { value: "8", label: "Grade 8" },
  { value: "9", label: "Grade 9" },
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
  { value: "12", label: "Grade 12" },
];

/**
 * Subject picker options. Matches `Course.subject` values used in
 * the seed; extend when new subjects ship.
 */
export const MARKETPLACE_SUBJECTS: { value: string; label: string }[] = [
  { value: "math", label: "Math" },
  { value: "science", label: "Science" },
  { value: "ela", label: "ELA / Reading" },
  { value: "coding", label: "Coding" },
  { value: "spanish", label: "Spanish" },
  { value: "art", label: "Art" },
  { value: "music", label: "Music" },
];

/**
 * Price bucket options. The server translates the `value` into a
 * `priceCents` where clause in marketplace.priceWhere().
 */
export const MARKETPLACE_PRICE_BUCKETS: { value: string; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "under500", label: "Under ₹500" },
  { value: "500to2000", label: "₹500 – ₹2,000" },
  { value: "2000plus", label: "₹2,000 and up" },
];

/**
 * Course-length bucket options, keyed by total lesson count. The server
 * (`marketplace.featured`) turns the `value` into an inclusive lesson-count
 * range via `lengthRangeFor` and filters a candidate pool by it — there's no
 * length column to put in a Prisma `where`, so it's an aggregate post-filter.
 */
export const MARKETPLACE_LENGTH_BUCKETS: { value: string; label: string }[] = [
  { value: "short", label: "Short · ≤4 lessons" },
  { value: "medium", label: "Medium · 5–9" },
  { value: "long", label: "Long · 10+" },
];

/** Inclusive lesson-count range for a length-bucket slug; null = no filter. */
export function lengthRangeFor(
  slug: string | undefined
): { min: number; max: number } | null {
  switch (slug) {
    case "short":
      return { min: 1, max: 4 };
    case "medium":
      return { min: 5, max: 9 };
    case "long":
      return { min: 10, max: Number.MAX_SAFE_INTEGER };
    default:
      return null;
  }
}

/**
 * Minimum-rating bucket options, keyed by a `ratingAvg` floor. Unlike length
 * (an aggregate over units→lessons that has to be post-filtered), rating is a
 * plain `Course.ratingAvg` column — so the server folds `ratingMinFor(slug)`
 * straight into the Prisma `where` as a `{ gte }` clause, no candidate pool.
 *
 * Courses with no reviews (ratingAvg defaults to 0) fall out of every
 * threshold, which matches how Amazon/Udemy "★ & up" filters behave.
 */
export const MARKETPLACE_RATING_BUCKETS: { value: string; label: string }[] = [
  { value: "45plus", label: "4.5★ & up" },
  { value: "40plus", label: "4.0★ & up" },
  { value: "35plus", label: "3.5★ & up" },
  { value: "30plus", label: "3.0★ & up" },
];

/** Minimum `ratingAvg` for a rating-bucket slug; null = no filter. */
export function ratingMinFor(slug: string | undefined): number | null {
  switch (slug) {
    case "45plus":
      return 4.5;
    case "40plus":
      return 4;
    case "35plus":
      return 3.5;
    case "30plus":
      return 3;
    default:
      return null;
  }
}

/**
 * Sort options for the marketplace grid. The `value` maps to a Prisma
 * `orderBy` in `marketplace.featured`'s `sortOrderFor()` — that mapping
 * lives in the router (it needs Prisma types) so this file stays
 * import-light. "popular" is the default and is dropped from the URL when
 * active, so the canonical homepage URL has no `?sort=`.
 */
export const MARKETPLACE_SORTS: { value: string; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

/** The default sort slug — applied when no (or an unknown) `?sort=` is set. */
export const MARKETPLACE_DEFAULT_SORT = "popular";

/**
 * Course delivery-format options, filtering `Course.format`. Like
 * subject/grade it's a plain column, so the slug IS the stored value — no
 * translation table. `isMarketplaceFormat` guards a URL value before it
 * reaches the `where` so a junk `?format=` degrades to "no filter" rather
 * than zero results.
 */
export const MARKETPLACE_FORMAT_BUCKETS: { value: string; label: string }[] = [
  { value: "self_paced", label: "Self-paced" },
  { value: "live", label: "Live" },
  { value: "cohort", label: "Cohort-based" },
];

/** True when `value` is a known `Course.format` slug (URL guard). */
export function isMarketplaceFormat(value: string | undefined): boolean {
  return MARKETPLACE_FORMAT_BUCKETS.some((f) => f.value === value);
}

export function labelFor<T extends { value: string; label: string }>(
  items: T[],
  value: string | undefined
): string | null {
  if (!value) return null;
  return items.find((i) => i.value === value)?.label ?? null;
}
