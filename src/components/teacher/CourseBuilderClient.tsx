"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { BlockInspector } from "@/components/teacher/BlockInspector";
import { LessonVideoPlayer } from "@/components/video/LessonVideoPlayer";
import { BLOCK_GROUPS, findBlockMeta, type BlockType } from "@/lib/blocks";

/**
 * Course Builder v2 — a Gamma-style WYSIWYG authoring surface, rebuilt
 * from the Claude Design handoff (`Course Builder v2.html` /
 * `wf-builder-v2.jsx`).
 *
 *   • LEFT  — a real course OUTLINE rail (units → lessons) for
 *     navigation, replacing the old dead block library. Pick a lesson
 *     here; the canvas edits it.
 *   • CENTER — a true WYSIWYG canvas: every block renders AS THE STUDENT
 *     WILL SEE IT, with hover insert-lines and a "/" command menu for
 *     inserting blocks. An Edit ↔ Student toggle previews in real time.
 *   • RIGHT — a CONTEXTUAL inspector: a selected block shows its content
 *     + appearance + behavior controls; deselecting flips to Lesson /
 *     Course / AI tabs.
 *
 * Everything is wired to the same tRPC mutations the previous builder
 * used (addBlock / updateBlock / deleteBlock / reorderBlocks /
 * setCourseStatus / updateCourse / generator.generateQuestions) plus
 * three new ones the outline rail needs (addUnit / addLesson /
 * updateLesson).
 */

// ── design tokens (exact values from the handoff) ──────────────────
const SEL = "#2a6fdb"; // selection blue
const SELSOFT = "rgba(42,111,219,0.10)";
const GOOD = "#1d7a4d";
const tone = {
  bg: "#ffffff",
  canvas: "#f4f3ef",
  ink: "#1f1d1a",
  body: "#5a564f",
  mute: "#9a958c",
  line: "#e7e3da",
  hair: "#efece4",
  ai: "#6b3df5",
  aiSoft: "#f1ecff",
  accent: "#ff5b1f",
  // Reference the app's loaded font stacks (Inter Tight / JetBrains
  // Mono / Fraunces — the exact families the design asked for).
  sans: "var(--font-sans-stack)",
  mono: "var(--font-mono-stack)",
  serif: "var(--font-serif-stack)",
} as const;

// ── shared types (same shapes the page feeds in) ───────────────────
export type BlockSettings = {
  label?: string;
  notes?: string;
  appearance?: {
    optionLayout?: "list" | "grid" | "inline";
    accent?: string;
    showLetters?: boolean;
    cardStyle?: boolean;
    showCorrect?: boolean;
  };
  [k: string]: unknown;
};

type LessonBlock = {
  id: string;
  type: BlockType;
  order: number;
  settings: BlockSettings;
};

type Lesson = {
  id: string;
  slug: string | null;
  title: string;
  durationMin: number | null;
  blocks: LessonBlock[];
};

type Unit = {
  id: string;
  order: number;
  title: string;
  subtitle: string | null;
  estLabel: string | null;
  lessons: Lesson[];
};

type CourseProps = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  status: string;
  subject: string;
  grade: string;
  priceCents: number;
  updatedAt: string;
  units: Unit[];
};

type ViewMode = "edit" | "student";
type InspectorTab = "block" | "lesson" | "course" | "ai";

// ── tiny helpers ───────────────────────────────────────────────────
function fmtPrice(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}`;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "linked";
  }
}
function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════
export function CourseBuilderClient({ course }: { course: CourseProps }) {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>(course.units);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    () => course.units[0]?.lessons[0]?.id ?? null
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("course");
  const [openUnits, setOpenUnits] = useState<Set<string>>(
    () => new Set(course.units[0] ? [course.units[0].id] : [])
  );
  const [err, setErr] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState("All changes saved");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // ── mutations ──
  const addUnit = trpc.teacher.addUnit.useMutation();
  const addLesson = trpc.teacher.addLesson.useMutation();
  const updateLesson = trpc.teacher.updateLesson.useMutation();
  const updateUnit = trpc.teacher.updateUnit.useMutation({
    onError: (e) => setErr(`Failed to rename unit: ${e.message}`),
  });
  const deleteUnit = trpc.teacher.deleteUnit.useMutation({
    onError: (e) => {
      setErr(`Failed to delete unit: ${e.message}`);
      setUnits(course.units);
    },
  });
  const deleteLesson = trpc.teacher.deleteLesson.useMutation({
    onError: (e) => {
      setErr(`Failed to delete lesson: ${e.message}`);
      setUnits(course.units);
    },
  });
  const reorderUnits = trpc.teacher.reorderUnits.useMutation({
    onError: (e) => {
      setErr(`Failed to reorder units: ${e.message}`);
      setUnits(course.units);
    },
  });
  const reorderLessons = trpc.teacher.reorderLessons.useMutation({
    onError: (e) => {
      setErr(`Failed to reorder lessons: ${e.message}`);
      setUnits(course.units);
    },
  });
  const addBlock = trpc.teacher.addBlock.useMutation();
  const updateBlockM = trpc.teacher.updateBlock.useMutation();
  const deleteBlock = trpc.teacher.deleteBlock.useMutation();
  const reorderBlocks = trpc.teacher.reorderBlocks.useMutation({
    onError: (e) => {
      setErr(`Failed to save block order: ${e.message}`);
      setUnits(course.units);
    },
  });
  const moveBlockM = trpc.teacher.moveBlock.useMutation({
    onError: (e) => {
      setErr(`Failed to move block: ${e.message}`);
      setUnits(course.units);
    },
  });
  const setCourseStatus = trpc.teacher.setCourseStatus.useMutation({
    onSuccess: () => router.refresh(),
    onError: (e) => setErr(`Failed to update course status: ${e.message}`),
  });

  const markSaved = useCallback(() => setSavedLabel("Saved just now"), []);

  // ── derived selection ──
  const selectedLesson = useMemo(() => {
    if (!selectedLessonId) return null;
    for (const u of units)
      for (const l of u.lessons) if (l.id === selectedLessonId) return l;
    return null;
  }, [units, selectedLessonId]);

  const selectedUnit = useMemo(() => {
    if (!selectedLessonId) return null;
    for (const u of units)
      if (u.lessons.some((l) => l.id === selectedLessonId)) return u;
    return null;
  }, [units, selectedLessonId]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId || !selectedLesson) return null;
    return selectedLesson.blocks.find((b) => b.id === selectedBlockId) ?? null;
  }, [selectedBlockId, selectedLesson]);

  // Other lessons in the course — targets for the inspector's "Move to
  // lesson" control. Excludes the block's current lesson.
  const moveTargets = useMemo(() => {
    if (!selectedLesson) return [] as { id: string; label: string }[];
    const out: { id: string; label: string }[] = [];
    for (const u of units)
      for (const l of u.lessons)
        if (l.id !== selectedLesson.id)
          out.push({ id: l.id, label: `${u.title} · ${l.title}` });
    return out;
  }, [units, selectedLesson]);

  // `selectedBlock` (a useMemo) already resolves to null when the id no
  // longer points at a block in the open lesson, and every lesson/block
  // mutation clears `selectedBlockId` explicitly — so no reconciliation
  // effect is needed here.

  const selectLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setSelectedBlockId(null);
    setInspectorTab("lesson");
  };
  const selectBlock = (blockId: string | null) => {
    setSelectedBlockId(blockId);
    if (blockId) setInspectorTab("block");
  };

  // ── local-state mutators ──
  const mapLessonBlocks = (
    prev: Unit[],
    lessonId: string,
    fn: (blocks: LessonBlock[]) => LessonBlock[]
  ): Unit[] =>
    prev.map((u) => ({
      ...u,
      lessons: u.lessons.map((l) =>
        l.id === lessonId ? { ...l, blocks: fn(l.blocks) } : l
      ),
    }));

  // ── block ops ──
  const toBlock = (b: {
    id: string;
    type: string;
    order: number;
    settings: unknown;
  }): LessonBlock => ({
    id: b.id,
    type: b.type as BlockType,
    order: b.order,
    settings: (b.settings ?? {}) as BlockSettings,
  });

  const insertBlockAt = async (
    lessonId: string,
    index: number,
    type: BlockType
  ) => {
    setErr(null);
    const lesson = units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === lessonId);
    const prevLen = lesson?.blocks.length ?? 0;
    try {
      const { block } = await addBlock.mutateAsync({ lessonId, type });
      const newBlock = toBlock(block);
      const clamped = Math.min(Math.max(index, 0), prevLen);
      setUnits((prev) =>
        mapLessonBlocks(prev, lessonId, (blocks) => {
          const a = [...blocks];
          a.splice(clamped, 0, newBlock);
          return a;
        })
      );
      if (clamped !== prevLen) {
        const ids = (lesson?.blocks.map((b) => b.id) ?? []).slice();
        ids.splice(clamped, 0, newBlock.id);
        reorderBlocks.mutate({ lessonId, blockIds: ids });
      }
      selectBlock(newBlock.id);
      markSaved();
    } catch (e) {
      setErr(`Failed to add block: ${e instanceof Error ? e.message : ""}`);
    }
  };

  const duplicateBlock = async (
    lessonId: string,
    block: LessonBlock,
    atIndex: number
  ) => {
    setErr(null);
    const lesson = units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === lessonId);
    try {
      const { block: created } = await addBlock.mutateAsync({
        lessonId,
        type: block.type,
      });
      await updateBlockM.mutateAsync({
        blockId: created.id,
        settings: block.settings,
      });
      const dupe: LessonBlock = {
        ...block,
        id: created.id,
        order: created.order,
      };
      setUnits((prev) =>
        mapLessonBlocks(prev, lessonId, (blocks) => {
          const a = [...blocks];
          a.splice(atIndex + 1, 0, dupe);
          return a;
        })
      );
      const ids = (lesson?.blocks.map((b) => b.id) ?? []).slice();
      ids.splice(atIndex + 1, 0, created.id);
      reorderBlocks.mutate({ lessonId, blockIds: ids });
      selectBlock(created.id);
      markSaved();
    } catch (e) {
      setErr(`Failed to duplicate: ${e instanceof Error ? e.message : ""}`);
    }
  };

  const switchBlockType = async (
    lessonId: string,
    block: LessonBlock,
    newType: BlockType
  ) => {
    if (newType === block.type) return;
    setErr(null);
    const lesson = units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === lessonId);
    try {
      await deleteBlock.mutateAsync({ blockId: block.id });
      const { block: created } = await addBlock.mutateAsync({
        lessonId,
        type: newType,
      });
      const replacement = toBlock(created);
      setUnits((prev) =>
        mapLessonBlocks(prev, lessonId, (blocks) =>
          blocks.map((b) => (b.id === block.id ? replacement : b))
        )
      );
      const ids = (lesson?.blocks ?? []).map((b) =>
        b.id === block.id ? created.id : b.id
      );
      reorderBlocks.mutate({ lessonId, blockIds: ids });
      selectBlock(created.id);
      markSaved();
    } catch (e) {
      setErr(`Failed to switch type: ${e instanceof Error ? e.message : ""}`);
    }
  };

  const removeBlock = (lessonId: string, blockId: string) => {
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    setUnits((prev) =>
      mapLessonBlocks(prev, lessonId, (blocks) =>
        blocks.filter((b) => b.id !== blockId)
      )
    );
    deleteBlock.mutate({ blockId });
    markSaved();
  };

  // Move the selected block to another lesson. Optimistically drops it from
  // the source lesson and appends it to the target (order = max+1), mirroring
  // the server. On error we reset to the last server snapshot (same recovery
  // as reorderBlocks).
  const moveBlockTo = (toLessonId: string) => {
    if (!selectedLesson || !selectedBlock) return;
    const fromLessonId = selectedLesson.id;
    const blk = selectedBlock;
    if (toLessonId === fromLessonId) return;
    setSelectedBlockId(null);
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => {
          if (l.id === fromLessonId) {
            return { ...l, blocks: l.blocks.filter((b) => b.id !== blk.id) };
          }
          if (l.id === toLessonId) {
            const nextOrder =
              l.blocks.reduce((m, b) => Math.max(m, b.order ?? 0), 0) + 1;
            return { ...l, blocks: [...l.blocks, { ...blk, order: nextOrder }] };
          }
          return l;
        }),
      }))
    );
    moveBlockM.mutate({ blockId: blk.id, toLessonId });
    markSaved();
  };

  const onBlockSettingsSaved = (blockId: string, settings: BlockSettings) => {
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => ({
          ...l,
          blocks: l.blocks.map((b) =>
            b.id === blockId ? { ...b, settings } : b
          ),
        })),
      }))
    );
    markSaved();
  };

  const onBlockDragEnd = (lessonId: string) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const lesson = units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === lessonId);
    if (!lesson) return;
    const oldIdx = lesson.blocks.findIndex((b) => b.id === active.id);
    const newIdx = lesson.blocks.findIndex((b) => b.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(lesson.blocks, oldIdx, newIdx);
    setUnits((prev) => mapLessonBlocks(prev, lessonId, () => next));
    setErr(null);
    reorderBlocks.mutate({ lessonId, blockIds: next.map((b) => b.id) });
    markSaved();
  };

  // ── outline ops ──
  const addUnitH = async () => {
    setErr(null);
    try {
      const { unit } = await addUnit.mutateAsync({ courseId: course.id });
      const u: Unit = {
        id: unit.id,
        order: unit.order,
        title: unit.title,
        subtitle: null,
        estLabel: unit.estLabel,
        lessons: [],
      };
      setUnits((prev) => [...prev, u]);
      setOpenUnits((prev) => new Set(prev).add(unit.id));
      markSaved();
    } catch (e) {
      setErr(`Failed to add unit: ${e instanceof Error ? e.message : ""}`);
    }
  };

  const addLessonH = async (unitId: string) => {
    setErr(null);
    try {
      const { lesson } = await addLesson.mutateAsync({ unitId });
      const l: Lesson = {
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        durationMin: lesson.durationMin,
        blocks: [],
      };
      setUnits((prev) =>
        prev.map((u) =>
          u.id === unitId ? { ...u, lessons: [...u.lessons, l] } : u
        )
      );
      setOpenUnits((prev) => new Set(prev).add(unitId));
      selectLesson(lesson.id);
      markSaved();
    } catch (e) {
      setErr(`Failed to add lesson: ${e instanceof Error ? e.message : ""}`);
    }
  };

  const updateUnitH = (
    unitId: string,
    patch: { title?: string; subtitle?: string | null }
  ) => {
    setErr(null);
    setUnits((prev) =>
      prev.map((u) => (u.id === unitId ? { ...u, ...patch } : u))
    );
    updateUnit.mutate({ unitId, ...patch });
    markSaved();
  };

  // Persist a new unit ordering (DnD in the outline rail). reorderUnits
  // wants the FULL id list (it rejects partial reorders), so we send the
  // whole reordered array and optimistically renumber order to 1..N.
  const reorderUnitsH = (orderedIds: string[]) => {
    setErr(null);
    setUnits((prev) => {
      const byId = new Map(prev.map((u) => [u.id, u]));
      return orderedIds
        .map((id, i) => {
          const u = byId.get(id);
          return u ? { ...u, order: i + 1 } : null;
        })
        .filter((u): u is Unit => u !== null);
    });
    reorderUnits.mutate({ courseId: course.id, unitIds: orderedIds });
    markSaved();
  };

  const reorderLessonsH = (unitId: string, orderedIds: string[]) => {
    setErr(null);
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const byId = new Map(u.lessons.map((l) => [l.id, l]));
        const lessons = orderedIds
          .map((id) => byId.get(id))
          .filter((l): l is Lesson => l !== undefined);
        return { ...u, lessons };
      })
    );
    reorderLessons.mutate({ unitId, lessonIds: orderedIds });
    markSaved();
  };

  // Delete a unit and everything in it. Optimistically drop it and
  // renumber the survivors' `order` to 1..N (matching the server) so the
  // "Unit N" labels stay contiguous. If the open lesson lived here, clear
  // the selection so the canvas doesn't point at a deleted lesson.
  const deleteUnitH = (unitId: string) => {
    setErr(null);
    const unit = units.find((u) => u.id === unitId);
    const hadSelected = unit?.lessons.some((l) => l.id === selectedLessonId);
    setUnits((prev) =>
      prev
        .filter((u) => u.id !== unitId)
        .map((u, i) => ({ ...u, order: i + 1 }))
    );
    setOpenUnits((prev) => {
      const next = new Set(prev);
      next.delete(unitId);
      return next;
    });
    if (hadSelected) {
      setSelectedLessonId(null);
      setSelectedBlockId(null);
    }
    deleteUnit.mutate({ unitId });
    markSaved();
  };

  const deleteLessonH = (unitId: string, lessonId: string) => {
    setErr(null);
    if (selectedLessonId === lessonId) {
      setSelectedLessonId(null);
      setSelectedBlockId(null);
    }
    setUnits((prev) =>
      prev.map((u) =>
        u.id === unitId
          ? { ...u, lessons: u.lessons.filter((l) => l.id !== lessonId) }
          : u
      )
    );
    deleteLesson.mutate({ lessonId });
    markSaved();
  };

  const renameLessonH = (lessonId: string, title: string) => {
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === lessonId ? { ...l, title } : l
        ),
      }))
    );
    updateLesson.mutate({ lessonId, title });
    markSaved();
  };
  const setLessonDurationH = (lessonId: string, durationMin: number | null) => {
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === lessonId ? { ...l, durationMin } : l
        ),
      }))
    );
    updateLesson.mutate({ lessonId, durationMin });
    markSaved();
  };

  const toggleUnit = (unitId: string) =>
    setOpenUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });

  // ── stats ──
  const totalLessons = units.reduce((a, u) => a + u.lessons.length, 0);
  const totalDuration = units.reduce(
    (a, u) => a + u.lessons.reduce((b, l) => b + (l.durationMin ?? 0), 0),
    0
  );

  const blockIndex =
    selectedBlock && selectedLesson
      ? selectedLesson.blocks.findIndex((b) => b.id === selectedBlock.id)
      : -1;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: tone.sans,
        color: tone.ink,
        background: tone.bg,
      }}
    >
      <BuilderTopBar
        course={course}
        lessonTitle={selectedLesson?.title ?? null}
        viewMode={viewMode}
        setViewMode={setViewMode}
        savedLabel={savedLabel}
        publishing={setCourseStatus.isPending}
        onPublishToggle={() => {
          setErr(null);
          setCourseStatus.mutate({
            courseId: course.id,
            status: course.status === "DRAFT" ? "PUBLISHED" : "DRAFT",
          });
        }}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <OutlineRail
          course={course}
          units={units}
          openUnits={openUnits}
          totalLessons={totalLessons}
          totalDuration={totalDuration}
          selectedLessonId={selectedLessonId}
          onToggleUnit={toggleUnit}
          onSelectLesson={selectLesson}
          onAddLesson={addLessonH}
          onAddUnit={addUnitH}
          onUpdateUnit={updateUnitH}
          onDeleteUnit={deleteUnitH}
          onDeleteLesson={deleteLessonH}
          onReorderUnits={reorderUnitsH}
          onReorderLessons={reorderLessonsH}
          sensors={sensors}
          adding={addUnit.isPending || addLesson.isPending}
        />

        <BuilderCanvas
          // Remount per lesson so transient canvas state (command-menu
          // position, hover) resets cleanly without a reconciliation effect.
          key={selectedLesson?.id ?? "no-lesson"}
          unit={selectedUnit}
          lesson={selectedLesson}
          viewMode={viewMode}
          sensors={sensors}
          selectedBlockId={selectedBlockId}
          onSelectBlock={selectBlock}
          onRenameLesson={renameLessonH}
          onInsertBlock={insertBlockAt}
          onDuplicate={duplicateBlock}
          onSwitchType={switchBlockType}
          onDelete={removeBlock}
          onBlockDragEnd={onBlockDragEnd}
          onAddFirstLesson={
            selectedUnit ? () => addLessonH(selectedUnit.id) : undefined
          }
          err={err}
        />

        <ContextInspector
          course={course}
          units={units}
          totalLessons={totalLessons}
          totalDuration={totalDuration}
          tab={selectedBlock ? "block" : inspectorTab}
          setTab={(t) => {
            if (t !== "block") setSelectedBlockId(null);
            setInspectorTab(t);
          }}
          lesson={selectedLesson}
          selectedBlock={selectedBlock}
          blockIndex={blockIndex}
          onBlockSaved={onBlockSettingsSaved}
          onDeselect={() => setSelectedBlockId(null)}
          onDeleteBlock={() =>
            selectedLesson &&
            selectedBlock &&
            removeBlock(selectedLesson.id, selectedBlock.id)
          }
          moveTargets={moveTargets}
          onMoveBlock={moveBlockTo}
          onRenameLesson={renameLessonH}
          onSetDuration={setLessonDurationH}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TOP BAR
// ════════════════════════════════════════════════════════════════════
function BuilderTopBar({
  course,
  lessonTitle,
  viewMode,
  setViewMode,
  savedLabel,
  publishing,
  onPublishToggle,
}: {
  course: CourseProps;
  lessonTitle: string | null;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  savedLabel: string;
  publishing: boolean;
  onPublishToggle: () => void;
}) {
  return (
    <header
      style={{
        height: 52,
        flexShrink: 0,
        borderBottom: `1px solid ${tone.line}`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 18px",
        background: tone.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link
          href="/teacher"
          aria-label="Back to teacher home"
          style={{
            width: 24,
            height: 24,
            background: tone.ink,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontFamily: tone.serif,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          L
        </Link>
        <Icon
          name="arrow"
          size={13}
          color={tone.mute}
          style={{ transform: "rotate(180deg)" }}
        />
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
      >
        <span
          style={{
            fontSize: 12,
            color: tone.mute,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 220,
          }}
        >
          {course.title}
        </span>
        <span style={{ fontSize: 12, color: tone.mute }}>/</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: tone.ink,
            whiteSpace: "nowrap",
          }}
        >
          {lessonTitle ?? "Untitled lesson"}
        </span>
        <span
          style={{
            fontFamily: tone.mono,
            fontSize: 9,
            letterSpacing: "0.08em",
            color: tone.mute,
            border: `1px solid ${tone.line}`,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {course.status}
        </span>
      </div>
      <div style={{ flex: 1 }} />

      {/* Edit ↔ Student preview toggle */}
      <div
        style={{
          display: "flex",
          border: `1px solid ${tone.line}`,
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        {(
          [
            ["grid", "Edit", "edit"],
            ["user", "Student view", "student"],
          ] as const
        ).map(([ic, label, mode]) => {
          const on = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 11px",
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                background: on ? tone.ink : "transparent",
                color: on ? "white" : tone.body,
                cursor: "pointer",
                fontFamily: tone.sans,
              }}
            >
              <Icon name={ic} size={13} color={on ? "white" : tone.body} />
              {label}
            </button>
          );
        })}
      </div>

      <span
        style={{ fontSize: 11, color: tone.mute, fontFamily: tone.mono }}
        suppressHydrationWarning
      >
        ● {savedLabel}
      </span>
      <Link
        href="/teacher/courses/new/ai"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 7,
          border: `1px solid ${tone.ai}`,
          background: tone.aiSoft,
          color: tone.ai,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <Icon name="sparkles" size={13} color={tone.ai} />
        AI assist
      </Link>
      <button
        type="button"
        onClick={onPublishToggle}
        disabled={publishing}
        style={{
          padding: "6px 14px",
          borderRadius: 7,
          border: "none",
          background: tone.ink,
          color: "white",
          fontSize: 12,
          fontWeight: 600,
          cursor: publishing ? "default" : "pointer",
          opacity: publishing ? 0.7 : 1,
          fontFamily: tone.sans,
        }}
      >
        {publishing
          ? "Saving…"
          : course.status === "DRAFT"
            ? "Publish →"
            : "Unpublish"}
      </button>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════
// LEFT — OUTLINE RAIL
// ════════════════════════════════════════════════════════════════════
// A tiny, subtle icon button for the outline rail (rename / delete).
// Lives outside the unit/lesson <button>s so we never nest buttons.
function RailAction({
  label,
  glyph,
  danger,
  onClick,
}: {
  label: string;
  glyph: string;
  danger?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 5,
        background: hover ? (danger ? "#fdecec" : tone.hair) : "transparent",
        color: hover ? (danger ? tone.accent : tone.ink) : tone.mute,
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1,
        fontFamily: tone.sans,
      }}
    >
      {glyph}
    </button>
  );
}

// A draggable lesson row in the outline rail (handle + select + delete).
function SortableLessonRow({
  lesson,
  active,
  onSelect,
  onDelete,
}: {
  lesson: Lesson;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lesson.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    alignItems: "center",
    gap: 2,
    margin: "1px 0",
    borderRadius: 6,
    background: active ? SELSOFT : "transparent",
    borderLeft: `2px solid ${active ? SEL : "transparent"}`,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        aria-label="Reorder lesson"
        style={{
          cursor: "grab",
          touchAction: "none",
          display: "inline-flex",
          padding: "0 1px",
          opacity: 0.45,
        }}
      >
        <Icon name="drag" size={11} color={tone.mute} />
      </span>
      <button
        type="button"
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 4px 6px 4px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: tone.sans,
        }}
      >
        <Icon name="book" size={12} color={active ? SEL : tone.mute} />
        <span
          style={{
            fontSize: 12,
            fontWeight: active ? 600 : 500,
            color: active ? SEL : tone.body,
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {lesson.title}
        </span>
        <span
          style={{ fontSize: 9, color: tone.mute, fontFamily: tone.mono }}
        >
          {lesson.blocks.length}
        </span>
      </button>
      <RailAction label="Delete lesson" glyph="✕" danger onClick={onDelete} />
    </div>
  );
}

// A draggable unit in the outline rail. Owns its own inline-edit state
// (title + subtitle) and an inner DnD context for its lessons.
function SortableUnitRow({
  unit,
  open,
  selectedLessonId,
  sensors,
  onToggle,
  onSelectLesson,
  onAddLesson,
  onUpdateUnit,
  onDeleteUnit,
  onDeleteLesson,
  onReorderLessons,
  adding,
}: {
  unit: Unit;
  open: boolean;
  selectedLessonId: string | null;
  sensors: ReturnType<typeof useSensors>;
  onToggle: () => void;
  onSelectLesson: (lessonId: string) => void;
  onAddLesson: (unitId: string) => void;
  onUpdateUnit: (
    unitId: string,
    patch: { title?: string; subtitle?: string | null }
  ) => void;
  onDeleteUnit: (unitId: string) => void;
  onDeleteLesson: (unitId: string, lessonId: string) => void;
  onReorderLessons: (unitId: string, orderedIds: string[]) => void;
  adding: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: unit.id });
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(unit.title);
  const [subtitleDraft, setSubtitleDraft] = useState(unit.subtitle ?? "");

  const startEdit = () => {
    setTitleDraft(unit.title);
    setSubtitleDraft(unit.subtitle ?? "");
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const t = titleDraft.trim();
    const s = subtitleDraft.trim();
    const patch: { title?: string; subtitle?: string | null } = {};
    if (t && t !== unit.title) patch.title = t;
    if (s !== (unit.subtitle ?? "")) patch.subtitle = s || null;
    if (Object.keys(patch).length > 0) onUpdateUnit(unit.id, patch);
  };

  const lessonIds = unit.lessons.map((l) => l.id);
  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    marginBottom: 2,
  };

  return (
    <div ref={setNodeRef} style={rowStyle}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 2, borderRadius: 6 }}
      >
        <span
          {...attributes}
          {...listeners}
          aria-label="Reorder unit"
          style={{
            cursor: "grab",
            touchAction: "none",
            display: "inline-flex",
            padding: "0 1px",
            opacity: 0.45,
          }}
        >
          <Icon name="drag" size={11} color={tone.mute} />
        </span>
        {editing ? (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "2px 0",
            }}
          >
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="Unit title"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: tone.ink,
                border: `1px solid ${SEL}`,
                borderRadius: 5,
                padding: "5px 7px",
                outline: "none",
                background: "white",
                fontFamily: tone.sans,
              }}
            />
            <input
              value={subtitleDraft}
              onChange={(e) => setSubtitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={commit}
              placeholder="Subtitle (optional)"
              aria-label="Unit subtitle"
              style={{
                fontSize: 11,
                color: tone.body,
                border: `1px solid ${tone.line}`,
                borderRadius: 5,
                padding: "4px 7px",
                outline: "none",
                background: "white",
                fontFamily: tone.sans,
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 4px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: tone.sans,
            }}
          >
            <Icon
              name="arrow"
              size={11}
              color={tone.mute}
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
            <span
              style={{ fontFamily: tone.mono, fontSize: 9, color: tone.mute }}
            >
              Unit {unit.order}
            </span>
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: tone.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {unit.title}
              </span>
              {unit.subtitle && (
                <span
                  style={{
                    fontSize: 10,
                    color: tone.mute,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {unit.subtitle}
                </span>
              )}
            </span>
            {!open && (
              <span style={{ fontSize: 10, color: tone.mute }}>
                {unit.lessons.length}
              </span>
            )}
          </button>
        )}
        {!editing && (
          <>
            <RailAction label="Rename unit" glyph="✎" onClick={startEdit} />
            <RailAction
              label="Delete unit"
              glyph="✕"
              danger
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${unit.title}" and all its lessons? This can't be undone.`
                  )
                )
                  onDeleteUnit(unit.id);
              }}
            />
          </>
        )}
      </div>

      {open && (
        <div style={{ paddingLeft: 10 }}>
          <DndContext
            id={`dnd-lessons-${unit.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              const oldI = lessonIds.indexOf(String(active.id));
              const newI = lessonIds.indexOf(String(over.id));
              if (oldI < 0 || newI < 0) return;
              onReorderLessons(unit.id, arrayMove(lessonIds, oldI, newI));
            }}
          >
            <SortableContext
              items={lessonIds}
              strategy={verticalListSortingStrategy}
            >
              {unit.lessons.map((l) => (
                <SortableLessonRow
                  key={l.id}
                  lesson={l}
                  active={l.id === selectedLessonId}
                  onSelect={() => onSelectLesson(l.id)}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Delete lesson "${l.title}"? This can't be undone.`
                      )
                    )
                      onDeleteLesson(unit.id, l.id);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={() => onAddLesson(unit.id)}
            disabled={adding}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px 6px 10px",
              fontSize: 11,
              color: tone.mute,
              border: "none",
              background: "transparent",
              cursor: adding ? "default" : "pointer",
              fontFamily: tone.sans,
            }}
          >
            <Icon name="plus" size={11} color={tone.mute} />
            Add lesson
          </button>
        </div>
      )}
    </div>
  );
}

function OutlineRail({
  course,
  units,
  openUnits,
  totalLessons,
  totalDuration,
  selectedLessonId,
  onToggleUnit,
  onSelectLesson,
  onAddLesson,
  onAddUnit,
  onUpdateUnit,
  onDeleteUnit,
  onDeleteLesson,
  onReorderUnits,
  onReorderLessons,
  sensors,
  adding,
}: {
  course: CourseProps;
  units: Unit[];
  openUnits: Set<string>;
  totalLessons: number;
  totalDuration: number;
  selectedLessonId: string | null;
  onToggleUnit: (unitId: string) => void;
  onSelectLesson: (lessonId: string) => void;
  onAddLesson: (unitId: string) => void;
  onAddUnit: () => void;
  onUpdateUnit: (
    unitId: string,
    patch: { title?: string; subtitle?: string | null }
  ) => void;
  onDeleteUnit: (unitId: string) => void;
  onDeleteLesson: (unitId: string, lessonId: string) => void;
  onReorderUnits: (orderedIds: string[]) => void;
  onReorderLessons: (unitId: string, orderedIds: string[]) => void;
  sensors: ReturnType<typeof useSensors>;
  adding: boolean;
}) {
  const hr =
    totalDuration > 0 ? ` · ~${Math.max(1, Math.round(totalDuration / 60))} hr` : "";
  return (
    <aside
      style={{
        width: 248,
        flexShrink: 0,
        borderRight: `1px solid ${tone.line}`,
        background: "#faf9f6",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${tone.line}` }}>
        <div
          style={{
            fontFamily: tone.mono,
            fontSize: 9,
            letterSpacing: "0.1em",
            color: tone.mute,
            marginBottom: 6,
          }}
        >
          COURSE OUTLINE
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: tone.serif,
            lineHeight: 1.2,
          }}
        >
          {course.title}
        </div>
        <div style={{ fontSize: 11, color: tone.mute, marginTop: 4 }}>
          {units.length} unit{units.length === 1 ? "" : "s"} · {totalLessons}{" "}
          lesson{totalLessons === 1 ? "" : "s"}
          {hr}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 8px" }}>
        {units.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: tone.mute,
              padding: "10px 8px",
              lineHeight: 1.5,
            }}
          >
            No units yet. Add your first unit to start building.
          </div>
        )}
        <DndContext
          id={`dnd-units-${course.id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            const { active, over } = e;
            if (!over || active.id === over.id) return;
            const ids = units.map((u) => u.id);
            const oldI = ids.indexOf(String(active.id));
            const newI = ids.indexOf(String(over.id));
            if (oldI < 0 || newI < 0) return;
            onReorderUnits(arrayMove(ids, oldI, newI));
          }}
        >
          <SortableContext
            items={units.map((u) => u.id)}
            strategy={verticalListSortingStrategy}
          >
            {units.map((u) => (
              <SortableUnitRow
                key={u.id}
                unit={u}
                open={openUnits.has(u.id)}
                selectedLessonId={selectedLessonId}
                sensors={sensors}
                onToggle={() => onToggleUnit(u.id)}
                onSelectLesson={onSelectLesson}
                onAddLesson={onAddLesson}
                onUpdateUnit={onUpdateUnit}
                onDeleteUnit={onDeleteUnit}
                onDeleteLesson={onDeleteLesson}
                onReorderLessons={onReorderLessons}
                adding={adding}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${tone.line}` }}>
        <button
          type="button"
          onClick={onAddUnit}
          disabled={adding}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px",
            borderRadius: 7,
            border: `1px dashed ${tone.line}`,
            background: "transparent",
            color: tone.body,
            fontSize: 12,
            fontWeight: 500,
            cursor: adding ? "default" : "pointer",
            fontFamily: tone.sans,
          }}
        >
          <Icon name="plus" size={12} color={tone.body} />
          Add unit
        </button>
      </div>
    </aside>
  );
}

// ════════════════════════════════════════════════════════════════════
// CENTER — WYSIWYG CANVAS
// ════════════════════════════════════════════════════════════════════
function BuilderCanvas({
  unit,
  lesson,
  viewMode,
  sensors,
  selectedBlockId,
  onSelectBlock,
  onRenameLesson,
  onInsertBlock,
  onDuplicate,
  onSwitchType,
  onDelete,
  onBlockDragEnd,
  onAddFirstLesson,
  err,
}: {
  unit: Unit | null;
  lesson: Lesson | null;
  viewMode: ViewMode;
  sensors: ReturnType<typeof useSensors>;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onInsertBlock: (lessonId: string, index: number, type: BlockType) => void;
  onDuplicate: (lessonId: string, block: LessonBlock, atIndex: number) => void;
  onSwitchType: (lessonId: string, block: LessonBlock, t: BlockType) => void;
  onDelete: (lessonId: string, blockId: string) => void;
  onBlockDragEnd: (lessonId: string) => (e: DragEndEvent) => void;
  onAddFirstLesson?: () => void;
  err: string | null;
}) {
  // command-menu open position: an index into the block list, or null
  const [cmdIndex, setCmdIndex] = useState<number | null>(null);
  const [cmdQuery, setCmdQuery] = useState("");
  const isEdit = viewMode === "edit";
  // (This component is remounted per lesson via `key`, so command-menu
  // state starts fresh for each lesson — no reset effect needed.)

  const openCmd = (index: number) => {
    setCmdIndex(index);
    setCmdQuery("");
  };
  const pick = (type: BlockType) => {
    if (lesson && cmdIndex !== null) onInsertBlock(lesson.id, cmdIndex, type);
    setCmdIndex(null);
  };

  if (!lesson) {
    return (
      <section
        aria-label="Lesson canvas"
        style={{
          flex: 1,
          overflow: "auto",
          background: tone.canvas,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div
            style={{
              fontFamily: tone.mono,
              fontSize: 9,
              letterSpacing: "0.1em",
              color: tone.mute,
              marginBottom: 8,
            }}
          >
            NO LESSON SELECTED
          </div>
          <div style={{ fontSize: 15, color: tone.body, marginBottom: 14 }}>
            {unit
              ? "This unit has no lessons yet."
              : "Pick a lesson from the outline, or add one to begin."}
          </div>
          {onAddFirstLesson && (
            <button
              type="button"
              onClick={onAddFirstLesson}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 14px",
                borderRadius: 9,
                border: `1.5px solid ${SEL}`,
                background: "white",
                color: SEL,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: tone.sans,
              }}
            >
              <Icon name="plus" size={13} color={SEL} />
              Add a lesson
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Lesson canvas"
      style={{
        flex: 1,
        overflow: "auto",
        background: tone.canvas,
        padding: "28px 0 80px",
      }}
    >
      <div style={{ width: 720, maxWidth: "100%", margin: "0 auto" }}>
        {/* lesson header */}
        <div style={{ marginBottom: 18, paddingLeft: isEdit ? 32 : 0 }}>
          <div
            style={{
              fontFamily: tone.mono,
              fontSize: 9,
              letterSpacing: "0.1em",
              color: tone.mute,
              marginBottom: 8,
            }}
          >
            {unit ? `UNIT ${unit.order} · ` : ""}
            {lesson.title.toUpperCase()}
            {isEdit ? " · EDITING" : ""}
          </div>
          {isEdit ? (
            <LessonTitleEditor
              key={lesson.id}
              value={lesson.title}
              onCommit={(t) => onRenameLesson(lesson.id, t)}
            />
          ) : (
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: tone.ink,
                letterSpacing: "-0.02em",
                fontFamily: tone.serif,
              }}
            >
              {lesson.title}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {[
              lesson.durationMin ? `~${lesson.durationMin} min` : null,
              `${lesson.blocks.length} block${lesson.blocks.length === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .map((c, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: `1px solid ${tone.line}`,
                    color: tone.body,
                    background: "white",
                  }}
                >
                  {c}
                </span>
              ))}
          </div>
        </div>

        {/* blocks */}
        {isEdit ? (
          <DndContext
            id={`dnd-blocks-${lesson.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onBlockDragEnd(lesson.id)}
          >
            <SortableContext
              items={lesson.blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {lesson.blocks.length === 0 && cmdIndex === null && (
                <div
                  style={{
                    marginLeft: 32,
                    padding: "18px 16px",
                    borderRadius: 10,
                    border: `1.5px dashed ${tone.line}`,
                    background: "white",
                    color: tone.mute,
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  Empty lesson — add your first block below.
                </div>
              )}
              {lesson.blocks.map((block, i) => (
                <div key={block.id}>
                  <InsertLine onClick={() => openCmd(i)} />
                  {cmdIndex === i && (
                    <CommandMenu
                      query={cmdQuery}
                      setQuery={setCmdQuery}
                      onPick={pick}
                      onClose={() => setCmdIndex(null)}
                    />
                  )}
                  <SortableBlock
                    block={block}
                    index={i}
                    total={lesson.blocks.length}
                    selected={selectedBlockId === block.id}
                    onSelect={() =>
                      onSelectBlock(
                        selectedBlockId === block.id ? null : block.id
                      )
                    }
                    onDuplicate={() => onDuplicate(lesson.id, block, i)}
                    onSwitchType={(t) => onSwitchType(lesson.id, block, t)}
                    onDelete={() => onDelete(lesson.id, block.id)}
                  />
                </div>
              ))}

              {/* tail add-block */}
              <div style={{ marginTop: 6 }}>
                <InsertLine onClick={() => openCmd(lesson.blocks.length)} />
                {cmdIndex === lesson.blocks.length ? (
                  <CommandMenu
                    query={cmdQuery}
                    setQuery={setCmdQuery}
                    onPick={pick}
                    onClose={() => setCmdIndex(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => openCmd(lesson.blocks.length)}
                    style={{
                      marginLeft: 32,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 14px",
                      borderRadius: 9,
                      border: `1.5px dashed ${tone.line}`,
                      background: "white",
                      color: tone.body,
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: tone.sans,
                    }}
                  >
                    <Icon name="plus" size={13} color={tone.body} />
                    Add block
                    <span
                      style={{
                        fontFamily: tone.mono,
                        fontSize: 10,
                        color: tone.mute,
                        marginLeft: 2,
                      }}
                    >
                      or type /
                    </span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          // STUDENT preview — clean cards, no chrome
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {lesson.blocks.length === 0 && (
              <div style={{ color: tone.mute, fontSize: 13 }}>
                This lesson has no content yet.
              </div>
            )}
            {lesson.blocks.map((block) => (
              <div
                key={block.id}
                style={{
                  borderRadius: 10,
                  padding: "16px 18px",
                  background: "white",
                  border: `1px solid ${tone.line}`,
                }}
              >
                <BlockBody block={block} />
              </div>
            ))}
          </div>
        )}

        {err && (
          <div
            style={{
              marginLeft: isEdit ? 32 : 0,
              marginTop: 12,
              padding: 8,
              fontSize: 11,
              color: tone.accent,
              border: `1px solid ${tone.accent}`,
              background: "#fff4ef",
              borderRadius: 6,
            }}
          >
            {err}
          </div>
        )}
      </div>
    </section>
  );
}

function LessonTitleEditor({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (t: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t && t !== value) onCommit(t);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label="Lesson title"
      style={{
        width: "100%",
        fontSize: 30,
        fontWeight: 700,
        color: tone.ink,
        letterSpacing: "-0.02em",
        fontFamily: tone.serif,
        border: "none",
        outline: "none",
        background: "transparent",
        padding: 0,
      }}
    />
  );
}

function InsertLine({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: hover ? 28 : 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        marginLeft: 32,
        transition: "height 0.1s",
      }}
    >
      {hover && (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 1.5,
              background: SEL,
            }}
          />
          <button
            type="button"
            onClick={onClick}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 999,
              border: `1.5px solid ${SEL}`,
              background: "white",
              color: SEL,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: tone.sans,
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="plus" size={12} color={SEL} />
            Add block ·{" "}
            <span style={{ fontFamily: tone.mono, fontSize: 10, opacity: 0.7 }}>
              type /
            </span>
          </button>
        </>
      )}
    </div>
  );
}

// ── "/" command menu ──
function CommandMenu({
  query,
  setQuery,
  onPick,
  onClose,
}: {
  query: string;
  setQuery: (q: string) => void;
  onPick: (t: BlockType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const groups = BLOCK_GROUPS.map((g) => ({
    group: g.group,
    items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);

  const first = groups[0]?.items[0]?.type ?? null;

  return (
    <div
      ref={ref}
      style={{
        marginLeft: 32,
        marginTop: 4,
        width: 320,
        background: "white",
        borderRadius: 12,
        border: `1px solid ${tone.line}`,
        boxShadow: "0 16px 48px rgba(0,0,0,0.16)",
        overflow: "hidden",
        position: "relative",
        zIndex: 8,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${tone.hair}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="search" size={13} color={tone.mute} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && first) onPick(first);
          }}
          placeholder="Search blocks…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 12,
            color: tone.ink,
            fontFamily: tone.mono,
            background: "transparent",
          }}
        />
        <span style={{ fontSize: 10, color: tone.mute }}>Insert block</span>
      </div>
      <div style={{ maxHeight: 280, overflow: "auto", padding: 6 }}>
        {groups.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: tone.mute }}>
            No blocks match “{query}”.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.group} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontFamily: tone.mono,
                fontSize: 8.5,
                letterSpacing: "0.08em",
                color: tone.mute,
                padding: "6px 8px 3px",
              }}
            >
              {g.group.toUpperCase()}
            </div>
            {g.items.map((it) => (
              <button
                key={it.type}
                type="button"
                onClick={() => onPick(it.type)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 8px",
                  borderRadius: 7,
                  border: "none",
                  background:
                    it.type === first ? SELSOFT : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: tone.sans,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: `1px solid ${it.ai ? tone.ai : tone.line}`,
                    background: it.ai ? tone.aiSoft : "#faf9f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={it.icon as "play"}
                    size={13}
                    color={it.ai ? tone.ai : tone.body}
                  />
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: it.ai ? tone.ai : tone.ink,
                    flex: 1,
                  }}
                >
                  {it.label}
                </span>
                {it.ai && (
                  <span
                    style={{
                      fontFamily: tone.mono,
                      fontSize: 8,
                      color: tone.ai,
                      border: `1px solid ${tone.ai}`,
                      borderRadius: 4,
                      padding: "1px 4px",
                    }}
                  >
                    AI
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── a block in edit mode: gutter handle + selection ring + toolbar ──
function SortableBlock({
  block,
  index,
  total,
  selected,
  onSelect,
  onDuplicate,
  onSwitchType,
  onDelete,
}: {
  block: LessonBlock;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onSwitchType: (t: BlockType) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });
  const meta = findBlockMeta(block.type);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* gutter: insert + drag handle */}
      <div
        style={{
          width: 22,
          flexShrink: 0,
          paddingTop: 6,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          opacity: selected ? 1 : 0.4,
        }}
      >
        <span
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${meta.label} block`}
          style={{ cursor: "grab", touchAction: "none", display: "inline-flex" }}
        >
          <Icon name="drag" size={13} color={tone.mute} />
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        style={{
          flex: 1,
          position: "relative",
          borderRadius: 10,
          padding: "14px 16px",
          background: "white",
          cursor: "pointer",
          border: `1.5px solid ${selected ? SEL : tone.line}`,
          boxShadow: selected
            ? `0 0 0 3px ${SELSOFT}`
            : "0 1px 2px rgba(0,0,0,0.03)",
        }}
      >
        {selected && (
          <BlockToolbar
            label={meta.label}
            onDuplicate={onDuplicate}
            onSwitchType={onSwitchType}
            onDelete={onDelete}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 10,
          }}
        >
          <Icon
            name={meta.icon as "play"}
            size={13}
            color={selected ? SEL : meta.ai ? tone.ai : tone.mute}
          />
          <span
            style={{
              fontFamily: tone.mono,
              fontSize: 9,
              letterSpacing: "0.08em",
              color: selected ? SEL : meta.ai ? tone.ai : tone.mute,
              textTransform: "uppercase",
            }}
          >
            {meta.label}
          </span>
          <span
            style={{
              fontFamily: tone.mono,
              fontSize: 9,
              color: tone.mute,
              marginLeft: "auto",
            }}
          >
            {metaLine(block) ?? `block ${index + 1} of ${total}`}
          </span>
        </div>
        <BlockBody block={block} />
      </div>
    </div>
  );
}

// ── floating contextual toolbar above a selected block ──
function BlockToolbar({
  label,
  onDuplicate,
  onSwitchType,
  onDelete,
}: {
  label: string;
  onDuplicate: () => void;
  onSwitchType: (t: BlockType) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: -38,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 2,
        background: tone.ink,
        borderRadius: 9,
        padding: "4px 5px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        zIndex: 6,
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            borderRadius: 6,
            border: "none",
            background: "rgba(255,255,255,0.12)",
            color: "white",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: tone.sans,
          }}
        >
          {label} ▾
        </button>
        {menu && (
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 0,
              width: 200,
              maxHeight: 280,
              overflow: "auto",
              background: "white",
              borderRadius: 9,
              border: `1px solid ${tone.line}`,
              boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
              padding: 6,
              zIndex: 9,
            }}
          >
            <div
              style={{
                fontFamily: tone.mono,
                fontSize: 8.5,
                letterSpacing: "0.08em",
                color: tone.mute,
                padding: "4px 8px",
              }}
            >
              TURN INTO
            </div>
            {BLOCK_GROUPS.flatMap((g) => g.items).map((it) => (
              <button
                key={it.type}
                type="button"
                onClick={() => {
                  setMenu(false);
                  onSwitchType(it.type);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  color: it.ai ? tone.ai : tone.ink,
                  fontSize: 12,
                  fontFamily: tone.sans,
                }}
              >
                <Icon
                  name={it.icon as "play"}
                  size={12}
                  color={it.ai ? tone.ai : tone.body}
                />
                {it.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <span
        style={{
          width: 1,
          height: 18,
          background: "rgba(255,255,255,0.18)",
          margin: "0 3px",
        }}
      />
      <ToolbarIcon name="plus" title="Duplicate" onClick={onDuplicate} />
      <ToolbarIcon name="check" title="Delete" onClick={onDelete} />
    </div>
  );
}

function ToolbarIcon({
  name,
  title,
  onClick,
}: {
  name: "plus" | "check";
  title: string;
  onClick: () => void;
}) {
  // "check" stands in for an "x"/delete glyph in this icon set; we rotate
  // semantics via the title + a reddish tint when danger.
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: 5,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {title === "Delete" ? (
        <span style={{ color: "#ff9a7a", fontSize: 14, lineHeight: 1 }}>×</span>
      ) : (
        <Icon name={name} size={13} color="rgba(255,255,255,0.85)" />
      )}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// WYSIWYG BLOCK RENDERERS (student-facing inner content)
// ════════════════════════════════════════════════════════════════════
function metaLine(block: LessonBlock): string | null {
  const s = block.settings;
  switch (block.type) {
    case "READING": {
      const w = wordCount(str(s.body));
      return w ? `${w} words · ~${Math.max(1, Math.ceil(w / 200))} min` : null;
    }
    case "MCQ": {
      const opts = arr<{ correct?: boolean }>(s.options);
      if (!opts.length) return null;
      return `${opts.length} options · ${opts.filter((o) => o?.correct).length} correct`;
    }
    case "QUIZ": {
      const n = arr(s.questions).length;
      return n ? `${n} question${n === 1 ? "" : "s"}` : null;
    }
    case "AI_QUIZ": {
      const g = s.generated as { questions?: unknown[] } | undefined;
      const n = arr(g?.questions).length;
      return n ? `auto · ${n} Qs` : "auto-generated";
    }
    case "VIDEO":
    case "SLIDES":
    case "PDF":
    case "SIMULATION":
      return str(s.url) ? hostOf(str(s.url)) : null;
    case "DRAG_MATCH": {
      const n = arr(s.pairs).length;
      return n ? `${n} pairs` : null;
    }
    case "POLL": {
      const n = arr(s.options).length;
      return n ? `${n} options` : null;
    }
    case "BRANCHING": {
      const n = arr(s.nodes).length;
      return n ? `${n} nodes` : null;
    }
    default:
      return null;
  }
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: tone.mute, fontStyle: "italic" }}>
      {children}
    </div>
  );
}

function BlockBody({ block }: { block: LessonBlock }) {
  const s = block.settings;
  const ap = (s.appearance ?? {}) as NonNullable<BlockSettings["appearance"]>;

  switch (block.type) {
    case "READING": {
      const body = str(s.body);
      const heading = str(s.label);
      return (
        <>
          {heading && (
            <h3
              style={{
                fontSize: 17,
                fontWeight: 600,
                margin: "0 0 8px",
                color: tone.ink,
              }}
            >
              {heading}
            </h3>
          )}
          {body ? (
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: tone.body,
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {body.length > 600 ? body.slice(0, 600) + "…" : body}
            </p>
          ) : (
            <Empty>Empty reading — add content in the inspector.</Empty>
          )}
        </>
      );
    }

    case "MCQ": {
      const stem = str(s.stem);
      const opts = arr<{ text?: string; correct?: boolean }>(s.options);
      return (
        <>
          <Stem>{stem || "Untitled question"}</Stem>
          {opts.length ? (
            <OptionCards options={opts} appearance={ap} />
          ) : (
            <Empty>No answer options yet.</Empty>
          )}
        </>
      );
    }

    case "QUIZ": {
      const qs = arr<{
        stem?: string;
        answers?: { key?: string; text?: string; correct?: boolean }[];
      }>(s.questions);
      if (!qs.length) return <Empty>No questions yet.</Empty>;
      const q0 = qs[0];
      return (
        <>
          <Stem>{str(q0.stem) || "Question 1"}</Stem>
          <OptionCards
            options={arr<{ text?: string; correct?: boolean }>(q0.answers).map(
              (a) => ({ text: str(a.text), correct: !!a.correct })
            )}
            appearance={ap}
          />
          {qs.length > 1 && (
            <div style={{ fontSize: 11, color: tone.mute, marginTop: 10 }}>
              + {qs.length - 1} more question{qs.length - 1 === 1 ? "" : "s"}
            </div>
          )}
        </>
      );
    }

    case "AI_QUIZ": {
      const g = s.generated as { questions?: unknown[] } | undefined;
      const n = arr(g?.questions).length;
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 8,
            border: `1.5px dashed ${tone.ai}`,
            background: tone.aiSoft,
          }}
        >
          <Icon name="sparkles" size={16} color={tone.ai} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tone.ai }}>
              Adaptive quiz · generated from this lesson
            </div>
            <div style={{ fontSize: 11.5, color: tone.body, marginTop: 2 }}>
              {n
                ? `${n} question${n === 1 ? "" : "s"} ready · difficulty adapts per student`
                : "Not generated yet — open the inspector to generate."}
            </div>
          </div>
        </div>
      );
    }

    case "VIDEO":
      // Real, playable preview — identical to the student reader. An
      // uploaded Mux video (or a pasted YouTube/Vimeo link) plays right
      // here in the builder; the course owner is authorized for the
      // signed-playback token server-side, so it no longer shows a dead
      // placeholder after upload.
      return <LessonVideoPlayer settings={s} blockId={block.id} />;

    case "SLIDES":
    case "SIMULATION": {
      const url = str(s.url);
      const caption = str(s.caption);
      const labels: Record<string, string> = {
        SLIDES: "Slides",
        SIMULATION: "Interactive simulation",
      };
      return (
        <>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 8,
              border: `1.5px solid ${tone.line}`,
              background: "#faf9f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: tone.mute,
              fontSize: 12,
              fontFamily: tone.mono,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <Icon name="grid" size={22} color={tone.mute} />
              <div style={{ marginTop: 6 }}>
                {url ? hostOf(url) : labels[block.type]}
              </div>
            </div>
          </div>
          {caption && (
            <div style={{ fontSize: 12, color: tone.mute, marginTop: 8 }}>
              {caption}
            </div>
          )}
          {!url && <Empty>No source URL yet.</Empty>}
        </>
      );
    }

    case "PDF": {
      const url = str(s.url);
      const caption = str(s.caption);
      return (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 8,
              border: `1.5px solid ${tone.line}`,
              background: "#faf9f6",
            }}
          >
            <Icon name="download" size={16} color={tone.body} />
            <span style={{ fontSize: 13, color: tone.ink, flex: 1 }}>
              {url ? hostOf(url) : "PDF / file"}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: tone.body,
                border: `1px solid ${tone.line}`,
                borderRadius: 6,
                padding: "4px 10px",
              }}
            >
              Download
            </span>
          </div>
          {caption && (
            <div style={{ fontSize: 12, color: tone.mute, marginTop: 8 }}>
              {caption}
            </div>
          )}
        </>
      );
    }

    case "DRAG_MATCH": {
      const pairs = arr<{ left?: string; right?: string }>(s.pairs);
      const prompt = str(s.prompt);
      if (!pairs.length) return <Empty>No matching pairs yet.</Empty>;
      return (
        <>
          {prompt && <Stem>{prompt}</Stem>}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px 40px",
            }}
          >
            {pairs.slice(0, 6).map((p, i) => (
              <FragmentPair key={i} left={str(p.left)} right={str(p.right)} />
            ))}
          </div>
        </>
      );
    }

    case "POLL": {
      const prompt = str(s.stem);
      const opts = arr<string>(s.options).filter((o) => typeof o === "string");
      return (
        <>
          <Stem>{prompt || "Poll"}</Stem>
          {opts.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {opts.map((o, i) => (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `1.5px solid ${tone.line}`,
                    background: "white",
                    fontSize: 13.5,
                    color: tone.ink,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${20 + ((i * 17) % 60)}%`,
                      background: SELSOFT,
                    }}
                  />
                  <span style={{ position: "relative" }}>{o}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No poll options yet.</Empty>
          )}
        </>
      );
    }

    case "SECTION": {
      const title = str(s.title) || str(s.label);
      const subtitle = str(s.subtitle);
      return (
        <div style={{ borderTop: `2px solid ${tone.ink}`, paddingTop: 10 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: tone.serif,
              color: tone.ink,
            }}
          >
            {title || "Section"}
          </div>
          {subtitle && (
            <div style={{ fontSize: 13, color: tone.body, marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </div>
      );
    }

    case "DISCUSSION": {
      const prompt = str(s.prompt);
      return (
        <>
          <Stem>{prompt || "Class discussion"}</Stem>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: `1.5px solid ${tone.line}`,
              background: "#faf9f6",
              color: tone.mute,
              fontSize: 13,
            }}
          >
            Write a reply…
          </div>
        </>
      );
    }

    case "LIVE": {
      const startsAt = str(s.startsAt);
      const joinUrl = str(s.joinUrl);
      const when = startsAt
        ? new Date(startsAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "Not scheduled";
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 8,
            border: `1.5px solid ${tone.line}`,
            background: "#faf9f6",
          }}
        >
          <Icon name="user" size={16} color={tone.body} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tone.ink }}>
              {str(s.title) || str(s.label) || "Live session"}
            </div>
            <div
              style={{ fontSize: 11.5, color: tone.body, marginTop: 2 }}
              suppressHydrationWarning
            >
              {when}
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: joinUrl ? tone.ink : tone.mute,
              border: `1px solid ${tone.line}`,
              borderRadius: 6,
              padding: "4px 10px",
            }}
          >
            Join
          </span>
        </div>
      );
    }

    case "SPEAK": {
      const prompt = str(s.prompt);
      const expected = str(s.expected);
      return (
        <>
          <Stem>{prompt || "Read aloud"}</Stem>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 8,
              border: `1.5px solid ${tone.line}`,
              background: "#faf9f6",
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "white",
                border: `1.5px solid ${tone.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="mic" size={16} color={tone.body} />
            </span>
            <span style={{ fontSize: 12.5, color: tone.mute }}>
              {expected ? `Expected: “${expected}”` : "Tap to record your answer"}
            </span>
          </div>
        </>
      );
    }

    case "BRANCHING": {
      const nodes = arr<{
        title?: string;
        body?: string;
        choices?: { label?: string }[];
      }>(s.nodes);
      if (!nodes.length) return <Empty>No scenario nodes yet.</Empty>;
      const start = nodes[0];
      return (
        <>
          <Stem>{str(start.title) || "Scenario"}</Stem>
          {str(start.body) && (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: tone.body,
                margin: "0 0 10px",
              }}
            >
              {str(start.body)}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {arr<{ label?: string }>(start.choices).map((c, i) => (
              <div
                key={i}
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${tone.line}`,
                  background: "white",
                  fontSize: 13,
                  color: tone.ink,
                }}
              >
                {str(c.label) || `Choice ${i + 1}`}
              </div>
            ))}
          </div>
        </>
      );
    }

    default:
      return <Empty>Block preview not available.</Empty>;
  }
}

function Stem({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 14.5,
        fontWeight: 600,
        color: tone.ink,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function OptionCards({
  options,
  appearance,
}: {
  options: { text?: string; correct?: boolean }[];
  appearance: NonNullable<BlockSettings["appearance"]>;
}) {
  const layout = appearance.optionLayout ?? "list";
  const showLetters = appearance.showLetters ?? true;
  const showCorrect = appearance.showCorrect ?? true;
  const letters = ["A", "B", "C", "D", "E", "F"];
  return (
    <div
      style={{
        display: layout === "grid" ? "grid" : "flex",
        gridTemplateColumns: layout === "grid" ? "1fr 1fr" : undefined,
        flexDirection: layout === "list" ? "column" : "row",
        flexWrap: layout === "inline" ? "wrap" : undefined,
        gap: 8,
      }}
    >
      {options.map((o, i) => {
        const correct = showCorrect && !!o.correct;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              borderRadius: 8,
              flex: layout === "inline" ? "0 0 auto" : undefined,
              border: `1.5px solid ${correct ? GOOD : tone.line}`,
              background: correct ? "rgba(29,122,77,0.06)" : "white",
            }}
          >
            {showLetters && (
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `1.5px solid ${correct ? GOOD : tone.line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: tone.mono,
                  color: correct ? GOOD : tone.mute,
                  flexShrink: 0,
                }}
              >
                {letters[i] ?? "•"}
              </span>
            )}
            <span
              style={{
                fontSize: 13.5,
                color: tone.ink,
                flex: 1,
                fontWeight: correct ? 600 : 400,
              }}
            >
              {o.text || `Option ${i + 1}`}
            </span>
            {correct && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  color: GOOD,
                  fontFamily: tone.mono,
                }}
              >
                <Icon name="check" size={12} color={GOOD} />
                CORRECT
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FragmentPair({ left, right }: { left: string; right: string }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 8,
          border: `1.5px solid ${tone.line}`,
          background: "#faf9f6",
        }}
      >
        <span style={{ fontSize: 13.5, color: tone.ink }}>{left || "—"}</span>
        <span
          style={{
            marginLeft: "auto",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: tone.line,
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 8,
          border: `1.5px solid ${tone.line}`,
          background: "white",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: tone.line,
          }}
        />
        <span style={{ fontSize: 13.5, color: tone.body }}>{right || "—"}</span>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// RIGHT — CONTEXTUAL INSPECTOR
// ════════════════════════════════════════════════════════════════════
function ContextInspector({
  course,
  units,
  totalLessons,
  totalDuration,
  tab,
  setTab,
  lesson,
  selectedBlock,
  blockIndex,
  onBlockSaved,
  onDeselect,
  onDeleteBlock,
  moveTargets,
  onMoveBlock,
  onRenameLesson,
  onSetDuration,
}: {
  course: CourseProps;
  units: Unit[];
  totalLessons: number;
  totalDuration: number;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  lesson: Lesson | null;
  selectedBlock: LessonBlock | null;
  blockIndex: number;
  onBlockSaved: (blockId: string, settings: BlockSettings) => void;
  onDeselect: () => void;
  onDeleteBlock: () => void;
  moveTargets: { id: string; label: string }[];
  onMoveBlock: (toLessonId: string) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onSetDuration: (lessonId: string, durationMin: number | null) => void;
}) {
  const meta = selectedBlock ? findBlockMeta(selectedBlock.type) : null;
  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: `1px solid ${tone.line}`,
        background: tone.bg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* tabs */}
      <div
        style={{
          display: "flex",
          padding: "10px 12px 0",
          gap: 4,
          borderBottom: `1px solid ${tone.line}`,
        }}
      >
        {(["block", "lesson", "course", "ai"] as const).map((t) => {
          const on = tab === t;
          const label =
            t === "block"
              ? "Block"
              : t === "lesson"
                ? "Lesson"
                : t === "course"
                  ? "Course"
                  : "AI";
          const disabled = t === "block" && !selectedBlock;
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => setTab(t)}
              style={{
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: on ? 600 : 500,
                color: disabled ? tone.line : on ? tone.ink : tone.mute,
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${on ? tone.ink : "transparent"}`,
                cursor: disabled ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontFamily: tone.sans,
              }}
            >
              {t === "ai" && (
                <Icon name="sparkles" size={12} color={on ? tone.ai : tone.mute} />
              )}
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 16px 24px" }}>
        {tab === "block" && selectedBlock && meta ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 9,
                background: SELSOFT,
                border: `1px solid ${SEL}`,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: "white",
                  border: `1px solid ${SEL}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={meta.icon as "play"} size={14} color={SEL} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tone.ink }}>
                  {meta.label}
                </div>
                <div
                  style={{ fontSize: 10.5, color: SEL, fontFamily: tone.mono }}
                >
                  SELECTED · BLOCK {blockIndex + 1} OF{" "}
                  {lesson?.blocks.length ?? blockIndex + 1}
                </div>
              </div>
              <button
                type="button"
                onClick={onDeselect}
                aria-label="Deselect block"
                style={{
                  border: "none",
                  background: "transparent",
                  color: tone.mute,
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <BlockInspector
              key={selectedBlock.id}
              embedded
              block={selectedBlock}
              onSaved={(settings) => onBlockSaved(selectedBlock.id, settings)}
              onDeselect={onDeselect}
              onDelete={onDeleteBlock}
              moveTargets={moveTargets}
              onMove={onMoveBlock}
            />
          </>
        ) : tab === "lesson" ? (
          <LessonPanel
            // Remount when the lesson identity/title/duration changes so the
            // local field state re-initializes from props without an effect.
            key={`${lesson?.id ?? "none"}:${lesson?.title ?? ""}:${
              lesson?.durationMin ?? ""
            }`}
            lesson={lesson}
            onRename={onRenameLesson}
            onSetDuration={onSetDuration}
          />
        ) : tab === "ai" ? (
          <AIPanel lesson={lesson} totalLessons={totalLessons} course={course} />
        ) : (
          <CoursePanel
            course={course}
            units={units}
            totalLessons={totalLessons}
            totalDuration={totalDuration}
          />
        )}
      </div>
    </aside>
  );
}

// ── inspector field primitives ──
function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: tone.mono,
        fontSize: 9,
        letterSpacing: "0.08em",
        color: tone.mute,
        margin: "4px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: tone.mono,
          fontSize: 10.5,
          color: tone.mute,
          marginBottom: 4,
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 12.5,
  border: `1px solid ${tone.line}`,
  borderRadius: 7,
  background: "white",
  color: tone.ink,
  outline: "none",
  fontFamily: tone.sans,
};

// ── LESSON tab ──
function LessonPanel({
  lesson,
  onRename,
  onSetDuration,
}: {
  lesson: Lesson | null;
  onRename: (lessonId: string, title: string) => void;
  onSetDuration: (lessonId: string, durationMin: number | null) => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [duration, setDuration] = useState(
    lesson?.durationMin != null ? String(lesson.durationMin) : ""
  );
  // This panel is remounted (via `key`) when the lesson identity/title/
  // duration changes, so local field state re-initializes from props
  // without a sync effect.

  if (!lesson) {
    return <Empty>Select a lesson from the outline to edit it.</Empty>;
  }

  return (
    <>
      <PanelLabel>LESSON</PanelLabel>
      <Field label="TITLE">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const t = title.trim();
            if (t && t !== lesson.title) onRename(lesson.id, t);
            else setTitle(lesson.title);
          }}
          style={inputStyle}
        />
      </Field>
      <Field label="ESTIMATED MINUTES">
        <input
          type="number"
          min={0}
          max={600}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={() => {
            const n = duration.trim() === "" ? null : parseInt(duration, 10);
            const val = n != null && Number.isFinite(n) ? n : null;
            onSetDuration(lesson.id, val);
          }}
          placeholder="—"
          style={{ ...inputStyle, width: 100 }}
        />
      </Field>
      <Field label="BLOCKS">
        <div style={{ fontSize: 12.5, color: tone.body }}>
          {lesson.blocks.length} block{lesson.blocks.length === 1 ? "" : "s"}
        </div>
      </Field>
      {lesson.slug && (
        <Link
          href={`/student/lesson/${lesson.slug}`}
          target="_blank"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: SEL,
            textDecoration: "none",
            marginTop: 4,
          }}
        >
          Open in student reader{" "}
          <Icon name="arrow" size={12} color={SEL} />
        </Link>
      )}
    </>
  );
}

// ── AI tab ──
function AIPanel({
  lesson,
  totalLessons,
  course,
}: {
  lesson: Lesson | null;
  totalLessons: number;
  course: CourseProps;
}) {
  const [count, setCount] = useState(5);
  const [msg, setMsg] = useState<string | null>(null);
  const gen = trpc.generator.generateQuestions.useMutation({
    onSuccess: (r) => {
      setMsg(
        `Added ${r.added} question${r.added === 1 ? "" : "s"} (${(
          r.elapsedMs / 1000
        ).toFixed(1)}s). Reopen the lesson to see them.`
      );
      setTimeout(() => setMsg(null), 5000);
    },
    onError: (e) => setMsg(`Failed: ${e.message}`),
  });

  return (
    <>
      <PanelLabel>AI ASSIST</PanelLabel>
      <div
        style={{
          padding: 12,
          borderRadius: 9,
          border: `1px solid ${tone.ai}`,
          background: tone.aiSoft,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: tone.ai,
            marginBottom: 4,
          }}
        >
          Generate a quiz for this lesson
        </div>
        <div style={{ fontSize: 11.5, color: tone.body, lineHeight: 1.5 }}>
          {lesson
            ? `Creates multiple-choice questions for “${lesson.title}”.`
            : "Pick a lesson first."}
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            margin: "10px 0",
          }}
        >
          <span style={{ fontFamily: tone.mono, fontSize: 10, color: tone.mute }}>
            COUNT
          </span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) =>
              setCount(
                Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
              )
            }
            style={{ ...inputStyle, width: 56, padding: "4px 8px" }}
          />
        </div>
        <button
          type="button"
          disabled={!lesson || gen.isPending}
          onClick={() => lesson && gen.mutate({ lessonId: lesson.id, count })}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px",
            borderRadius: 7,
            border: `1px solid ${tone.ai}`,
            background: "white",
            color: tone.ai,
            fontSize: 12,
            fontWeight: 600,
            cursor: !lesson || gen.isPending ? "default" : "pointer",
            opacity: !lesson || gen.isPending ? 0.6 : 1,
            fontFamily: tone.sans,
          }}
        >
          <Icon name="sparkles" size={12} color={tone.ai} />
          {gen.isPending ? "Generating…" : `Generate ${count} questions`}
        </button>
        {msg && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: gen.isError ? tone.accent : GOOD,
            }}
          >
            {msg}
          </div>
        )}
      </div>

      <Link
        href="/teacher/courses/new/ai"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 9,
          border: `1px solid ${tone.line}`,
          background: "white",
          textDecoration: "none",
          color: tone.ink,
          fontSize: 12.5,
          fontWeight: 500,
        }}
      >
        <Icon name="sparkles" size={14} color={tone.ai} />
        Generate a whole course outline →
      </Link>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: tone.mute,
          lineHeight: 1.5,
        }}
      >
        {totalLessons < 5
          ? `This course has ${totalLessons} lesson${totalLessons === 1 ? "" : "s"}. Most Grade ${course.grade} courses run 20–40 — the AI generator can scaffold more.`
          : "Tip: keep lessons ~8 minutes for better retention."}
      </div>
    </>
  );
}

// ── COURSE tab ──
function CoursePanel({
  course,
  units,
  totalLessons,
  totalDuration,
}: {
  course: CourseProps;
  units: Unit[];
  totalLessons: number;
  totalDuration: number;
}) {
  return (
    <>
      <PanelLabel>COURSE</PanelLabel>
      <CourseDetailsEditor course={course} />

      <Field label="STATS">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <Stat label="UNITS" value={String(units.length)} />
          <Stat label="LESSONS" value={String(totalLessons)} />
          <Stat label="PRICE" value={fmtPrice(course.priceCents)} />
          <Stat
            label="EST. TIME"
            value={
              totalDuration > 0
                ? `${Math.max(1, Math.round(totalDuration / 60))} hr`
                : "—"
            }
          />
        </div>
      </Field>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: tone.mono, fontSize: 9, color: tone.mute }}>
        {label}
      </div>
      <div style={{ fontFamily: tone.serif, fontSize: 18, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function CourseDetailsEditor({ course }: { course: CourseProps }) {
  const router = useRouter();
  const [title, setTitle] = useState(course.title);
  const [tagline, setTagline] = useState(course.tagline ?? "");
  const [subject, setSubject] = useState(course.subject);
  const [grade, setGrade] = useState(course.grade);
  const [price, setPrice] = useState((course.priceCents / 100).toString());
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const update = trpc.teacher.updateCourse.useMutation({
    onSuccess: () => {
      setSavedMsg("Saved");
      router.refresh();
      setTimeout(() => setSavedMsg(null), 3000);
    },
    onError: (e) => setSavedMsg(e.message),
  });

  const priceCents = Math.max(0, Math.round((parseFloat(price) || 0) * 100));
  const titleEmpty = title.trim().length === 0;
  const dirty =
    title !== course.title ||
    tagline !== (course.tagline ?? "") ||
    subject !== course.subject ||
    grade !== course.grade ||
    priceCents !== course.priceCents;

  return (
    <Field label="DETAILS">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DetailInput label="Title" value={title} onChange={setTitle} />
        <DetailInput
          label="Tagline"
          value={tagline}
          onChange={setTagline}
          placeholder="Optional one-liner"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <DetailInput label="Subject" value={subject} onChange={setSubject} />
          <DetailInput label="Grade" value={grade} onChange={setGrade} />
        </div>
        <DetailInput
          label="Price · USD"
          value={price}
          onChange={setPrice}
          type="number"
        />
        <button
          type="button"
          disabled={!dirty || titleEmpty || update.isPending}
          onClick={() =>
            update.mutate({
              courseId: course.id,
              title: title.trim(),
              tagline: tagline.trim(),
              subject: subject.trim(),
              grade: grade.trim(),
              priceCents,
            })
          }
          style={{
            padding: "8px",
            borderRadius: 7,
            border: "none",
            background: tone.ink,
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor:
              !dirty || titleEmpty || update.isPending ? "default" : "pointer",
            opacity: !dirty || titleEmpty || update.isPending ? 0.55 : 1,
            fontFamily: tone.sans,
          }}
        >
          {update.isPending ? "Saving…" : "Save course details"}
        </button>
        {savedMsg && (
          <div
            style={{
              fontSize: 11,
              color: update.isError ? tone.accent : GOOD,
            }}
          >
            {update.isError ? savedMsg : `✓ ${savedMsg}`}
          </div>
        )}
      </div>
    </Field>
  );
}

function DetailInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        flex: 1,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: tone.mono,
          fontSize: 9,
          color: tone.mute,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={type === "number" ? 0 : undefined}
        style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}
      />
    </label>
  );
}
