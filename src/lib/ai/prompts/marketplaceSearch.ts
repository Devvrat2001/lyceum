import { z } from "zod";

/** One curated item in an AI-search result. */
export const SearchItemSchema = z.object({
  kind: z.enum(["course", "lesson", "tip"]).describe("Type of recommendation."),
  /** For courses/lessons we render as a link using this slug. */
  slug: z
    .string()
    .nullish()
    .describe(
      "Course or lesson slug from the provided catalog. Required for kind=course|lesson. Null for kind=tip."
    ),
  title: z.string().describe("Short display title (3-10 words)."),
  why: z
    .string()
    .describe(
      "One sentence explaining why this helps the student's stated goal."
    ),
});

export const SearchResultSchema = z.object({
  summary: z
    .string()
    .describe(
      "1-2 sentence summary directly addressing the student's goal. Friendly, K-12 voice."
    ),
  estTimeLabel: z
    .string()
    .describe(
      "Quick estimate of how long the curated path takes, e.g. '~2 hours over 4 days'."
    ),
  items: z.array(SearchItemSchema).min(2).max(6),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchItem = z.infer<typeof SearchItemSchema>;

export const MARKETPLACE_SEARCH_SYSTEM_PROMPT = `You are the Lyceum AI study buddy.
A K-12 student types what they want to learn or accomplish. Curate a
short learning path from the catalog you've been given.

Rules:

1. Only reference courses or lessons by their EXACT slug from the
   catalog. Never invent slugs.
2. Pick 3-5 items. Order them: warm-up → core skill → practice → stretch.
3. For each item, the "why" is one sentence in plain English from the
   student's perspective ("This walks through…", "Practice with…").
4. If nothing in the catalog matches, return 0-2 "tip" items with
   no slug — practical study advice in 1 sentence each. Be honest:
   "We don't have that on Lyceum yet, but here's how to think about it."
5. Stay friendly and short. No emoji. No markdown.
6. The summary names the goal back to the student ("To prep for your
   fractions test…") then teases the path ("…start with X, then Y.").`;

export function buildMarketplaceSearchPrompt(args: {
  query: string;
  studentLabel: string;
  catalog: {
    courses: Array<{
      slug: string;
      title: string;
      subject: string;
      grade: string;
      tagline?: string | null;
    }>;
    lessons: Array<{
      slug: string;
      title: string;
      courseTitle: string;
    }>;
  };
}): string {
  const { query, studentLabel, catalog } = args;
  return `Student profile: ${studentLabel}
Student's question: "${query.trim()}"

Catalog of available courses:
${catalog.courses
  .map(
    (c) =>
      `- slug=${c.slug}  · ${c.title}  (${c.subject} · Grade ${c.grade})${
        c.tagline ? `  — ${c.tagline}` : ""
      }`
  )
  .join("\n")}

Catalog of available lessons:
${catalog.lessons.map((l) => `- slug=${l.slug}  · ${l.title}  (in ${l.courseTitle})`).join("\n")}

Produce a curated learning path that matches the SearchResult schema you have.
Pick items from the catalog above; do not invent slugs.`;
}

/** Demo fallback. Keyword-matches the query against course titles. */
export function buildDemoSearchResult(args: {
  query: string;
  courses: Array<{
    slug: string;
    title: string;
    subject: string;
    tagline?: string | null;
  }>;
}): SearchResult {
  const q = args.query.toLowerCase();
  const tokens = q.split(/[\s,.!?]+/).filter((t) => t.length > 2);
  const scored = args.courses
    .map((c) => {
      const hay = `${c.title} ${c.subject} ${c.tagline ?? ""}`.toLowerCase();
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += 1;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return {
      summary:
        "I don't see an exact match on Lyceum yet, but here are two ways to make progress on your own.",
      estTimeLabel: "~30 min today",
      items: [
        {
          kind: "tip" as const,
          slug: null,
          title: "Break the goal into 2-3 smaller skills.",
          why: "Naming the steps makes it easier to find practice for each one.",
        },
        {
          kind: "tip" as const,
          slug: null,
          title: "Ask your AI tutor for a 5-question warm-up.",
          why: "Spotting where you actually get stuck saves time vs. studying everything.",
        },
      ],
    };
  }

  return {
    summary: `To work on "${args.query
      .trim()
      .slice(0, 60)}", I'd start with ${scored[0].c.title.toLowerCase()}, then add the practice quiz.`,
    estTimeLabel: `~${scored.length * 45} min over ${scored.length} days`,
    items: scored.map((s, i) => ({
      kind: "course" as const,
      slug: s.c.slug,
      title: s.c.title,
      why:
        i === 0
          ? "Start here for the core ideas."
          : i === 1
          ? "Layer this on once the first one feels comfortable."
          : "Then stretch with this for the trickier problems.",
    })),
  };
}
