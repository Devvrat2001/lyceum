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

export function buildQuestionGenPrompt(args: {
  lessonTitle: string;
  courseTitle: string;
  existingStems: string[];
  count: number;
}): string {
  const { lessonTitle, courseTitle, existingStems, count } = args;
  return `Course: ${courseTitle}
Lesson: ${lessonTitle}

Existing questions in this lesson (avoid duplicates):
${
  existingStems.length === 0
    ? "(none yet)"
    : existingStems.map((s, i) => `${i + 1}. ${s}`).join("\n")
}

Generate ${count} new multiple-choice questions that match the
QuestionBatch schema. Distribute difficulty 2/3/4. One hint per
question if helpful.`;
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
