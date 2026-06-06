"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { Annot, Btn, Card, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const FIELD: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  color: "var(--wf-ink)",
  padding: "9px 11px",
  background: "white",
  borderRadius: 4,
  border: "1px solid var(--wf-hairline)",
  outline: "none",
  fontFamily: "var(--font-sans-stack)",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--wf-mute)",
  letterSpacing: "0.02em",
  marginBottom: 6,
};

/**
 * Manual course creation — the DEFAULT "New course" flow. The teacher
 * names the course and picks subject/grade; we create an empty DRAFT
 * and drop them straight into the builder to author units by hand.
 * Generating with AI is the secondary option (the card at the bottom →
 * /teacher/courses/new/ai).
 */
export default function NewCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("6");
  const [tagline, setTagline] = useState("");
  const [priceUsd, setPriceUsd] = useState("0");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createCourse = trpc.teacher.createCourse.useMutation({
    onSuccess: ({ slug }) => router.push(`/teacher/courses/${slug}/edit`),
    onError: (e) => setErrorMsg(e.message),
  });

  const canSubmit =
    title.trim().length >= 3 &&
    subject.trim().length >= 1 &&
    !createCourse.isPending;

  const submit = () => {
    setErrorMsg(null);
    const dollars = Number.parseFloat(priceUsd);
    const priceCents =
      Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
    createCourse.mutate({
      title: title.trim(),
      subject: subject.trim(),
      grade,
      tagline: tagline.trim() || undefined,
      priceCents,
    });
  };

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
          <Icon name="arrow" size={14} style={{ transform: "rotate(180deg)" }} />
        </Link>
        <span style={{ fontSize: 13, fontWeight: 600 }}>New course</span>
        <Annot style={{ marginLeft: 8 }}>Build it your way</Annot>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "40px 28px",
          background: "var(--wf-fillsoft)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 560, maxWidth: "100%" }}>
          <div style={{ marginBottom: 18 }}>
            <h1 className="wf-h1" style={{ fontSize: 22, marginBottom: 4 }}>
              Create a course
            </h1>
            <p style={{ fontSize: 13, color: "var(--wf-body)", lineHeight: 1.5 }}>
              Start from a blank course and build your units and lessons by
              hand. You can add an AI-generated draft any time from inside the
              builder.
            </p>
          </div>

          <Card p={22}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) submit();
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="course-title" style={LABEL}>
                  Course title
                </label>
                <input
                  id="course-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Foundations of Algebra"
                  autoFocus
                  style={{ ...FIELD, fontSize: 15, fontWeight: 600 }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label htmlFor="course-subject" style={LABEL}>
                    Subject
                  </label>
                  <input
                    id="course-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Math"
                    list="subject-suggestions"
                    style={FIELD}
                  />
                  <datalist id="subject-suggestions">
                    {["Math", "Science", "English", "History", "Art", "Music", "Computer Science"].map(
                      (s) => (
                        <option key={s} value={s} />
                      )
                    )}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="course-grade" style={LABEL}>
                    Grade
                  </label>
                  <select
                    id="course-grade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    style={{ ...FIELD, cursor: "pointer" }}
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g === "K" ? "Kindergarten" : `Grade ${g}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="course-tagline" style={LABEL}>
                  Tagline <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="course-tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="One line students see on the course card"
                  style={FIELD}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label htmlFor="course-price" style={LABEL}>
                  Price (USD) <span style={{ fontWeight: 400 }}>— leave 0 for free</span>
                </label>
                <input
                  id="course-price"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  style={{ ...FIELD, width: 140 }}
                />
              </div>

              {errorMsg && (
                <div
                  style={{
                    marginBottom: 14,
                    fontSize: 12,
                    color: "var(--wf-accent)",
                    padding: "8px 11px",
                    border: "1px solid var(--wf-accent)",
                    background: "var(--wf-accent-soft)",
                    borderRadius: 4,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              <Btn
                variant="primary"
                full
                type="submit"
                disabled={!canSubmit}
              >
                {createCourse.isPending
                  ? "Creating course…"
                  : "Create course & open builder →"}
              </Btn>
            </form>
          </Card>

          {/* Secondary: AI generation */}
          <Card
            p={16}
            style={{
              marginTop: 16,
              background: "var(--wf-ai-soft)",
              borderColor: "var(--wf-ai)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Icon name="sparkles" size={18} color="var(--wf-ai)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--wf-ink)" }}>
                  In a hurry? Generate with AI
                </div>
                <div style={{ fontSize: 12, color: "var(--wf-body)", marginTop: 2 }}>
                  Describe what you want to teach and get a full unit outline to
                  edit.
                </div>
              </div>
              <Link href="/teacher/courses/new/ai" style={{ textDecoration: "none" }}>
                <Btn
                  variant="ai"
                  sm
                  icon={<Icon name="sparkles" size={13} color="var(--wf-ai)" />}
                >
                  Use AI builder
                </Btn>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </TeacherChrome>
  );
}
