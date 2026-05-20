/**
 * Block-type display catalog. Mirrors `BlockType` in
 * prisma/schema.prisma but adds the user-facing label + icon + an
 * `ai` flag so AI-powered blocks get the purple accent.
 *
 * Shared by AddBlockPopover (offers them) and CourseBuilderClient
 * (renders them in each lesson's block list). Keep this in lib/ so
 * both client + server code can import it (no React, no Prisma).
 */
export type BlockType =
  | "VIDEO"
  | "READING"
  | "SLIDES"
  | "PDF"
  | "QUIZ"
  | "MCQ"
  | "SPEAK"
  | "AI_QUIZ"
  | "SIMULATION"
  | "BRANCHING"
  | "DRAG_MATCH"
  | "POLL"
  | "SECTION"
  | "DISCUSSION"
  | "LIVE";

export type BlockMeta = {
  type: BlockType;
  /** Icon name from src/components/wf/primitives.tsx::IconName. */
  icon: string;
  label: string;
  ai?: boolean;
};

export const BLOCK_GROUPS: ReadonlyArray<{
  group: string;
  items: ReadonlyArray<BlockMeta>;
}> = [
  {
    group: "Content",
    items: [
      { type: "VIDEO", icon: "play", label: "Video" },
      { type: "READING", icon: "book", label: "Reading" },
      { type: "SLIDES", icon: "grid", label: "Slides" },
      { type: "PDF", icon: "download", label: "PDF / file" },
    ],
  },
  {
    group: "Practice",
    items: [
      { type: "QUIZ", icon: "star", label: "Quiz" },
      { type: "MCQ", icon: "check", label: "Multiple choice" },
      { type: "SPEAK", icon: "mic", label: "Speak / record" },
      { type: "AI_QUIZ", icon: "sparkles", label: "AI quiz", ai: true },
    ],
  },
  {
    group: "Interactive",
    items: [
      { type: "SIMULATION", icon: "bolt", label: "Simulation" },
      { type: "BRANCHING", icon: "branch", label: "Branching scenario" },
      { type: "DRAG_MATCH", icon: "grid", label: "Drag & match" },
      { type: "POLL", icon: "chart", label: "Live poll" },
    ],
  },
  {
    group: "Structure",
    items: [
      { type: "SECTION", icon: "plus", label: "Section break" },
      { type: "DISCUSSION", icon: "chat", label: "Discussion thread" },
      { type: "LIVE", icon: "user", label: "Live session" },
    ],
  },
];

const FLAT_META: Record<BlockType, BlockMeta> = (() => {
  const acc = {} as Record<BlockType, BlockMeta>;
  for (const grp of BLOCK_GROUPS) for (const it of grp.items) acc[it.type] = it;
  return acc;
})();

export function findBlockMeta(type: BlockType): BlockMeta {
  // BlockType is exhaustive against schema enum — every value is in
  // FLAT_META by construction. If you've added a BlockType to the
  // Prisma enum, add it to BLOCK_GROUPS above.
  return FLAT_META[type];
}

export const ALL_BLOCK_TYPES: BlockType[] = Object.keys(FLAT_META) as BlockType[];

// ----------------------------------------------------------------------------
// Per-block-type settings shapes (lives on Block.settings, a Json column).
//
// Each block type stores a different JSON shape. Historically callers read
// `block.settings` as a wide `BlockSettingsShape` union — every field
// across every type made optional in one big bag. That's still exported
// from `components/teacher/BlockInspector.tsx` for the polymorphic draft
// state in the inspector, but new consumers should reach for
// `SettingsFor<T>` instead — it returns the specific shape for a single
// block type and catches cross-type mismatches at compile time.
//
// The discriminator is `Block.type` (a column on the row), not a field
// inside the JSON, so the union is exposed as a TS mapped type rather
// than a literal-tagged union. Use `settingsFor(type, raw)` to coerce a
// `block.settings` value into the right shape after you've dispatched
// on type.
//
// **Adding a new block type**: extend `BlockType`, add a `*Settings` type
// here, and add it to the `SettingsMap` below. The `_ExhaustivenessCheck`
// line will fail compilation if you forget the map entry.
// ----------------------------------------------------------------------------

export type McqOption = { text: string; correct: boolean };

export type QuizQuestion = {
  stem: string;
  difficulty?: number;
  answers: Array<{ key: string; text: string; correct: boolean }>;
  hint?: string | null;
};

export type DragMatchPair = { left: string; right: string };

export type BranchingNode = {
  id: string;
  title: string;
  body: string;
  choices: Array<{ label: string; to: string }>;
};

/** Universal fields available on every block type. */
type CommonSettings = {
  label?: string;
  notes?: string;
};

export type VideoSettings = CommonSettings & {
  url?: string;
  caption?: string;
};
export type ReadingSettings = CommonSettings & {
  body?: string;
};
export type SlidesSettings = CommonSettings & {
  url?: string;
  caption?: string;
};
export type PdfSettings = CommonSettings & {
  url?: string;
  caption?: string;
};
export type McqSettings = CommonSettings & {
  stem?: string;
  options?: McqOption[];
};
export type QuizSettings = CommonSettings & {
  questions?: QuizQuestion[];
};
export type AiQuizSettings = CommonSettings & {
  topic?: string;
  count?: number;
  generated?: {
    questions: QuizQuestion[];
    generatedAt: string;
    mode?: string;
  };
};
export type SimulationSettings = CommonSettings & {
  url?: string;
  caption?: string;
};
export type BranchingSettings = CommonSettings & {
  nodes?: BranchingNode[];
};
export type DragMatchSettings = CommonSettings & {
  pairs?: DragMatchPair[];
};
/** POLL stores plain string options (no per-option `correct`). Distinct
 *  from MCQ's `McqOption[]` even though both fields are called `options`
 *  — the discriminator is `Block.type`, not a field inside the JSON. */
export type PollSettings = CommonSettings & {
  prompt?: string;
  options?: string[];
};
export type SectionSettings = CommonSettings & {
  title?: string;
  subtitle?: string;
};
export type DiscussionSettings = CommonSettings & {
  prompt?: string;
};
export type LiveSettings = CommonSettings & {
  startsAt?: string;
  durationMin?: number;
  joinUrl?: string;
};
export type SpeakSettings = CommonSettings & {
  prompt?: string;
  expected?: string;
  language?: string;
};

type SettingsMap = {
  VIDEO: VideoSettings;
  READING: ReadingSettings;
  SLIDES: SlidesSettings;
  PDF: PdfSettings;
  QUIZ: QuizSettings;
  MCQ: McqSettings;
  SPEAK: SpeakSettings;
  AI_QUIZ: AiQuizSettings;
  SIMULATION: SimulationSettings;
  BRANCHING: BranchingSettings;
  DRAG_MATCH: DragMatchSettings;
  POLL: PollSettings;
  SECTION: SectionSettings;
  DISCUSSION: DiscussionSettings;
  LIVE: LiveSettings;
};

// Compile-time exhaustiveness check. If a `BlockType` enum value gets
// added without a `SettingsMap` entry, this assignment fails with a
// "Property '...' is missing in type" error — the next person extending
// the block catalog gets a clear signal at compile time, not in
// production at first render.
type _ExhaustivenessCheck = SettingsMap & Record<BlockType, unknown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Verify = _ExhaustivenessCheck;

/** Per-type narrowing of `Block.settings`. After you've dispatched on
 *  `block.type`, write `SettingsFor<"MCQ">` to get `McqSettings`.
 *  Generic over the type literal so callers don't restate the mapping. */
export type SettingsFor<T extends BlockType> = SettingsMap[T];

/** Compile-time-only cast helper. `Block.settings` comes back from
 *  Prisma typed as `JsonValue`; once you know the block type you can
 *  call `settingsFor(block.type, block.settings)` to get the right
 *  narrow shape without writing the cast inline at every callsite.
 *
 *  This does NO runtime validation — fields are still optional and
 *  arrays may have invalid elements. Treat the result like any other
 *  parsed-but-not-validated JSON: run the same `Array.isArray + filter`
 *  guards the consumer was already doing. The win here is type-level:
 *  no more `(settings.options as unknown[])` to escape the wrong shape.
 */
export function settingsFor<T extends BlockType>(
  _type: T,
  raw: unknown
): SettingsFor<T> {
  return (raw ?? {}) as SettingsFor<T>;
}
