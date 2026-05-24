/**
 * One-shot backfill: embed every course that doesn't have an embedding
 * yet. Run once after the pgvector migration lands; afterwards the
 * create/update hooks keep embeddings fresh on their own.
 *
 *   npm run embed:backfill            # embeds unembedded rows only
 *   npm run embed:backfill -- --force # re-embeds every PUBLISHED course
 *
 * Cost ballpark on text-embedding-3-small:
 *   ~$0.02 per 1M tokens × ~200 tokens per course ≈ $0.000004 / course
 *   A 10,000-course catalog backfills for ~$0.04 total.
 *
 * The script runs serially with a small sleep between rows so a long
 * backfill doesn't trip OpenAI's rate limits or flood the DB.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import {
  courseEmbedText,
  embedText,
  isEmbeddingsEnabled,
  vectorLiteral,
} from "../src/lib/ai/embeddings";

const SLEEP_MS = 150; // ~7 req/s, well under OpenAI's tier-1 limits

async function main() {
  if (!isEmbeddingsEnabled()) {
    console.error(
      "OPENAI_API_KEY not set — backfill needs it to call the embeddings API."
    );
    process.exit(1);
  }
  const force = process.argv.includes("--force");

  // Pull just the fields we need for the embed text + the id to write
  // back to. We deliberately don't `findMany({ where: { embedding: null }})`
  // because Prisma can't filter on Unsupported columns — instead we
  // pull every published course and check via raw SQL whether it's
  // already embedded (when not in --force mode).
  const courses = await db.course.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      description: true,
      subject: true,
      grade: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let alreadyEmbedded = 0;
  let embedded = 0;
  let failed = 0;

  for (const c of courses) {
    if (!force) {
      // Check whether this row already has an embedding. Cheap probe.
      const probe = await db.$queryRaw<Array<{ has: boolean }>>`
        SELECT ("embedding" IS NOT NULL) AS "has"
        FROM "Course" WHERE "id" = ${c.id}
      `;
      if (probe[0]?.has) {
        alreadyEmbedded += 1;
        continue;
      }
    }

    try {
      const vec = await embedText(courseEmbedText(c));
      if (!vec) {
        failed += 1;
        console.warn(`[skip] ${c.slug}: embedText returned null`);
        continue;
      }
      const lit = vectorLiteral(vec);
      await db.$executeRaw`
        UPDATE "Course"
        SET "embedding" = ${lit}::vector
        WHERE "id" = ${c.id}
      `;
      embedded += 1;
      console.log(`[ok]   ${c.slug}`);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[fail] ${c.slug}: ${msg}`);
    }

    if (SLEEP_MS > 0) {
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }
  }

  console.log(
    `\nDone. embedded=${embedded}  alreadyEmbedded=${alreadyEmbedded}  failed=${failed}  total=${courses.length}`
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
