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
