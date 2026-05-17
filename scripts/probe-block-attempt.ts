/**
 * Probe: verify the polymorphic Attempt migration.
 *
 * Picks an MCQ block from the seeded multiplying-fractions lesson,
 * writes a test Attempt with `blockId` set (questionId null), reads
 * it back, then cleans up. Run with `npm exec tsx --
 * scripts/probe-block-attempt.ts`.
 *
 * No tRPC import — that pulls in 'server-only' which tsx can't load.
 */

import { db } from "../src/lib/db";

async function main() {
  // Find any MCQ block.
  const block = await db.block.findFirst({
    where: { type: "MCQ" },
    include: { lesson: { select: { id: true, slug: true, title: true } } },
  });
  if (!block) {
    throw new Error("No MCQ block found — seed first.");
  }
  console.log(
    `Found MCQ block ${block.id} on lesson ${block.lesson.slug} (${block.lesson.title})`
  );

  const settings = (block.settings ?? {}) as Record<string, unknown>;
  const options = Array.isArray(settings.options) ? settings.options : [];
  console.log(`  block has ${options.length} options`);

  // Find any user.
  const user = await db.user.findFirst({ where: { role: "STUDENT" } });
  if (!user) {
    throw new Error("No STUDENT user found — seed first.");
  }
  console.log(`Using user ${user.email} (${user.id})`);

  // Write a test attempt — blockId set, questionId null.
  const attempt = await db.attempt.create({
    data: {
      userId: user.id,
      lessonId: block.lessonId,
      blockId: block.id,
      chosenKey: "0",
      correct: false,
      hintsUsed: 0,
      timeMs: 1234,
    },
  });
  console.log(`Wrote Attempt ${attempt.id} (blockId=${attempt.blockId}, questionId=${attempt.questionId})`);

  // Read it back via the [blockId, createdAt] index path.
  const readBack = await db.attempt.findFirst({
    where: { blockId: block.id, userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  console.log(
    `Read back: id=${readBack?.id} blockId=${readBack?.blockId} questionId=${readBack?.questionId} timeMs=${readBack?.timeMs}`
  );

  if (readBack?.id !== attempt.id) {
    throw new Error("Round-trip failed: read-back id != written id");
  }
  if (readBack.blockId !== block.id) {
    throw new Error("Round-trip failed: blockId not persisted");
  }
  if (readBack.questionId !== null) {
    throw new Error("Round-trip failed: questionId should be null");
  }

  // Clean up.
  await db.attempt.delete({ where: { id: attempt.id } });
  console.log("Cleaned up test attempt.");

  console.log("\n✓ Probe passed — polymorphic Attempt is live.");
}

main()
  .catch((err) => {
    console.error("✗ Probe failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
