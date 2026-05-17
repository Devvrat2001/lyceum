/**
 * Idempotently add SLIDES + PDF + SECTION sample blocks to the
 * `multiplying-fractions` demo lesson so the new readers have
 * something to render in browser without needing to author blocks
 * by hand in the teacher UI first.
 *
 * Run via:
 *   npx tsx --env-file=.env.local --env-file=.env scripts/seed-sample-blocks.ts
 *
 * Idempotency: we check if the lesson already has a block of each
 * type with our marker label, and skip when present. Safe to re-run.
 */
import type { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";

const LESSON_SLUG = "multiplying-fractions";
const MARKER_LABEL = "seed:sample-block-v1";

type Seed = {
  type: "SLIDES" | "PDF" | "SECTION" | "POLL" | "DISCUSSION";
  // Prisma's Json input rejects loose Record<string, unknown> because
  // values could be undefined/functions. InputJsonObject keeps us
  // honest while staying flexible per-type.
  settings: Prisma.InputJsonObject;
};

const SAMPLES: Seed[] = [
  {
    type: "SECTION",
    settings: {
      label: MARKER_LABEL,
      title: "Part 2 — Visual models",
      subtitle:
        "Now we'll see what multiplying fractions looks like as area and as repeated addition.",
    },
  },
  {
    type: "SLIDES",
    settings: {
      label: MARKER_LABEL,
      // A public Google Slides deck (Google's own example deck) — the
      // reader normalizes /edit URLs to /embed.
      url: "https://docs.google.com/presentation/d/1d_dZbjK02nLAlS68I7QlsoZNa6JTpA0g/edit",
      caption:
        "Step-by-step walkthrough of fraction × whole-number using area models.",
    },
  },
  {
    type: "PDF",
    settings: {
      label: MARKER_LABEL,
      // A small public-domain PDF (W3C dummy doc) — works as an
      // embed in browsers that support PDF iframes.
      url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      caption: "Worked-example handout (1 page) — print or download.",
    },
  },
  {
    type: "POLL",
    settings: {
      label: MARKER_LABEL,
      stem: "Which approach feels clearer for ⅓ × 6 in your head?",
      options: [
        "Repeated addition: ⅓ + ⅓ + ⅓ + ⅓ + ⅓ + ⅓",
        "Split the whole into thirds, then take one third of 6",
        "Multiply numerators then divide: (1 × 6) ÷ 3",
      ],
    },
  },
  {
    type: "DISCUSSION",
    settings: {
      label: MARKER_LABEL,
      prompt:
        "Share one place where you still need a model or a worked example. What kind of help would unstick you?",
    },
  },
];

async function main() {
  const lesson = await db.lesson.findUnique({
    where: { slug: LESSON_SLUG },
    select: { id: true, title: true },
  });
  if (!lesson) {
    console.error(`Lesson '${LESSON_SLUG}' not found — seed the DB first.`);
    process.exit(1);
  }

  const existing = await db.block.findMany({
    where: { lessonId: lesson.id },
    select: { id: true, type: true, order: true, settings: true },
    orderBy: { order: "asc" },
  });

  const maxOrder = existing.reduce((m, b) => Math.max(m, b.order), 0);

  let nextOrder = maxOrder + 1;
  let added = 0;
  let skipped = 0;

  for (const sample of SAMPLES) {
    const hasMarker = existing.some(
      (b) =>
        b.type === sample.type &&
        typeof (b.settings as Record<string, unknown>)?.label === "string" &&
        (b.settings as Record<string, unknown>).label === MARKER_LABEL
    );
    if (hasMarker) {
      console.log(`  skip ${sample.type} (already seeded)`);
      skipped += 1;
      continue;
    }
    const created = await db.block.create({
      data: {
        lessonId: lesson.id,
        type: sample.type,
        order: nextOrder,
        settings: sample.settings,
      },
    });
    console.log(
      `  add  ${sample.type.padEnd(7)} order=${nextOrder} id=${created.id}`
    );
    nextOrder += 1;
    added += 1;
  }

  console.log(
    `\nDone on '${lesson.title}' — ${added} added, ${skipped} skipped.`
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
