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
  { value: "under20", label: "Under $20" },
  { value: "20to50", label: "$20 – $50" },
  { value: "50plus", label: "$50 and up" },
];

export function labelFor<T extends { value: string; label: string }>(
  items: T[],
  value: string | undefined
): string | null {
  if (!value) return null;
  return items.find((i) => i.value === value)?.label ?? null;
}
