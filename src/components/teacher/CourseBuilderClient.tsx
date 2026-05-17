"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import {
  Annot,
  Btn,
  Card,
  Eyebrow,
  Hatch,
  Icon,
  Toggle,
} from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { AddBlockPopover } from "@/components/teacher/AddBlockPopover";
import { findBlockMeta, type BlockType } from "@/lib/blocks";

type LessonBlock = {
  id: string;
  type: BlockType;
  order: number;
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
  estLabel: string | null;
  lessons: Lesson[];
};

type CourseProps = {
  id: string;
  slug: string;
  title: string;
  status: string;
  subject: string;
  grade: string;
  priceCents: number;
  updatedAt: string;
  units: Unit[];
};

type BlockItem = { ic: string; l: string; ai?: boolean };
type BlockGroup = { g: string; items: BlockItem[] };

const BLOCKS: BlockGroup[] = [
  {
    g: "Content",
    items: [
      { ic: "play", l: "Video" },
      { ic: "book", l: "Reading" },
      { ic: "grid", l: "Slides" },
      { ic: "download", l: "PDF / file" },
    ],
  },
  {
    g: "Practice",
    items: [
      { ic: "star", l: "Quiz" },
      { ic: "check", l: "Multiple choice" },
      { ic: "mic", l: "Speak / record" },
      { ic: "sparkles", l: "AI quiz", ai: true },
    ],
  },
  {
    g: "Interactive",
    items: [
      { ic: "bolt", l: "Simulation" },
      { ic: "branch", l: "Branching scenario" },
      { ic: "grid", l: "Drag & match" },
      { ic: "chart", l: "Live poll" },
    ],
  },
  {
    g: "Structure",
    items: [
      { ic: "plus", l: "Section break" },
      { ic: "chat", l: "Discussion thread" },
      { ic: "user", l: "Live session" },
    ],
  },
];

function fmtPrice(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}`;
}

export function CourseBuilderClient({ course }: { course: CourseProps }) {
  const [openUnit, setOpenUnit] = useState(0);
  // Local mirror of units so drag operations can update the UI
  // optimistically without waiting for the server roundtrip. Mutations
  // roll this back on error.
  const [units, setUnits] = useState<Unit[]>(course.units);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, boolean>>({
    "Adaptive difficulty": true,
    "Show hints": true,
    "Allow AI tutor": true,
    "Required to pass": true,
    "Allow retake": true,
  });

  // PointerSensor with a small activation distance prevents accidental
  // drags when the teacher just means to click the unit header to
  // expand it. 6px is the empirically-comfortable threshold.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const reorderUnits = trpc.teacher.reorderUnits.useMutation({
    onError: (e) => {
      setReorderError(`Failed to save unit order: ${e.message}`);
      setUnits(course.units); // hard rollback to last server state
    },
  });
  const reorderLessons = trpc.teacher.reorderLessons.useMutation({
    onError: (e) => {
      setReorderError(`Failed to save lesson order: ${e.message}`);
      setUnits(course.units);
    },
  });

  // Append the freshly-created block to its lesson's local list.
  // Avoids a course refetch for what's already-persisted server-side.
  const handleBlockAdded = (lessonId: string, block: LessonBlock) => {
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === lessonId ? { ...l, blocks: [...l.blocks, block] } : l
        ),
      }))
    );
  };

  const deleteBlock = trpc.teacher.deleteBlock.useMutation({
    onError: (e) => setReorderError(`Failed to delete block: ${e.message}`),
  });

  const reorderBlocks = trpc.teacher.reorderBlocks.useMutation({
    onError: (e) => {
      setReorderError(`Failed to save block order: ${e.message}`);
      setUnits(course.units);
    },
  });

  const handleBlockDragEnd =
    (lessonId: string) => (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      // Find the lesson in local state — we mutate its `blocks`
      // array. Walking units+lessons is fine at the cardinalities
      // we expect (≤20 units × ≤30 lessons).
      let unitIdx = -1;
      let lessonIdx = -1;
      for (let i = 0; i < units.length; i++) {
        const li = units[i].lessons.findIndex((l) => l.id === lessonId);
        if (li !== -1) {
          unitIdx = i;
          lessonIdx = li;
          break;
        }
      }
      if (unitIdx === -1) return;
      const blocks = units[unitIdx].lessons[lessonIdx].blocks;
      const oldIdx = blocks.findIndex((b) => b.id === active.id);
      const newIdx = blocks.findIndex((b) => b.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const nextBlocks = arrayMove(blocks, oldIdx, newIdx);
      const nextUnits = units.map((u, ui) =>
        ui !== unitIdx
          ? u
          : {
              ...u,
              lessons: u.lessons.map((l, li) =>
                li === lessonIdx ? { ...l, blocks: nextBlocks } : l
              ),
            }
      );
      setUnits(nextUnits);
      setReorderError(null);
      reorderBlocks.mutate({
        lessonId,
        blockIds: nextBlocks.map((b) => b.id),
      });
    };

  const handleBlockDelete = (lessonId: string, blockId: string) => {
    // Optimistic remove; if the mutation errors, the onError handler
    // surfaces the message but we leave the optimistic state alone —
    // user can retry the delete (or refresh) without us snapping the
    // block back into the list mid-interaction.
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === lessonId
            ? { ...l, blocks: l.blocks.filter((b) => b.id !== blockId) }
            : l
        ),
      }))
    );
    deleteBlock.mutate({ blockId });
  };

  const handleUnitDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = units.findIndex((u) => u.id === active.id);
    const newIdx = units.findIndex((u) => u.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(units, oldIdx, newIdx);
    setUnits(next);
    setReorderError(null);
    reorderUnits.mutate({
      courseId: course.id,
      unitIds: next.map((u) => u.id),
    });
  };

  const handleLessonDragEnd = (unitId: string) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const unitIdx = units.findIndex((u) => u.id === unitId);
    if (unitIdx === -1) return;
    const lessons = units[unitIdx].lessons;
    const oldIdx = lessons.findIndex((l) => l.id === active.id);
    const newIdx = lessons.findIndex((l) => l.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const nextLessons = arrayMove(lessons, oldIdx, newIdx);
    const nextUnits = units.map((u, i) =>
      i === unitIdx ? { ...u, lessons: nextLessons } : u
    );
    setUnits(nextUnits);
    setReorderError(null);
    reorderLessons.mutate({
      unitId,
      lessonIds: nextLessons.map((l) => l.id),
    });
  };

  const allLessons = useMemo(
    () =>
      units.flatMap((u) =>
        u.lessons.map((l) => ({
          id: l.id,
          label: `${u.title} · ${l.title}`,
        }))
      ),
    [units]
  );
  const [genLessonId, setGenLessonId] = useState<string>(
    allLessons[0]?.id ?? ""
  );
  const [genCount, setGenCount] = useState(5);
  const [genFeedback, setGenFeedback] = useState<string | null>(null);

  const generateQuestions = trpc.generator.generateQuestions.useMutation({
    onSuccess: (r) => {
      setGenFeedback(
        `Added ${r.added} question${r.added === 1 ? "" : "s"} (${(
          r.elapsedMs / 1000
        ).toFixed(1)}s)`
      );
      setTimeout(() => setGenFeedback(null), 4500);
    },
    onError: (e) => setGenFeedback(`Failed: ${e.message}`),
  });

  const totalLessons = units.reduce((a, u) => a + u.lessons.length, 0);
  const totalDuration = units.reduce(
    (a, u) =>
      a + u.lessons.reduce((b, l) => b + (l.durationMin ?? 0), 0),
    0
  );
  const summary = `For Grade ${course.grade} · ${units.length} units · ${totalLessons} lessons${
    totalDuration > 0
      ? ` · ~${Math.round(totalDuration / 60)} hr`
      : ""
  }`;

  return (
    <>
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/teacher" style={{ color: "inherit" }}>
            <Icon
              name="arrow"
              size={14}
              style={{ transform: "rotate(180deg)" }}
            />
          </Link>
          <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
            My courses /
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {course.title} · Editor
          </span>
          <span className="wf-chip" style={{ marginLeft: 6 }}>
            {course.status}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span
          className="wf-mono"
          style={{ fontSize: 11, color: "var(--wf-mute)" }}
        >
          ● Last saved {new Date(course.updatedAt).toLocaleString()}
        </span>
        <Link
          href={`/course/${course.slug}`}
          style={{ textDecoration: "none" }}
          target="_blank"
        >
          <Btn variant="ghost" sm>
            Preview as student
          </Btn>
        </Link>
        <Link href="/teacher/courses/new" style={{ textDecoration: "none" }}>
          <Btn
            variant="ai"
            sm
            icon={<Icon name="sparkles" size={12} color="var(--wf-ai)" />}
          >
            AI assist
          </Btn>
        </Link>
        <Btn variant="primary" sm>
          {course.status === "DRAFT" ? "Publish →" : "Update →"}
        </Btn>
      </header>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "220px minmax(0,1fr) 320px",
          overflow: "hidden",
        }}
      >
        {/* Block library */}
        <aside
          style={{
            borderRight: "1px solid var(--wf-hairline)",
            padding: "16px 14px",
            overflow: "auto",
            background: "var(--wf-fillsoft)",
          }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>Drag in blocks</Eyebrow>
          <Annot style={{ marginBottom: 14 }}>
            14 block types · drag onto canvas
          </Annot>
          {BLOCKS.map((grp) => (
            <div key={grp.g} style={{ marginBottom: 16 }}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 9,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                {grp.g.toUpperCase()}
              </div>
              {grp.items.map((it) => (
                <div
                  key={it.l}
                  className="wf-block-card"
                  data-ai={Boolean(it.ai)}
                  draggable
                >
                  <Icon name="drag" size={12} color="var(--wf-mute)" />
                  <Icon name={it.ic as "play"} size={13} color="currentColor" />
                  <span>{it.l}</span>
                  {it.ai && (
                    <span
                      className="wf-mono"
                      style={{
                        fontSize: 8,
                        color: "var(--wf-ai)",
                        marginLeft: "auto",
                      }}
                    >
                      AI
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </aside>

        {/* Structure canvas */}
        <div
          style={{
            overflow: "auto",
            padding: "24px 32px",
            background: "var(--wf-fillsoft)",
          }}
        >
          <Card
            p={20}
            style={{
              maxWidth: 720,
              margin: "0 auto 16px",
              background: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 6,
              }}
            >
              <Eyebrow>Course structure</Eyebrow>
              <Annot ai>Editable · drag to reorder</Annot>
            </div>
            <div
              style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}
            >
              {course.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--wf-mute)",
                marginBottom: 12,
              }}
            >
              {summary}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="wf-chip">Subject: {course.subject}</span>
              <span className="wf-chip">Grade: {course.grade}</span>
              <span className="wf-chip">
                Pricing: {fmtPrice(course.priceCents)}
              </span>
            </div>
          </Card>

          {units.length === 0 ? (
            <Card
              p={28}
              style={{
                maxWidth: 720,
                margin: "0 auto",
                textAlign: "center",
              }}
            >
              <Eyebrow>No units yet</Eyebrow>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--wf-body)",
                }}
              >
                Add your first unit below or use AI assist.
              </div>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleUnitDragEnd}
            >
              <SortableContext
                items={units.map((u) => u.id)}
                strategy={verticalListSortingStrategy}
              >
                {units.map((u, i) => (
                  <SortableUnit
                    key={u.id}
                    unit={u}
                    index={i}
                    isOpen={openUnit === i}
                    onToggle={() => setOpenUnit(openUnit === i ? -1 : i)}
                    onLessonDragEnd={handleLessonDragEnd(u.id)}
                    onBlockAdded={handleBlockAdded}
                    onBlockDelete={handleBlockDelete}
                    onBlockDragEnd={handleBlockDragEnd}
                    sensors={sensors}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {reorderError && (
            <div
              style={{
                maxWidth: 720,
                margin: "8px auto 0",
                padding: 8,
                fontSize: 11,
                color: "var(--wf-accent)",
                border: "1px solid var(--wf-accent)",
                background: "var(--wf-accent-soft)",
                borderRadius: 4,
              }}
            >
              {reorderError}
            </div>
          )}

          <div style={{ maxWidth: 720, margin: "14px auto" }}>
            <Btn variant="ghost" full icon={<Icon name="plus" size={12} />}>
              Add unit
            </Btn>
          </div>
        </div>

        {/* Inspector */}
        <aside
          style={{
            borderLeft: "1px solid var(--wf-hairline)",
            padding: "18px 16px",
            overflow: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Eyebrow>Inspector</Eyebrow>
            <Annot>Course · {course.status}</Annot>
          </div>
          <h3 style={{ fontSize: 14, margin: "4px 0 14px" }}>
            {course.title}
          </h3>

          <Field label="STATS">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                fontSize: 12,
              }}
            >
              <div>
                <div className="wf-mono" style={{ fontSize: 9, color: "var(--wf-mute)" }}>
                  UNITS
                </div>
                <div
                  className="wf-serif"
                  style={{ fontSize: 18, fontWeight: 700 }}
                >
                  {course.units.length}
                </div>
              </div>
              <div>
                <div className="wf-mono" style={{ fontSize: 9, color: "var(--wf-mute)" }}>
                  LESSONS
                </div>
                <div
                  className="wf-serif"
                  style={{ fontSize: 18, fontWeight: 700 }}
                >
                  {totalLessons}
                </div>
              </div>
              <div>
                <div className="wf-mono" style={{ fontSize: 9, color: "var(--wf-mute)" }}>
                  PRICE
                </div>
                <div
                  className="wf-serif"
                  style={{ fontSize: 18, fontWeight: 700 }}
                >
                  {fmtPrice(course.priceCents)}
                </div>
              </div>
              <div>
                <div className="wf-mono" style={{ fontSize: 9, color: "var(--wf-mute)" }}>
                  STATUS
                </div>
                <div
                  className="wf-mono"
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  {course.status}
                </div>
              </div>
            </div>
          </Field>

          <Field label="LESSON DEFAULTS">
            {Object.keys(settings).map((key) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--wf-body)" }}>{key}</span>
                <Toggle
                  on={settings[key]}
                  onChange={(on) =>
                    setSettings((prev) => ({ ...prev, [key]: on }))
                  }
                />
              </div>
            ))}
          </Field>

          <Field label="GENERATE QUIZ QUESTIONS">
            <select
              value={genLessonId}
              onChange={(e) => setGenLessonId(e.target.value)}
              disabled={generateQuestions.isPending || allLessons.length === 0}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 11,
                border: "1px solid var(--wf-hairline)",
                borderRadius: 3,
                background: "white",
                marginBottom: 6,
              }}
            >
              {allLessons.length === 0 ? (
                <option value="">No lessons yet</option>
              ) : (
                allLessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))
              )}
            </select>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span
                className="wf-mono"
                style={{ fontSize: 10, color: "var(--wf-mute)" }}
              >
                COUNT
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={genCount}
                onChange={(e) =>
                  setGenCount(
                    Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                  )
                }
                disabled={generateQuestions.isPending}
                style={{
                  width: 50,
                  fontSize: 11,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  padding: "4px 6px",
                  textAlign: "center",
                  background: "white",
                }}
              />
              <span style={{ fontSize: 10, color: "var(--wf-mute)" }}>
                questions
              </span>
            </div>
            <Btn
              sm
              variant="ai"
              full
              disabled={generateQuestions.isPending || !genLessonId}
              icon={<Icon name="sparkles" size={11} color="var(--wf-ai)" />}
              onClick={() =>
                generateQuestions.mutate({
                  lessonId: genLessonId,
                  count: genCount,
                })
              }
            >
              {generateQuestions.isPending
                ? "Generating…"
                : `Generate ${genCount} question${genCount === 1 ? "" : "s"} with AI`}
            </Btn>
            {genFeedback && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: generateQuestions.isError
                    ? "var(--wf-accent)"
                    : "var(--wf-good)",
                }}
              >
                {generateQuestions.isError ? "" : "✓ "}
                {genFeedback}
              </div>
            )}
          </Field>

          <div
            style={{
              marginBottom: 14,
              padding: 12,
              border: "1px solid var(--wf-ai)",
              background: "var(--wf-ai-soft)",
              borderRadius: 4,
            }}
          >
            <div
              className="wf-mono"
              style={{
                fontSize: 10,
                color: "var(--wf-ai)",
                marginBottom: 6,
                letterSpacing: ".06em",
              }}
            >
              AI SUGGESTIONS
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--wf-body)",
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              {totalLessons < 5
                ? `This course has ${totalLessons} lesson${totalLessons === 1 ? "" : "s"}. Most published Grade ${course.grade} courses have 20–40. Add more units to improve completion.`
                : `Your average lesson length is ${Math.round(totalDuration / Math.max(1, totalLessons))} min. Consider splitting longer ones into 8-min chunks for better retention.`}
            </div>
            <Btn sm variant="ai" full>
              Apply suggestion
            </Btn>
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="wf-mono"
        style={{
          fontSize: 11,
          color: "var(--wf-mute)",
          marginBottom: 4,
          letterSpacing: ".04em",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Sortable unit card. The drag handle is the leading `drag` Icon
 * (so a click anywhere ELSE on the header still toggles expand/collapse)
 * — `listeners` and `attributes` are attached only to that icon's
 * wrapper. Lessons inside the open unit get their own nested
 * DndContext so dragging a lesson can never accidentally reorder the
 * units list.
 */
function SortableUnit({
  unit,
  index,
  isOpen,
  onToggle,
  onLessonDragEnd,
  onBlockAdded,
  onBlockDelete,
  onBlockDragEnd,
  sensors,
}: {
  unit: Unit;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onLessonDragEnd: (e: DragEndEvent) => void;
  onBlockAdded: (lessonId: string, block: LessonBlock) => void;
  onBlockDelete: (lessonId: string, blockId: string) => void;
  onBlockDragEnd: (lessonId: string) => (e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 5 : "auto",
    maxWidth: 720,
    margin: "0 auto 10px",
  };

  return (
    <Card ref={setNodeRef} p={0} style={style}>
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: isOpen ? "1px solid var(--wf-hairline)" : "none",
        }}
      >
        {/* Drag handle (separate so the header text/arrow can still click-toggle). */}
        <span
          {...attributes}
          {...listeners}
          aria-label={`Reorder Unit ${index + 1}`}
          style={{
            display: "inline-flex",
            cursor: "grab",
            padding: 2,
            touchAction: "none",
          }}
        >
          <Icon name="drag" size={14} color="var(--wf-mute)" />
        </span>
        <button
          onClick={onToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            background: "transparent",
            border: "none",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <span
            className="wf-mono"
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              width: 50,
            }}
          >
            Unit {unit.order}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
            {unit.title}
          </span>
          <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
            {unit.estLabel ?? `${unit.lessons.length} lessons`}
          </span>
          <Icon
            name="arrow"
            size={14}
            color="var(--wf-mute)"
            style={{
              transform: isOpen ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
          />
        </button>
      </div>
      {isOpen && (
        <div style={{ padding: "10px 18px 14px 60px" }}>
          {unit.lessons.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--wf-mute)",
                padding: "8px 0",
              }}
            >
              No lessons yet.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onLessonDragEnd}
            >
              <SortableContext
                items={unit.lessons.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {unit.lessons.map((l) => (
                  <SortableLesson
                    key={l.id}
                    lesson={l}
                    onBlockAdded={(block) => onBlockAdded(l.id, block)}
                    onBlockDelete={(blockId) => onBlockDelete(l.id, blockId)}
                    onBlockDragEnd={onBlockDragEnd(l.id)}
                    sensors={sensors}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
          <Hatch
            style={{
              padding: "12px 10px",
              borderRadius: 3,
              marginTop: 4,
              fontSize: 11,
              color: "var(--wf-mute)",
              textAlign: "center",
              fontFamily: "var(--font-mono-stack)",
              letterSpacing: "0.04em",
            }}
          >
            + USE THE BLOCK BUTTON ON ANY LESSON · OR ASK AI TO ADD A LESSON
          </Hatch>
        </div>
      )}
    </Card>
  );
}

function SortableLesson({
  lesson,
  onBlockAdded,
  onBlockDelete,
  onBlockDragEnd,
  sensors,
}: {
  lesson: Lesson;
  onBlockAdded: (block: LessonBlock) => void;
  onBlockDelete: (blockId: string) => void;
  onBlockDragEnd: (e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  // The sortable wrapper handles transform/opacity; the inner content
  // is a Card-like column so we can stack the row + block list.
  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    marginBottom: 4,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    border: "1px solid var(--wf-hairline)",
    borderRadius: 3,
    background: "white",
    fontSize: 12,
  };

  const count = lesson.blocks.length;

  return (
    <div ref={setNodeRef} style={wrapperStyle}>
      <div style={rowStyle}>
        <span
          {...attributes}
          {...listeners}
          aria-label={`Reorder lesson: ${lesson.title}`}
          style={{
            display: "inline-flex",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <Icon name="drag" size={12} color="var(--wf-mute)" />
        </span>
        <Icon name="play" size={13} color="var(--wf-body)" />
        <span style={{ flex: 1, fontWeight: 500 }}>{lesson.title}</span>
        <span
          className="wf-mono"
          style={{ fontSize: 10, color: "var(--wf-mute)" }}
          title={`${count} block${count === 1 ? "" : "s"}`}
        >
          {count} ▦
        </span>
        <span
          className="wf-mono"
          style={{ fontSize: 10, color: "var(--wf-mute)" }}
        >
          {lesson.durationMin ? `${lesson.durationMin} min` : ""}
        </span>
        <AddBlockPopover lessonId={lesson.id} onAdded={onBlockAdded} />
      </div>
      {/* Inline block list — one row per block, indented under the
          lesson header. Empty state suppressed (the count badge of 0
          is enough signal; rendering a placeholder here would just
          add noise). The blocks live in their OWN nested DndContext
          for the same reason lessons do — a block drag should never
          accidentally reorder its parent lesson. */}
      {count > 0 && (
        <div
          style={{
            marginLeft: 22,
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onBlockDragEnd}
          >
            <SortableContext
              items={lesson.blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {lesson.blocks.map((b) => (
                <SortableBlock
                  key={b.id}
                  block={b}
                  onDelete={() => onBlockDelete(b.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function SortableBlock({
  block,
  onDelete,
}: {
  block: LessonBlock;
  onDelete: () => void;
}) {
  const meta = findBlockMeta(block.type);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    border: "1px solid var(--wf-hairline)",
    borderRadius: 2,
    background: "var(--wf-fillsoft)",
    fontSize: 11,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${meta.label} block`}
        style={{
          display: "inline-flex",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        <Icon name="drag" size={10} color="var(--wf-mute)" />
      </span>
      <Icon
        name={meta.icon as "play"}
        size={11}
        color={meta.ai ? "var(--wf-ai)" : "var(--wf-body)"}
      />
      <span
        style={{
          flex: 1,
          color: meta.ai ? "var(--wf-ai)" : "var(--wf-ink)",
          fontWeight: 500,
        }}
      >
        {meta.label}
      </span>
      {meta.ai && (
        <span
          className="wf-mono"
          style={{
            fontSize: 8,
            color: "var(--wf-ai)",
            letterSpacing: "0.06em",
          }}
        >
          AI
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${meta.label} block`}
        title="Delete block"
        style={{
          border: "none",
          background: "transparent",
          color: "var(--wf-mute)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}
