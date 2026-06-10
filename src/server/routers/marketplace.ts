import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { completeStructured, isLlmEnabled } from "@/lib/ai/llm";
import {
  MARKETPLACE_SEARCH_SYSTEM_PROMPT,
  SearchResultSchema,
  buildDemoSearchResult,
  buildMarketplaceSearchPrompt,
} from "@/lib/ai/prompts/marketplaceSearch";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";
import {
  isMarketplaceFormat,
  lengthRangeFor,
  ratingMinFor,
} from "@/lib/marketplace";
import {
  embedText,
  isEmbeddingsEnabled,
  vectorLiteral,
} from "@/lib/ai/embeddings";

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
  // priceCents holds paise for the INR launch (both 1/100 of the major
  // unit — see lib/currency.ts). Old $-era slugs (under20/…) fall to the
  // default and degrade to "no filter" rather than zero results.
  switch (slug.toLowerCase()) {
    case "free":
      return { priceCents: 0 };
    case "under500":
      return { priceCents: { gt: 0, lt: 50_000 } };
    case "500to2000":
      return { priceCents: { gte: 50_000, lt: 200_000 } };
    case "2000plus":
      return { priceCents: { gte: 200_000 } };
    default:
      return null;
  }
}

/**
 * Translate a sort slug into a Prisma `orderBy`. Slugs come from
 * `MARKETPLACE_SORTS` in src/lib/marketplace.ts. Unknown / missing slug
 * (and the explicit "popular") fall through to the popularity default —
 * most-enrolled, with rating as the tiebreak — so a stale `?sort=` value
 * degrades to the sensible ranking rather than an error. Every branch has
 * a deterministic secondary key so pagination/order is stable.
 */
function sortOrderFor(
  slug: string | undefined
): Prisma.CourseOrderByWithRelationInput[] {
  switch (slug) {
    case "newest":
      return [{ createdAt: "desc" }, { id: "desc" }];
    case "rating":
      return [{ ratingAvg: "desc" }, { ratingCount: "desc" }];
    case "price_asc":
      return [{ priceCents: "asc" }, { enrollCount: "desc" }];
    case "price_desc":
      return [{ priceCents: "desc" }, { enrollCount: "desc" }];
    case "popular":
    default:
      return [{ enrollCount: "desc" }, { ratingAvg: "desc" }];
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
          /** Course-length bucket: "short" | "medium" | "long". */
          length: z.string().optional(),
          /** Minimum-rating bucket: "30plus" | "35plus" | "40plus" | "45plus". */
          rating: z.string().optional(),
          /** Delivery format: "self_paced" | "live" | "cohort". */
          format: z.string().optional(),
          /** Sort slug: "popular" | "newest" | "rating" | "price_asc" | "price_desc". */
          sort: z.string().optional(),
          limit: z.number().int().min(1).max(24).default(4),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const topicFragment = topicWhere(input?.topic);
      const priceFragment = priceWhere(input?.price);
      // Rating is a plain column, so it composes into `where` directly
      // (and thus applies to both the fast path and the length pool below).
      const ratingMin = ratingMinFor(input?.rating);
      // Format is a plain column too — guard the raw URL value so a stale
      // `?format=` degrades to "no filter" rather than an empty grid.
      const format =
        input?.format && isMarketplaceFormat(input.format)
          ? input.format
          : null;
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
        ...(ratingMin !== null ? { ratingAvg: { gte: ratingMin } } : {}),
        ...(format ? { format } : {}),
      };
      const limit = input?.limit ?? 4;
      const orderBy = sortOrderFor(input?.sort);
      // id is consumed by the marketplace page to cross-reference
      // course.myEnrolledIds and badge cards the student owns.
      const cardSelect = {
        id: true,
        slug: true,
        title: true,
        authorLabel: true,
        ratingAvg: true,
        ratingCount: true,
        priceCents: true,
        tag: true,
        thumbnailUrl: true,
      } satisfies Prisma.CourseSelect;

      const lengthRange = lengthRangeFor(input?.length);
      if (!lengthRange) {
        const courses = await ctx.db.course.findMany({
          where,
          orderBy,
          take: limit,
          select: cardSelect,
        });
        const total = await ctx.db.course.count({ where });
        return { courses, total };
      }

      // Length is an aggregate over units→lessons, which Prisma can't put in
      // `where`. Load a bounded candidate pool (same popularity ranking),
      // count lessons per course, keep those in the bucket, then slice to the
      // display limit. `total` reflects the filtered pool — enough for the
      // homepage strip's "N courses" hint without a denormalized column.
      const POOL_SIZE = 60;
      const pool = await ctx.db.course.findMany({
        where,
        orderBy,
        take: POOL_SIZE,
        select: {
          ...cardSelect,
          units: { select: { _count: { select: { lessons: true } } } },
        },
      });
      const matched = pool
        .map((c) => {
          const { units, ...card } = c;
          const lessonCount = units.reduce(
            (acc, u) => acc + u._count.lessons,
            0
          );
          return { card, lessonCount };
        })
        .filter(
          (m) =>
            m.lessonCount >= lengthRange.min &&
            m.lessonCount <= lengthRange.max
        );
      const courses = matched.slice(0, limit).map((m) => m.card);
      return { courses, total: matched.length };
    }),

  /**
   * The /browse catalog: every PUBLISHED course, optionally narrowed by a
   * live search string (title/tagline/description/subject/authorLabel,
   * case-insensitive substring — fast enough at catalog scale; the
   * tsvector/semantic stack stays the header combobox's job). Cursor
   * pagination with a deterministic order (id tiebreak) so pages never
   * overlap while the user scrolls.
   */
  browse: publicProcedure
    .input(
      z.object({
        q: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(48).default(24),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.CourseWhereInput = {
        status: "PUBLISHED",
        ...(input.q
          ? {
              OR: [
                { title: { contains: input.q, mode: "insensitive" } },
                { tagline: { contains: input.q, mode: "insensitive" } },
                { description: { contains: input.q, mode: "insensitive" } },
                { subject: { contains: input.q, mode: "insensitive" } },
                { authorLabel: { contains: input.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const take = input.limit;
      const rows = await ctx.db.course.findMany({
        where,
        orderBy: [
          { enrollCount: "desc" },
          { ratingAvg: "desc" },
          { id: "desc" },
        ],
        take: take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          slug: true,
          title: true,
          authorLabel: true,
          subject: true,
          grade: true,
          ratingAvg: true,
          ratingCount: true,
          priceCents: true,
          tag: true,
        },
      });
      const courses = rows.slice(0, take);
      // Cursor convention: the LAST RETURNED row's id; the next page
      // positions on it and `skip: 1` steps past it. (Pointing at the
      // first unreturned row instead would make skip:1 swallow it.)
      const nextCursor =
        rows.length > take ? courses[courses.length - 1].id : null;
      const total = await ctx.db.course.count({ where });
      return { courses, total, nextCursor };
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

  /**
   * Public teacher storefront — one teacher's profile + their published
   * course catalog. Powers the /t/[teacherId] page. Anonymous-visible:
   * a storefront is a public marketing surface.
   */
  teacherProfile: publicProcedure
    .input(z.object({ teacherId: z.string() }))
    .query(async ({ ctx, input }) => {
      const teacher = await ctx.db.user.findUnique({
        where: { id: input.teacherId },
        select: {
          id: true,
          name: true,
          firstName: true,
          avatarUrl: true,
          headline: true,
          bio: true,
          role: true,
          _count: { select: { followers: true } },
          authoredCourses: {
            where: { status: "PUBLISHED" },
            orderBy: [{ enrollCount: "desc" }, { ratingAvg: "desc" }],
            select: {
              id: true,
              slug: true,
              title: true,
              tagline: true,
              subject: true,
              grade: true,
              priceCents: true,
              ratingAvg: true,
              ratingCount: true,
              enrollCount: true,
              thumbnailUrl: true,
            },
          },
        },
      });
      // Only TEACHER accounts have a storefront — a student/admin id
      // shouldn't resolve to a profile page.
      if (!teacher || teacher.role !== "TEACHER") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const totalStudents = teacher.authoredCourses.reduce(
        (a, c) => a + c.enrollCount,
        0
      );
      return {
        id: teacher.id,
        name: teacher.name ?? teacher.firstName ?? "Teacher",
        avatarUrl: teacher.avatarUrl,
        headline: teacher.headline,
        bio: teacher.bio,
        followerCount: teacher._count.followers,
        studentsCount: totalStudents,
        courses: teacher.authoredCourses,
      };
    }),

  /**
   * Personalized recs for the homepage hero card. Returns the top
   * highest-rated published courses with their REAL title + a meta
   * line computed from the actual lesson count and total duration.
   *
   * The prototype version fetched real courses and then OVERWROTE
   * their titles with hardcoded "Master Equivalent Fractions" /
   * "Mini-game: Pizza Math" / "Project: Cookie recipe x2" strings,
   * plus fake metas ("4 lessons · 1.5 hrs"). The displayed text
   * never matched the course the link actually pointed to.
   */
  recommendedFor: publicProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      const sample = await ctx.db.course.findMany({
        where: { status: "PUBLISHED" },
        take: 3,
        orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
        select: {
          slug: true,
          title: true,
          units: {
            select: {
              lessons: { select: { durationMin: true } },
            },
          },
        },
      });
      return sample.map((c) => {
        const lessons = c.units.flatMap((u) => u.lessons);
        const lessonCount = lessons.length;
        const totalMin = lessons.reduce(
          (a, l) => a + (l.durationMin ?? 0),
          0
        );
        const meta =
          lessonCount === 0
            ? "Outline ready"
            : totalMin >= 60
            ? `${lessonCount} lesson${lessonCount === 1 ? "" : "s"} · ${(totalMin / 60).toFixed(1)} hrs`
            : `${lessonCount} lesson${lessonCount === 1 ? "" : "s"} · ${totalMin} min`;
        return {
          slug: c.slug,
          title: c.title,
          meta,
        };
      });
    }),

  /**
   * Substring search — `WHERE title|tagline|description ILIKE %q%`.
   * Kept as the fallback path for the header combobox when embeddings
   * aren't configured (no OPENAI_API_KEY). For real semantic matching
   * use `semanticSearch` below.
   */
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
      return { courses, mode: "keyword" as const };
    }),

  /**
   * Hybrid typeahead search — BM25 + vector + Reciprocal Rank Fusion.
   *
   * Pure vector search has known weaknesses: it misses exact-term
   * queries (course slugs, standard codes like "CCSS 6.EE.A", proper
   * nouns) and can confidently surface unrelated content for short
   * queries. Pure BM25 misses synonyms ("physics" → "electromagnetism").
   *
   * We run BOTH in parallel and combine via RRF:
   *   score(doc) = 1/(k + rank_bm25) + 1/(k + rank_vec)
   * with k=60 (the canonical RRF constant). A doc that appears in
   * both lists gets a fused boost; a doc that only appears in one
   * still gets credit at its individual rank.
   *
   * Fallback ladder:
   *   1. Embeddings configured  → hybrid (BM25 + vector + RRF)   [best]
   *   2. Embeddings absent      → BM25 only via ts_rank_cd       [good]
   *   3. BM25 returns 0 results → ILIKE substring                [last resort]
   *
   * `mode` in the response tells the UI which path actually ran so the
   * badge label stays honest ("Semantic" vs "Keyword").
   */
  semanticSearch: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const q = input.q.trim();
      const limit = input.limit;

      // Tunables — keep them inline rather than constants so the
      // tradeoff is visible at the call site.
      const RRF_K = 60;        // canonical RRF damping constant
      const CANDIDATE_POOL = 30; // pull this many from each ranker before fusing

      const useVectors = isEmbeddingsEnabled();
      const queryVec = useVectors ? await embedText(q) : null;
      const litStr = queryVec ? vectorLiteral(queryVec) : null;

      // BM25-ranked candidates via Postgres FTS. plainto_tsquery is
      // forgiving with messy user input (handles word boundaries,
      // stopwords). The `@@` predicate uses the GIN expression index
      // we added in 20260527140000_widen_course_fts_to_subject_grade.
      //
      // CRITICAL: the to_tsvector expression here MUST match the
      // expression baked into Course_fts_idx exactly, or Postgres
      // planner won't use the index and falls back to a seqscan.
      // Includes subject + grade so a query like "math" matches every
      // course with subject="math", not just those with the word
      // "math" in their title/tagline/description.
      const bm25Rows = await ctx.db.$queryRaw<
        Array<{ id: string; rank: number; bm25_score: number }>
      >(Prisma.sql`
        WITH ranked AS (
          SELECT
            "id",
            ts_rank_cd(
              to_tsvector(
                'english',
                coalesce("title", '') || ' ' ||
                coalesce("tagline", '') || ' ' ||
                coalesce("description", '') || ' ' ||
                "subject" || ' ' ||
                "grade"
              ),
              plainto_tsquery('english', ${q})
            ) AS bm25_score
          FROM "Course"
          WHERE "status" = 'PUBLISHED'
            AND to_tsvector(
                  'english',
                  coalesce("title", '') || ' ' ||
                  coalesce("tagline", '') || ' ' ||
                  coalesce("description", '') || ' ' ||
                  "subject" || ' ' ||
                  "grade"
                ) @@ plainto_tsquery('english', ${q})
        )
        SELECT
          "id",
          bm25_score,
          ROW_NUMBER() OVER (ORDER BY bm25_score DESC) AS rank
        FROM ranked
        ORDER BY bm25_score DESC
        LIMIT ${CANDIDATE_POOL}
      `);

      // Vector-ranked candidates via pgvector. Only runs if we have an
      // embedded query — if litStr is null, the candidate pool is empty
      // and RRF falls back to BM25-only ranking.
      const vecRows = litStr
        ? await ctx.db.$queryRaw<
            Array<{ id: string; rank: number; distance: number }>
          >(Prisma.sql`
            SELECT
              "id",
              ("embedding" <=> ${litStr}::vector) AS distance,
              ROW_NUMBER() OVER (ORDER BY "embedding" <=> ${litStr}::vector) AS rank
            FROM "Course"
            WHERE "status" = 'PUBLISHED'
              AND "embedding" IS NOT NULL
              AND ("embedding" <=> ${litStr}::vector) < 0.6
            ORDER BY "embedding" <=> ${litStr}::vector
            LIMIT ${CANDIDATE_POOL}
          `)
        : [];

      // Build RRF score map. A course id missing from one list just
      // doesn't contribute that term, so it ranks below courses that
      // appear in both — exactly what we want from fusion.
      const rrf = new Map<string, { score: number; bm25?: number; vec?: number }>();
      for (const r of bm25Rows) {
        const e = rrf.get(r.id) ?? { score: 0 };
        e.score += 1 / (RRF_K + Number(r.rank));
        e.bm25 = Number(r.rank);
        rrf.set(r.id, e);
      }
      for (const r of vecRows) {
        const e = rrf.get(r.id) ?? { score: 0 };
        e.score += 1 / (RRF_K + Number(r.rank));
        e.vec = Number(r.rank);
        rrf.set(r.id, e);
      }

      const sortedIds = Array.from(rrf.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, limit)
        .map(([id]) => id);

      // No matches from either ranker. Last-resort ILIKE so the header
      // combobox always has SOMETHING for the user (e.g., when a query
      // hits no full-text matches but contains a substring of a title).
      if (sortedIds.length === 0) {
        const fallback = await ctx.db.course.findMany({
          where: {
            status: "PUBLISHED",
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { tagline: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { slug: true, title: true, authorLabel: true, tag: true, ratingAvg: true },
        });
        return {
          courses: fallback.map((c) => ({
            ...c,
            similarity: null,
            rrfScore: null,
          })),
          mode: "keyword" as const,
        };
      }

      // Hydrate the ranked id list. We do this in one query and then
      // re-sort client-side so the RRF ordering is preserved — Prisma
      // doesn't support ORDER BY id-list natively.
      const rows = await ctx.db.course.findMany({
        where: { id: { in: sortedIds } },
        select: {
          id: true,
          slug: true,
          title: true,
          authorLabel: true,
          tag: true,
          ratingAvg: true,
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = sortedIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => {
          const meta = rrf.get(r.id)!;
          return {
            slug: r.slug,
            title: r.title,
            authorLabel: r.authorLabel,
            tag: r.tag,
            ratingAvg: r.ratingAvg,
            rrfScore: meta.score,
            // Approximate similarity for UI: prefer vector distance if
            // available (interpretable as cosine sim), else fall back to
            // a normalized BM25 rank position.
            similarity:
              meta.vec !== undefined
                ? 1 - (vecRows.find((v) => v.id === r.id)?.distance ?? 0.5)
                : meta.bm25 !== undefined
                ? Math.max(0, 1 - meta.bm25 / CANDIDATE_POOL)
                : null,
          };
        });

      // Mode reporting: if the vector ranker contributed any rows, call
      // it "semantic" (the BM25 lift is fine but the headline benefit is
      // the synonym matching). Otherwise it's pure BM25 / keyword.
      const mode: "semantic" | "keyword" =
        vecRows.length > 0 ? "semantic" : "keyword";

      return { courses: ordered, mode };
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
        mode: "openai" | "claude" | "demo" | "fallback"
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

      if (!isLlmEnabled()) {
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

      try {
        // Model-safe structured output: completeStructured inlines the
        // JSON schema into the prompt for Claude (works on every model +
        // account tier) and uses OpenAI's response_format when an OpenAI
        // key is set. The old raw `output_config.format` call 400'd on
        // the default claude-sonnet-4-5 ("structured outputs not
        // supported on this model"), silently dropping every AI search
        // to the keyword fallback below.
        const { data, mode } = await completeStructured({
          schema: SearchResultSchema,
          system: MARKETPLACE_SEARCH_SYSTEM_PROMPT,
          prompt: buildMarketplaceSearchPrompt({
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
          maxTokens: 1024,
        });
        await writeAudit(data, mode);
        return { result: data, elapsedMs: Date.now() - t0 };
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
