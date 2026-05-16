"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

type Lesson = {
  id: string;
  slug: string | null;
  title: string;
  durationMin: number | null;
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
  const [settings, setSettings] = useState<Record<string, boolean>>({
    "Adaptive difficulty": true,
    "Show hints": true,
    "Allow AI tutor": true,
    "Required to pass": true,
    "Allow retake": true,
  });

  const allLessons = useMemo(
    () =>
      course.units.flatMap((u) =>
        u.lessons.map((l) => ({
          id: l.id,
          label: `${u.title} · ${l.title}`,
        }))
      ),
    [course.units]
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

  const totalLessons = course.units.reduce(
    (a, u) => a + u.lessons.length,
    0
  );
  const totalDuration = course.units.reduce(
    (a, u) =>
      a + u.lessons.reduce((b, l) => b + (l.durationMin ?? 0), 0),
    0
  );
  const summary = `For Grade ${course.grade} · ${course.units.length} units · ${totalLessons} lessons${
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

          {course.units.length === 0 ? (
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
            course.units.map((u, i) => {
              const isOpen = openUnit === i;
              return (
                <Card
                  key={u.id}
                  p={0}
                  style={{ maxWidth: 720, margin: "0 auto 10px" }}
                >
                  <button
                    onClick={() => setOpenUnit(isOpen ? -1 : i)}
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderBottom: isOpen
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="drag" size={14} color="var(--wf-mute)" />
                    <span
                      className="wf-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        width: 50,
                      }}
                    >
                      Unit {u.order}
                    </span>
                    <span
                      style={{ fontSize: 14, fontWeight: 600, flex: 1 }}
                    >
                      {u.title}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                      {u.estLabel ?? `${u.lessons.length} lessons`}
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
                  {isOpen && (
                    <div style={{ padding: "10px 18px 14px 60px" }}>
                      {u.lessons.length === 0 ? (
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
                        u.lessons.map((l) => (
                          <div
                            key={l.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 10px",
                              marginBottom: 4,
                              border: "1px solid var(--wf-hairline)",
                              borderRadius: 3,
                              background: "white",
                              fontSize: 12,
                            }}
                          >
                            <Icon
                              name="drag"
                              size={12}
                              color="var(--wf-mute)"
                            />
                            <Icon name="play" size={13} color="var(--wf-body)" />
                            <span style={{ flex: 1, fontWeight: 500 }}>
                              {l.title}
                            </span>
                            <span
                              className="wf-mono"
                              style={{
                                fontSize: 10,
                                color: "var(--wf-mute)",
                              }}
                            >
                              {l.durationMin
                                ? `${l.durationMin} min`
                                : ""}
                            </span>
                          </div>
                        ))
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
                        + DROP A BLOCK HERE · OR ASK AI TO ADD A LESSON
                      </Hatch>
                    </div>
                  )}
                </Card>
              );
            })
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
