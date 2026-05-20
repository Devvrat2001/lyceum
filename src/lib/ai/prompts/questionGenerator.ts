import { z } from "zod";

export const GeneratedAnswerSchema = z.object({
  key: z.enum(["A", "B", "C", "D"]),
  text: z.string().describe("Short answer text, no leading 'A.' or numbering."),
  correct: z.boolean(),
});

export const GeneratedQuestionSchema = z.object({
  stem: z
    .string()
    .describe(
      "Full question prompt. Concrete, no leading 'Q1:' or numbering."
    ),
  difficulty: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe(
      "1 (intro) to 5 (advanced). Distribute the count across this range."
    ),
  answers: z
    .array(GeneratedAnswerSchema)
    .length(4)
    .describe("Exactly four MCQ answers. Exactly ONE has correct=true."),
  hint: z
    .string()
    .nullish()
    .describe(
      "A short hint that points without giving the answer away. Optional but encouraged."
    ),
});

export const QuestionBatchSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1).max(10),
});

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const QUESTION_GENERATOR_SYSTEM_PROMPT = `You are an AI item-writer
for the Lyceum K-12 platform. You generate multiple-choice quiz
questions that match a lesson's content and difficulty curve.

Rules:

1. Every question is multiple choice with exactly 4 answers (A, B, C, D)
   and exactly ONE marked correct.
2. The distractors should be plausible to a student who almost got it.
   Avoid obviously wrong answers, especially silly numbers.
3. Vary difficulty across the batch (mix of 2/3/4 mostly; 1 and 5 only
   if requested).
4. Stay on the lesson's stated topic. No off-topic trick questions.
5. K-12 appropriate. Real-world examples a kid would recognize.
6. Plain text only — no markdown, no LaTeX. Use Unicode for math
   (½, ⅓, ², ×, ÷). Equations as "3 × 4 = 12", never LaTeX.
7. Optional hints should point at the relevant concept without giving
   away the chosen letter.`;

/** Pre-regeneration signal: a previous batch's question that students
 *  collectively struggled with. The new batch should target the same
 *  underlying concept with a different surface form. */
export type WeakSpot = {
  stem: string;
  /** Fraction in [0,1]. */
  pctCorrect: number;
  /** Number of attempts used to compute pctCorrect. */
  sampleSize: number;
};

export function buildQuestionGenPrompt(args: {
  lessonTitle: string;
  courseTitle: string;
  existingStems: string[];
  count: number;
  /** When provided (adaptive regenerate path), the model is told to
   *  target the same underlying concepts as these weak items. Skip
   *  when no prior attempts exist. */
  weakSpots?: WeakSpot[];
}): string {
  const { lessonTitle, courseTitle, existingStems, count, weakSpots } = args;
  const weakSpotsBlock =
    weakSpots && weakSpots.length > 0
      ? `

STUDENT PERFORMANCE — PREVIOUS BATCH:
${weakSpots
  .map(
    (w) =>
      `- "${w.stem}" — only ${Math.round(w.pctCorrect * 100)}% correct (n=${w.sampleSize})`
  )
  .join("\n")}

Students collectively struggled with the items above. For the new batch:
- Cover the same underlying concept as each weak item.
- Use a DIFFERENT surface form (different wording, different numbers,
  different real-world setup) so students can't just memorize answers.
- Do not repeat the exact stems above.
- Keep the difficulty within ±1 of the original weak item.`
      : "";

  return `Course: ${courseTitle}
Lesson: ${lessonTitle}

Existing questions in this lesson (avoid duplicates):
${
  existingStems.length === 0
    ? "(none yet)"
    : existingStems.map((s, i) => `${i + 1}. ${s}`).join("\n")
}${weakSpotsBlock}

Generate ${count} new multiple-choice questions that match the
QuestionBatch schema. Distribute difficulty 2/3/4. One hint per
question if helpful.`;
}

/** Minimum attempts on a question before we trust the % correct
 *  signal enough to call it "weak". A 0/1 = 0% is just noise. */
export const WEAK_SPOT_MIN_SAMPLE_SIZE = 3;
/** Questions with pctCorrect strictly below this are flagged weak. */
export const WEAK_SPOT_THRESHOLD = 0.6;

/**
 * Pure function: derive per-question weak-spot stats from the prior
 * batch's questions + raw Attempt rows for this block.
 *
 * Inputs:
 * - `previousQuestions` is `Block.settings.generated.questions` from
 *   the prior generate (in order — index is the subIndex).
 * - `attempts` is every `Attempt` row for this block with the Tier 1.2
 *   `"subIdx:choiceIdx"` chosenKey encoding. Rows with malformed
 *   chosenKey are skipped.
 *
 * Returns weak spots in the same order as previousQuestions, filtered
 * by sampleSize ≥ MIN and pctCorrect < THRESHOLD. Empty array when no
 * questions hit the bar.
 */
export function computeWeakSpots(
  previousQuestions: Array<{ stem: string }>,
  // chosenKey is nullable on Attempt for legacy reasons (Question-based
  // attempts used the column differently). Skip null rows alongside
  // malformed ones.
  attempts: Array<{ chosenKey: string | null; correct: boolean }>
): WeakSpot[] {
  const bySubIdx = new Map<number, { total: number; correct: number }>();
  for (const a of attempts) {
    if (a.chosenKey === null) continue;
    const colon = a.chosenKey.indexOf(":");
    if (colon < 0) continue;
    const subIdx = parseInt(a.chosenKey.slice(0, colon), 10);
    if (!Number.isFinite(subIdx) || subIdx < 0) continue;
    const slot = bySubIdx.get(subIdx) ?? { total: 0, correct: 0 };
    slot.total += 1;
    if (a.correct) slot.correct += 1;
    bySubIdx.set(subIdx, slot);
  }

  const out: WeakSpot[] = [];
  for (let i = 0; i < previousQuestions.length; i++) {
    const stats = bySubIdx.get(i);
    if (!stats || stats.total < WEAK_SPOT_MIN_SAMPLE_SIZE) continue;
    const pctCorrect = stats.correct / stats.total;
    if (pctCorrect >= WEAK_SPOT_THRESHOLD) continue;
    out.push({
      stem: previousQuestions[i].stem,
      pctCorrect,
      sampleSize: stats.total,
    });
  }
  return out;
}

/** Demo fallback. Generates deterministic placeholder questions. */
export function buildDemoQuestions(args: {
  lessonTitle: string;
  count: number;
}): GeneratedQuestion[] {
  const samples: GeneratedQuestion[] = [
    {
      stem: `Quick warm-up for "${args.lessonTitle}": what's 3 × 4?`,
      difficulty: 2,
      hint: "Think of 3 groups of 4.",
      answers: [
        { key: "A", text: "7", correct: false },
        { key: "B", text: "10", correct: false },
        { key: "C", text: "12", correct: true },
        { key: "D", text: "15", correct: false },
      ],
    },
    {
      stem: "A pizza has 8 slices. You eat 2 slices. What fraction did you eat?",
      difficulty: 3,
      hint: "Slices-you-ate over slices-total.",
      answers: [
        { key: "A", text: "1⁄2", correct: false },
        { key: "B", text: "1⁄4", correct: true },
        { key: "C", text: "2⁄8 doesn't simplify", correct: false },
        { key: "D", text: "3⁄8", correct: false },
      ],
    },
    {
      stem: "If 4 friends share 12 cookies equally, how many does each get?",
      difficulty: 2,
      hint: "Divide the total by the number of friends.",
      answers: [
        { key: "A", text: "2", correct: false },
        { key: "B", text: "3", correct: true },
        { key: "C", text: "4", correct: false },
        { key: "D", text: "6", correct: false },
      ],
    },
    {
      stem: "Which expression matches: 'three times some number x'?",
      difficulty: 3,
      hint: "Multiplication is repeated addition.",
      answers: [
        { key: "A", text: "x + 3", correct: false },
        { key: "B", text: "3 + x", correct: false },
        { key: "C", text: "3 × x (or 3x)", correct: true },
        { key: "D", text: "x ÷ 3", correct: false },
      ],
    },
    {
      stem: "Mia has 5 pencils, then buys 4 more. Which equation models this?",
      difficulty: 3,
      hint: "Add what she had to what she just bought.",
      answers: [
        { key: "A", text: "5 + 4 = 9", correct: true },
        { key: "B", text: "5 − 4 = 1", correct: false },
        { key: "C", text: "5 × 4 = 20", correct: false },
        { key: "D", text: "5 ÷ 4 = 1.25", correct: false },
      ],
    },
  ];
  return samples.slice(0, Math.max(1, Math.min(args.count, samples.length)));
}
