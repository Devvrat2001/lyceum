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
