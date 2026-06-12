"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/react";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";

/**
 * Teacher assignments hub (REQUIREMENTS R12): post "do this lesson by
 * the due date" work items + see live completion counts. Students see
 * posted assignments on their dashboard's "Due this week" card, and
 * completing the target lesson awards the bonus XP once.
 */
export function AssignmentsClient() {
  const utils = trpc.useUtils();
  const options = trpc.assignment.lessonOptions.useQuery();
  const list = trpc.assignment.listMine.useQuery();

  const [courseId, setCourseId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [xp, setXp] = useState(20);
  const [error, setError] = useState<string | null>(null);

  const courses = useMemo(() => options.data ?? [], [options.data]);
  const activeCourse = useMemo(
    () => courses.find((c) => c.courseId === courseId) ?? courses[0] ?? null,
    [courses, courseId]
  );
  const lessons = activeCourse?.lessons ?? [];

  const create = trpc.assignment.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setDue("");
      setError(null);
      utils.assignment.listMine.invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const remove = trpc.assignment.delete.useMutation({
    onSuccess: () => utils.assignment.listMine.invalidate(),
  });

  const selectedLessonId = lessonId || lessons[0]?.id || "";
  const canPost =
    !!selectedLessonId && title.trim().length > 0 && !!due && !create.isPending;

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  const selectStyle: React.CSSProperties = {
    padding: "8px 10px",
    border: "1px solid var(--wf-hairline)",
    borderRadius: 4,
    fontSize: 13,
    background: "var(--wf-paper, transparent)",
    color: "inherit",
    minWidth: 0,
  };

  return (
    <div style={{ padding: "24px 28px 40px", maxWidth: 980 }}>
      <Eyebrow>Assignments</Eyebrow>
      <h1 className="wf-h1" style={{ fontSize: 26, margin: "6px 0 4px" }}>
        Post work, see who finished
      </h1>
      <div
        style={{
          fontSize: 13,
          color: "var(--wf-body)",
          marginBottom: 20,
          maxWidth: 620,
        }}
      >
        An assignment points students at one lesson with a due date.
        Enrolled students see it on their dashboard; completing the lesson
        earns the bonus XP.
      </div>

      {/* ── Create form ── */}
      <Card p={18} style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label style={{ display: "grid", gap: 4, flex: "1 1 180px" }}>
            <span style={{ fontSize: 10 }} className="wf-mono">
              COURSE
            </span>
            <select
              value={activeCourse?.courseId ?? ""}
              onChange={(e) => {
                setCourseId(e.target.value);
                setLessonId("");
              }}
              style={selectStyle}
            >
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.courseTitle}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, flex: "1 1 200px" }}>
            <span style={{ fontSize: 10 }} className="wf-mono">
              LESSON
            </span>
            <select
              value={selectedLessonId}
              onChange={(e) => setLessonId(e.target.value)}
              style={selectStyle}
            >
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, flex: "2 1 220px" }}>
            <span style={{ fontSize: 10 }} className="wf-mono">
              TITLE
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Finish Multiplying Fractions by Friday"
              maxLength={160}
              style={selectStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4, flex: "0 1 150px" }}>
            <span style={{ fontSize: 10 }} className="wf-mono">
              DUE
            </span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              style={selectStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4, flex: "0 1 90px" }}>
            <span style={{ fontSize: 10 }} className="wf-mono">
              BONUS XP
            </span>
            <input
              type="number"
              min={0}
              max={200}
              value={xp}
              onChange={(e) => setXp(Number(e.target.value) || 0)}
              style={selectStyle}
            />
          </label>
          <Btn
            variant="primary"
            disabled={!canPost}
            onClick={() => {
              if (!canPost) return;
              create.mutate({
                lessonId: selectedLessonId,
                title: title.trim(),
                // End-of-day local so "due Friday" includes Friday.
                dueAt: new Date(`${due}T23:59:00`),
                xp,
              });
            }}
          >
            {create.isPending ? "Posting…" : "Post assignment"}
          </Btn>
        </div>
        {error && (
          <div
            style={{ marginTop: 10, fontSize: 12, color: "var(--wf-bad)" }}
          >
            {error}
          </div>
        )}
        {courses.length === 0 && !options.isLoading && (
          <div
            style={{ marginTop: 10, fontSize: 12, color: "var(--wf-mute)" }}
          >
            Create a course with at least one lesson first — assignments
            point at a lesson.
          </div>
        )}
      </Card>

      {/* ── Posted list ── */}
      <Eyebrow style={{ marginBottom: 10 }}>Posted</Eyebrow>
      {list.isLoading ? (
        <Card p={20} style={{ color: "var(--wf-mute)", fontSize: 13 }}>
          Loading…
        </Card>
      ) : (list.data ?? []).length === 0 ? (
        <Card p={20} style={{ color: "var(--wf-mute)", fontSize: 13 }}>
          Nothing posted yet. Your first assignment will show up on every
          enrolled student&apos;s dashboard.
        </Card>
      ) : (
        <Card p={0}>
          {(list.data ?? []).map((a, i) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom:
                  i < (list.data ?? []).length - 1
                    ? "1px solid var(--wf-hairline)"
                    : "none",
                flexWrap: "wrap",
              }}
            >
              <Icon name="check" size={14} color="var(--wf-accent)" />
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--wf-mute)",
                    marginTop: 2,
                  }}
                >
                  {a.courseTitle} · {a.lessonTitle}
                </div>
              </div>
              <span
                className="wf-mono"
                style={{ fontSize: 11, color: "var(--wf-body)" }}
              >
                due {fmtDate(a.dueAt)}
              </span>
              <span
                className="wf-mono"
                style={{ fontSize: 11, color: "var(--wf-mute)" }}
              >
                +{a.xp} XP
              </span>
              <span
                className="wf-mono"
                style={{
                  fontSize: 11,
                  color:
                    a.completed >= a.enrolled && a.enrolled > 0
                      ? "var(--wf-good)"
                      : "var(--wf-body)",
                }}
              >
                {a.completed}/{a.enrolled} done
              </span>
              <Btn
                sm
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ assignmentId: a.id })}
              >
                Delete
              </Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
