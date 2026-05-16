import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import {
  CLAUDE_MODEL,
  getClaude,
  isClaudeEnabled,
} from "@/lib/ai/claude";
import {
  MARKETPLACE_SEARCH_SYSTEM_PROMPT,
  SearchResultSchema,
  buildDemoSearchResult,
  buildMarketplaceSearchPrompt,
} from "@/lib/ai/prompts/marketplaceSearch";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";

/**
 * Translate a topic chip slug into a Prisma `where` fragment that
 * intersects with the caller's existing course filter. Returns `null`
 * for an unknown slug (caller treats this as "no extra filter" rather
 * than zero results, so a stale URL doesn't yield an empty page).
 *
 * Slugs come from `MARKETPLACE_TOPICS` in src/lib/marketplace.ts.
 * Most match a subject; a couple match by title keyword.
 *
 * Title-keyword matches use `contains` + `mode: "insensitive"` which
 * is fine at our scale; if the catalog grows to >10k courses, swap
 * for the existing tsvector search infrastructure.
 */
function topicWhere(slug: string | undefined): Prisma.CourseWhereInput | null {
  if (!slug) return null;
  switch (slug.toLowerCase()) {
    case "stem":
      return { subject: { in: ["math", "science"] } };
    case "reading":
      return { subject: "ela" };
    case "coding":
      return { subject: "coding" };
    case "science-fair":
      return { subject: "science" };
    case "test-prep":
      return {
        OR: [
          { title: { contains: "olympiad", mode: "insensitive" } },
          { title: { contains: "prep", mode: "insensitive" } },
        ],
      };
    case "spanish":
      return { subject: "spanish" };
    case "art":
      return { subject: "art" };
    case "music":
      return { subject: "music" };
    default:
      return null;
  }
}

/**
 * Translate a price-bucket slug into a Prisma `where` fragment on
 * `priceCents`. Slugs come from `MARKETPLACE_PRICE_BUCKETS` in
 * src/lib/marketplace.ts. Unknown slug → null (treated as no filter).
 */
function priceWhere(slug: string | undefined): Prisma.CourseWhereInput | null {
  if (!slug) return null;
  switch (slug.toLowerCase()) {
    case "free":
      return { priceCents: 0 };
    case "under20":
      return { priceCents: { gt: 0, lt: 2000 } };
    case "20to50":
      return { priceCents: { gte: 2000, lt: 5000 } };
    case "50plus":
      return { priceCents: { gte: 5000 } };
    default:
      return null;
  }
}

export const marketplaceRouter = router({
  /** Featured course cards (top picks). */
  featured: publicProcedure
    .input(
      z
        .object({
          subject: z.string().optional(),
          grade: z.string().optional(),
          topic: z.string().optional(),
          /** One of: "free" | "under20" | "20to50" | "50plus" */
          price: z.string().optional(),
          limit: z.number().int().min(1).max(24).default(4),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const topicFragment = topicWhere(input?.topic);
      const priceFragment = priceWhere(input?.price);
      // Topic chips override the subject hint — if you've picked
      // "Reading" you want ELA courses regardless of what the page's
      // default subject was. The `grade` hint stays as a soft filter.
      const where: Prisma.CourseWhereInput = {
        status: "PUBLISHED",
        ...(topicFragment
          ? topicFragment
          : input?.subject
            ? { subject: input.subject }
            : {}),
        ...(input?.grade ? { grade: input.grade } : {}),
        ...(priceFragment ?? {}),
      };
      const courses = await ctx.db.course.findMany({
        where,
        orderBy: [{ enrollCount: "desc" }, { ratingAvg: "desc" }],
        take: input?.limit ?? 4,
        select: {
          slug: true,
          title: true,
          authorLabel: true,
          ratingAvg: true,
          ratingCount: true,
          priceCents: true,
          tag: true,
          thumbnailUrl: true,
        },
      });
      const total = await ctx.db.course.count({ where });
      return { courses, total };
    }),

  /** Multi-course curriculum bundles. */
  paths: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.path.findMany({
      orderBy: { title: "asc" },
      include: {
        courses: { include: { course: { select: { id: true } } } },
      },
    });
  }),

  /** Top teachers (by follower count → fall back to course count). */
  teachers: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(4) }).optional())
    .query(async ({ ctx, input }) => {
      const teachers = await ctx.db.user.findMany({
        where: {
          role: "TEACHER",
          authoredCourses: { some: { status: "PUBLISHED" } },
        },
        take: input?.limit ?? 4,
        select: {
          id: true,
          name: true,
          firstName: true,
          _count: { select: { authoredCourses: true, followers: true } },
          authoredCourses: {
            where: { status: "PUBLISHED" },
            select: { subject: true, enrollCount: true },
          },
        },
      });
      return teachers.map((t) => {
        const totalStudents = t.authoredCourses.reduce(
          (a, c) => a + c.enrollCount,
          0
        );
        const subjects = Array.from(
          new Set(t.authoredCourses.map((c) => c.subject))
        );
        return {
          id: t.id,
          name: t.name ?? t.firstName ?? "Teacher",
          subjectsLabel:
            subjects.length === 1
              ? subjects[0]
              : subjects.length > 1
              ? `${subjects.length} subjects`
              : "—",
          studentsCount: totalStudents,
          courseCount: t._count.authoredCourses,
          followerCount: t._count.followers,
        };
      });
    }),

  /** Personalized recs for the hero card. Phase-1 stub: return next-up enrolled lessons. */
  recommendedFor: publicProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Phase-1: deterministic seed-based recs.
      const sample = await ctx.db.course.findMany({
        where: { status: "PUBLISHED" },
        take: 3,
        orderBy: { ratingAvg: "desc" },
        select: { slug: true, title: true, units: { select: { estLabel: true } } },
      });
      return sample.map((c, i) => ({
        slug: c.slug,
        title:
          i === 0
            ? "Master Equivalent Fractions"
            : i === 1
            ? "Mini-game: Pizza Math"
            : "Project: Cookie recipe x2",
        meta:
          i === 0
            ? "4 lessons · 1.5 hrs"
            : i === 1
            ? "15 min · interactive"
            : "40 min · real-world",
      }));
    }),

  /** Simple ILIKE search; pgvector replaces this in Phase 2. */
  search: publicProcedure
    .input(z.object({ q: z.string().min(1).max(120), limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      const courses = await ctx.db.course.findMany({
        where: {
          status: "PUBLISHED",
          OR: [
            { title: { contains: input.q, mode: "insensitive" } },
            { description: { contains: input.q, mode: "insensitive" } },
            { tagline: { contains: input.q, mode: "insensitive" } },
          ],
        },
        take: input.limit,
        select: { slug: true, title: true, authorLabel: true, tag: true, ratingAvg: true },
      });
      return { courses };
    }),

  /**
   * AI marketplace search: conversational learning-goal query → curated path.
   *
   * Falls back to keyword scoring when ANTHROPIC_API_KEY is unset.
   * Public (anyone can search before signing in).
   */
  aiSearch: publicProcedure
    .input(
      z.object({
        query: z.string().min(3).max(400),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.session?.user?.id ?? null });
      const t0 = Date.now();

      // Catalog snapshot. Cap to keep the prompt small + the demo
      // matcher fast.
      const courses = await ctx.db.course.findMany({
        where: { status: "PUBLISHED" },
        take: 40,
        orderBy: { enrollCount: "desc" },
        select: {
          slug: true,
          title: true,
          subject: true,
          grade: true,
          tagline: true,
        },
      });

      const writeAudit = async (
        result: ReturnType<typeof buildDemoSearchResult>,
        mode: "claude" | "demo" | "fallback"
      ) => {
        await audit({
          actorId: ctx.session?.user?.id ?? null,
          kind: "ai.marketplace_search",
          payload: {
            queryChars: input.query.length,
            itemCount: result.items.length,
            kinds: result.items.map((i) => i.kind),
            mode,
            elapsedMs: Date.now() - t0,
          },
        });
      };

      if (!isClaudeEnabled()) {
        const result = buildDemoSearchResult({
          query: input.query,
          courses,
        });
        await writeAudit(result, "demo");
        return { result, elapsedMs: Date.now() - t0 };
      }

      const lessons = await ctx.db.lesson.findMany({
        where: {
          slug: { not: null },
          unit: { course: { status: "PUBLISHED" } },
        },
        take: 60,
        select: {
          slug: true,
          title: true,
          unit: { select: { course: { select: { title: true } } } },
        },
      });

      const client = getClaude()!;
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["summary", "estTimeLabel", "items"],
        properties: {
          summary: { type: "string" },
          estTimeLabel: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "title", "why"],
              properties: {
                kind: { type: "string", enum: ["course", "lesson", "tip"] },
                slug: { type: "string" },
                title: { type: "string" },
                why: { type: "string" },
              },
            },
          },
        },
      };

      try {
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: MARKETPLACE_SEARCH_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildMarketplaceSearchPrompt({
                query: input.query,
                studentLabel: ctx.session?.user
                  ? `Signed-in user · role=${ctx.session.user.role}`
                  : "Anonymous visitor",
                catalog: {
                  courses,
                  lessons: lessons.map((l) => ({
                    slug: l.slug!,
                    title: l.title,
                    courseTitle: l.unit.course.title,
                  })),
                },
              }),
            },
          ],
          output_config: { format: { type: "json_schema", schema } },
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const parsed = SearchResultSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `AI returned invalid search: ${parsed.error.message}`,
          });
        }
        await writeAudit(parsed.data, "claude");
        return { result: parsed.data, elapsedMs: Date.now() - t0 };
      } catch (err) {
        // Soft-degrade to the demo path so the user always gets *something*.
        console.error("[marketplace.aiSearch]", err);
        const fallback = buildDemoSearchResult({ query: input.query, courses });
        await writeAudit(fallback, "fallback");
        return {
          result: fallback,
          elapsedMs: Date.now() - t0,
        };
      }
    }),
});
