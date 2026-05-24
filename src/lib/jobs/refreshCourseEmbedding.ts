import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  courseEmbedText,
  embedText,
  isEmbeddingsEnabled,
  vectorLiteral,
} from "@/lib/ai/embeddings";

/**
 * Compute + persist the embedding for one course. Called fire-and-forget
 * from course create / update / publish hooks so the embedding stays
 * fresh on every catalog change without blocking the user's response.
 *
 * Safe to invoke when OPENAI_API_KEY isn't configured — it returns
 * early without touching the row. Errors are logged but not thrown:
 * a transient OpenAI failure should not roll back the user's course
 * save, and `marketplace.semanticSearch` already filters out unembedded
 * rows so a stale/null embedding just degrades to "won't appear in
 * semantic results until the next refresh."
 *
 * @returns true if the embedding was written, false if skipped/failed.
 */
export async function refreshCourseEmbedding(
  courseId: string
): Promise<boolean> {
  if (!isEmbeddingsEnabled()) return false;
  try {
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        tagline: true,
        description: true,
        subject: true,
        grade: true,
      },
    });
    if (!course) return false;

    const vec = await embedText(courseEmbedText(course));
    if (!vec) return false;
    const lit = vectorLiteral(vec);

    // Prisma can't update Unsupported columns through the standard
    // .update() API, so we go raw. ::vector cast is required —
    // pgvector won't auto-cast a text literal.
    await db.$executeRaw`
      UPDATE "Course"
      SET "embedding" = ${lit}::vector
      WHERE "id" = ${courseId}
    `;
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refreshCourseEmbedding] failed", { courseId, msg });
    return false;
  }
}

// Re-export Prisma so callers (e.g., the backfill script) can build
// queries with the same instance. Prevents the rare bug where two
// different `Prisma` instances disagree on Decimal/Json types.
export { Prisma };
