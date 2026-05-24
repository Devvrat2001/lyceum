"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import {
  Annot,
  Btn,
  Card,
  Icon,
} from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

const DEFAULT_BRIEF =
  "A 5-unit course on basic algebra for Grade 6. Heavy on visual examples. Include a project where students model their family's grocery budget with variables.";

type Settings = {
  grade: string;
  subject: string;
  standard: string;
  lengthLabel: string;
  style: string;
  tone: string;
  difficulty: string;
};

const DEFAULT_SETTINGS: Settings = {
  grade: "Grade 6",
  subject: "Math · Algebra",
  standard: "CCSS 6.EE.A,B,C",
  lengthLabel: "~8 hours · 24 lessons",
  style: "Visual / interactive",
  tone: "Friendly, encouraging",
  difficulty: "Gentle ramp",
};

const SETTING_LABELS: { key: keyof Settings; label: string }[] = [
  { key: "grade", label: "Grade level" },
  { key: "subject", label: "Subject" },
  { key: "standard", label: "Standard" },
  { key: "lengthLabel", label: "Length" },
  { key: "style", label: "Style" },
  { key: "tone", label: "Tone" },
  { key: "difficulty", label: "Difficulty curve" },
];

export default function AIGeneratorPage() {
  const router = useRouter();
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [editingSetting, setEditingSetting] = useState<keyof Settings | null>(
    null
  );
  const [outline, setOutline] = useState<{
    title: string;
    tagline: string;
    description: string;
    units: {
      shortLabel: string;
      title: string;
      subtitle: string;
      // Full per-lesson shape — keeping all three fields here so the
      // outline state object can be passed straight into
      // `generator.regenerateUnit` without a cast or shape narrowing.
      lessons: {
        title: string;
        summary: string;
        readingContent: string;
      }[];
      durationLabel: string;
    }[];
  } | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateOutline = trpc.generator.outline.useMutation({
    onSuccess: (r) => {
      setOutline(r.outline);
      setElapsedMs(r.elapsedMs);
      setErrorMsg(null);
    },
    onError: (e) => setErrorMsg(e.message),
  });

  const regenerateUnit = trpc.generator.regenerateUnit.useMutation({
    onMutate: ({ unitIndex }) => setRegenIdx(unitIndex),
    onSuccess: (r, vars) => {
      setOutline((prev) =>
        prev
          ? {
              ...prev,
              units: prev.units.map((u, i) =>
                i === vars.unitIndex ? r.unit : u
              ),
            }
          : prev
      );
      setRegenIdx(null);
    },
    onError: (e) => {
      setRegenIdx(null);
      setErrorMsg(e.message);
    },
  });

  const saveAsCourse = trpc.generator.saveAsCourse.useMutation({
    onSuccess: ({ slug }) => {
      router.push(`/teacher/courses/${slug}/edit`);
    },
    onError: (e) => setErrorMsg(e.message),
  });

  const hasOutline = outline !== null;

  return (
    <TeacherChrome active="courses">
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
        <Link href="/teacher" style={{ color: "inherit" }}>
          <Icon
            name="arrow"
            size={14}
            style={{ transform: "rotate(180deg)" }}
          />
        </Link>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          New course · AI builder
        </span>
        <Annot ai style={{ marginLeft: 8 }}>
          {hasOutline ? "Step 2 of 4" : "Step 1 of 4"}
        </Annot>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" sm disabled>
          Save draft
        </Btn>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "32px 28px",
          background: "var(--wf-fillsoft)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 1080,
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: 24,
          }}
        >
          {/* Left — prompt */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Icon name="sparkles" size={18} color="var(--wf-ai)" />
              <h1 className="wf-h1" style={{ fontSize: 22 }}>
                Describe your course
              </h1>
            </div>
            <Card p={18} style={{ marginBottom: 14 }}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                PROMPT
              </div>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={5}
                disabled={generateOutline.isPending}
                style={{
                  fontSize: 13,
                  color: "var(--wf-ink)",
                  lineHeight: 1.6,
                  padding: 10,
                  background: "var(--wf-fillsoft)",
                  borderRadius: 3,
                  border: "1px solid var(--wf-hairline)",
                  width: "100%",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "var(--font-sans-stack)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                {[
                  "+ Add lesson plan",
                  "+ Reference textbook",
                  "+ My standards",
                ].map((c) => (
                  <span key={c} className="wf-chip">
                    {c}
                  </span>
                ))}
              </div>
            </Card>

            <Card p={16} style={{ marginBottom: 14 }}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  marginBottom: 10,
                  letterSpacing: "0.04em",
                }}
              >
                SETTINGS
              </div>
              {SETTING_LABELS.map(({ key, label }, i, arr) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom:
                      i < arr.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--wf-mute)" }}>{label}</span>
                  {editingSetting === key ? (
                    <input
                      autoFocus
                      value={settings[key]}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, [key]: e.target.value }))
                      }
                      onBlur={() => setEditingSetting(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape")
                          setEditingSetting(null);
                      }}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        textAlign: "right",
                        border: "1px solid var(--wf-line)",
                        borderRadius: 3,
                        padding: "2px 6px",
                        outline: "none",
                        background: "white",
                        width: 220,
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingSetting(key)}
                      style={{
                        background: "transparent",
                        border: "none",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "right",
                        padding: 0,
                        color: "inherit",
                      }}
                    >
                      {settings[key]}
                    </button>
                  )}
                </div>
              ))}
            </Card>

            <Btn
              variant="ai"
              full
              disabled={generateOutline.isPending || brief.trim().length < 20}
              icon={<Icon name="sparkles" size={14} color="var(--wf-ai)" />}
              onClick={() => {
                setErrorMsg(null);
                generateOutline.mutate({ brief, settings });
              }}
            >
              {generateOutline.isPending
                ? "Generating outline…"
                : hasOutline
                ? "Regenerate outline"
                : "Generate outline"}
            </Btn>
            {errorMsg && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: "var(--wf-accent)",
                  padding: "6px 10px",
                  border: "1px solid var(--wf-accent)",
                  background: "var(--wf-accent-soft)",
                  borderRadius: 4,
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* Right — preview */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <h2 className="wf-h2" style={{ fontSize: 16 }}>
                Generated outline
              </h2>
              <Annot ai>
                Editable · click ✦ to regenerate any unit · click any value to edit
              </Annot>
              <div style={{ flex: 1 }} />
              {elapsedMs !== null && (
                <span
                  className="wf-mono"
                  style={{ fontSize: 11, color: "var(--wf-mute)" }}
                >
                  ● Generated in {(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            {generateOutline.isPending && !hasOutline ? (
              <Card p={32} style={{ textAlign: "center" }}>
                <div
                  className="wf-pulse"
                  style={{
                    fontSize: 13,
                    color: "var(--wf-mute)",
                  }}
                >
                  Drafting your course outline…
                </div>
              </Card>
            ) : !hasOutline ? (
              <Card p={32} style={{ textAlign: "center" }}>
                <Icon name="sparkles" size={24} color="var(--wf-ai)" />
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Describe your course, then hit Generate.
                </div>
                <div style={{ fontSize: 12, color: "var(--wf-mute)" }}>
                  We&apos;ll suggest 4–6 units with a real-world capstone.
                </div>
              </Card>
            ) : (
              <Card p={20}>
                <div
                  className="wf-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--wf-mute)",
                    letterSpacing: "0.04em",
                    marginBottom: 4,
                  }}
                >
                  COURSE NAME · EDIT BEFORE SAVING
                </div>
                <input
                  className="wf-serif"
                  value={outline!.title}
                  onChange={(e) =>
                    setOutline((p) =>
                      p ? { ...p, title: e.target.value } : p
                    )
                  }
                  aria-label="Course title"
                  placeholder="Course title"
                  style={{
                    width: "100%",
                    fontSize: 19,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: "var(--wf-ink)",
                    border: "1px solid var(--wf-hairline)",
                    borderRadius: 3,
                    padding: "6px 8px",
                    background: "white",
                    outline: "none",
                  }}
                />
                <input
                  value={outline!.tagline}
                  onChange={(e) =>
                    setOutline((p) =>
                      p ? { ...p, tagline: e.target.value } : p
                    )
                  }
                  aria-label="Course tagline"
                  placeholder="One-line tagline"
                  style={{
                    width: "100%",
                    fontSize: 12,
                    color: "var(--wf-body)",
                    marginBottom: 8,
                    fontStyle: "italic",
                    border: "1px solid var(--wf-hairline)",
                    borderRadius: 3,
                    padding: "5px 8px",
                    background: "white",
                    outline: "none",
                  }}
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--wf-body)",
                    marginBottom: 16,
                    lineHeight: 1.5,
                  }}
                >
                  {outline!.description}
                </div>

                {outline!.units.map((u, i, arr) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "12px 0",
                      borderBottom:
                        i < arr.length - 1
                          ? "1px solid var(--wf-hairline)"
                          : "none",
                      opacity: regenIdx === i ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <Icon
                      name="drag"
                      size={14}
                      color="var(--wf-mute)"
                      style={{ marginTop: 2 }}
                    />
                    <span
                      className="wf-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        marginTop: 2,
                        width: 50,
                      }}
                    >
                      {u.shortLabel}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          marginBottom: 3,
                        }}
                      >
                        {u.title}
                      </div>
                      <div
                        style={{ fontSize: 12, color: "var(--wf-body)" }}
                      >
                        {u.subtitle}
                      </div>
                      <div
                        className="wf-mono"
                        style={{
                          fontSize: 10,
                          color: "var(--wf-mute)",
                          marginTop: 4,
                        }}
                      >
                        {u.lessons.length} lessons · {u.durationLabel}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() =>
                          regenerateUnit.mutate({
                            brief,
                            settings,
                            outline: outline!,
                            unitIndex: i,
                          })
                        }
                        disabled={regenerateUnit.isPending}
                        aria-label="Regenerate"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: regenerateUnit.isPending
                            ? "wait"
                            : "pointer",
                          padding: 4,
                        }}
                      >
                        <Icon
                          name="sparkles"
                          size={14}
                          color="var(--wf-ai)"
                        />
                      </button>
                      <button
                        aria-label="Settings"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                        }}
                      >
                        <Icon name="cog" size={14} color="var(--wf-mute)" />
                      </button>
                    </div>
                  </div>
                ))}

                <div
                  style={{
                    borderTop: "1px solid var(--wf-hairline)",
                    marginTop: 14,
                    paddingTop: 14,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <Btn
                    variant="ghost"
                    sm
                    icon={<Icon name="plus" size={11} />}
                  >
                    Add unit
                  </Btn>
                  <div style={{ flex: 1 }} />
                  <Btn
                    variant="primary"
                    sm
                    disabled={saveAsCourse.isPending}
                    onClick={() =>
                      saveAsCourse.mutate({
                        outline: outline!,
                        settings,
                        brief,
                      })
                    }
                  >
                    {saveAsCourse.isPending
                      ? "Creating course…"
                      : "Save & open editor →"}
                  </Btn>
                </div>
              </Card>
            )}

            {hasOutline && (
              <Card
                p={14}
                style={{
                  marginTop: 14,
                  background: "var(--wf-ai-soft)",
                  borderColor: "var(--wf-ai)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <Icon name="sparkles" size={14} color="var(--wf-ai)" />
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--wf-body)",
                      flex: 1,
                    }}
                  >
                    <b style={{ color: "var(--wf-ai)" }}>Heads up:</b>{" "}
                    Saving creates this as a DRAFT course owned by you.
                    You can keep editing in the course builder before
                    publishing.
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TeacherChrome>
  );
}
