import { type BlockType, type SettingsFor } from "@/lib/blocks";

/**
 * Block templates — pre-populated starters that fill in sensible default
 * settings so teachers don't have to type the same boilerplate every
 * time they add a 4-option MCQ / 5-pair matching / etc.
 *
 * The catalog is the single source of truth. The server resolves
 * `templateId` → `{type, settings, label}` so clients can't smuggle
 * arbitrary settings via this seam.
 *
 * Adding a template: extend `BLOCK_TEMPLATES` below using the `tpl()`
 * builder — its generic parameter constrains `settings` against the
 * per-type `SettingsFor<T>` shape, so writing
 * `tpl("MCQ", ..., { pairs: [...] })` is a compile-time error.
 */
export type BlockTemplate = {
  /** Stable id used by the client when sending `templateId` to the
   *  server. Naming pattern: `<lowercase-type>-<short-variant>`. */
  id: string;
  type: BlockType;
  /** Short label shown in the popover menu. */
  label: string;
  /** One-line hint shown below the label. */
  description: string;
  /** Optional label written to the new Block.settings.label. If absent,
   *  the block uses the type's default name. */
  blockLabel?: string;
  /** Per-type settings shape; passed verbatim into Block.settings.
   *  Stored as `unknown` here so the runtime catalog is monomorphic;
   *  the `tpl<T>()` builder enforces the narrow shape at definition
   *  time. */
  settings: unknown;
};

function tpl<T extends BlockType>(
  id: string,
  type: T,
  label: string,
  description: string,
  settings: SettingsFor<T>,
  blockLabel?: string
): BlockTemplate {
  return { id, type, label, description, settings, blockLabel };
}

export const BLOCK_TEMPLATES: ReadonlyArray<BlockTemplate> = [
  tpl(
    "mcq-4opt",
    "MCQ",
    "4-option MCQ",
    "Question + four answers, one correct",
    {
      stem: "What is …?",
      options: [
        { text: "Option A", correct: true },
        { text: "Option B", correct: false },
        { text: "Option C", correct: false },
        { text: "Option D", correct: false },
      ],
    }
  ),
  tpl(
    "mcq-true-false",
    "MCQ",
    "True / false",
    "Statement plus a True / False pair",
    {
      stem: "Statement to evaluate.",
      options: [
        { text: "True", correct: true },
        { text: "False", correct: false },
      ],
    }
  ),
  tpl(
    "quiz-3q",
    "QUIZ",
    "Quiz · 3 questions",
    "Curated multi-question MCQ deck",
    {
      questions: [
        {
          stem: "Question 1",
          answers: [
            { key: "A", text: "Option A", correct: true },
            { key: "B", text: "Option B", correct: false },
            { key: "C", text: "Option C", correct: false },
          ],
        },
        {
          stem: "Question 2",
          answers: [
            { key: "A", text: "Option A", correct: false },
            { key: "B", text: "Option B", correct: true },
          ],
        },
        {
          stem: "Question 3",
          answers: [
            { key: "A", text: "Option A", correct: false },
            { key: "B", text: "Option B", correct: false },
            { key: "C", text: "Option C", correct: true },
          ],
        },
      ],
    }
  ),
  tpl(
    "drag-5pair",
    "DRAG_MATCH",
    "5-pair matching",
    "Five terms paired with their definitions",
    {
      pairs: [
        { left: "Term 1", right: "Definition 1" },
        { left: "Term 2", right: "Definition 2" },
        { left: "Term 3", right: "Definition 3" },
        { left: "Term 4", right: "Definition 4" },
        { left: "Term 5", right: "Definition 5" },
      ],
    }
  ),
  tpl(
    "discussion-reflect",
    "DISCUSSION",
    "Reflection prompt",
    "Open-ended journaling thread",
    {
      prompt: "What was the most surprising thing you learned in this lesson?",
    }
  ),
  tpl(
    "poll-3opt",
    "POLL",
    "3-option poll",
    "Quick check-in with three choices",
    {
      prompt: "Which approach feels most natural to you?",
      options: ["Option A", "Option B", "Option C"],
    }
  ),
  tpl(
    "section-divider",
    "SECTION",
    "Section break",
    "Visual divider with optional subtitle",
    {
      title: "Part 1: …",
      subtitle: "What we'll cover in this section",
    }
  ),
  tpl(
    "reading-intro",
    "READING",
    "Intro reading",
    "Welcome paragraph + outcomes list",
    {
      body:
        "## Welcome\n\nIn this lesson you'll learn how to:\n\n- Outcome 1\n- Outcome 2\n- Outcome 3",
    }
  ),
  tpl(
    "aiquiz-5q",
    "AI_QUIZ",
    "AI quiz · 5 questions",
    "Generate 5 questions on the lesson topic",
    { topic: "", count: 5 }
  ),
  tpl(
    "speak-vocab",
    "SPEAK",
    "Vocabulary speak-back",
    "Student says a word; we score the recognition",
    {
      prompt: "Pronounce the word displayed below.",
      expected: "vocabulary",
      language: "en-US",
    }
  ),
  tpl(
    "live-class",
    "LIVE",
    "Live class session",
    "Scheduled meeting with a join link",
    { durationMin: 45 }
  ),
  tpl(
    "branching-3node",
    "BRANCHING",
    "Branching · 3 nodes",
    "Choose-your-own-adventure with one branch",
    {
      nodes: [
        {
          id: "start",
          title: "Start",
          body: "The scenario opens here. What would you do?",
          choices: [
            { label: "Option A", to: "a" },
            { label: "Option B", to: "b" },
          ],
        },
        {
          id: "a",
          title: "Outcome A",
          body: "You chose A. Here's what happens.",
          choices: [],
        },
        {
          id: "b",
          title: "Outcome B",
          body: "You chose B. Here's what happens.",
          choices: [],
        },
      ],
    }
  ),
];

/**
 * Server-side resolver: returns the template by id or `null` if no
 * such template exists. Used by `teacher.addBlock` to seed the new
 * row's settings without trusting client-supplied JSON.
 */
export function findBlockTemplate(id: string): BlockTemplate | null {
  return BLOCK_TEMPLATES.find((t) => t.id === id) ?? null;
}
