import Link from "next/link";
import { notFound } from "next/navigation";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import {
  Avatar,
  Card,
  Eyebrow,
  Icon,
  Meter,
  XPChip,
  StreakChip,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { TRPCError } from "@trpc/server";

/**
 * Per-student detail page in the teacher gradebook. Linked from the
 * "View →" button on /teacher/students. Visibility is gated server-
 * side by `teacher.studentDetail` (the procedure rejects students who
 * aren't enrolled in any of this teacher's courses), so a teacher
 * can't deep-link to a student belonging to another teacher.
 *
 * Sections:
 *  - Identity strip: avatar + name + email + class + member-since +
 *    XP/streak chips.
 *  - Enrolled courses: one card per enrollment with a progress meter
 *    and the last-activity timestamp; the title links into the
 *    course's first lesson so the teacher can preview the student's
 *    view in two clicks.
 *  - Recent activity: last 25 attempts across this teacher's courses
 *    with a green/red dot, lesson + course label, and time-ago.
 */
export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const trpc = await getServerCaller();
  let student: Awaited<ReturnType<typeof trpc.teacher.studentDetail>>;
  try {
    student = await trpc.teacher.studentDetail({ studentId: id });
  } catch (err) {
    // 404 covers both "no such student" and "exists but not enrolled
    // in any of my courses" — same UX, same status code, deliberate
    // so a teacher can't enumerate students from another teacher.
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  const displayName =
    student.name ?? student.firstName ?? student.email.split("@")[0];
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <TeacherChrome active="students">
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
        <Link
          href="/teacher/students"
          style={{
            textDecoration: "none",
            fontSize: 12,
            color: "var(--wf-mute)",
          }}
        >
          ← Students
        </Link>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{displayName}</span>
        <div style={{ flex: 1 }} />
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {/* Identity strip */}
        <Card p={20} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar initials={initials} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="wf-serif"
                style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  marginTop: 4,
                }}
              >
                {student.email}
                {student.className ? ` · Class ${student.className}` : ""}
                {` · Joined ${new Date(student.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <XPChip value={student.xp} />
              {student.streak && student.streak.current > 0 ? (
                <StreakChip days={student.streak.current} />
              ) : null}
            </div>
          </div>
        </Card>

        {/* Enrolled courses */}
        <Card p={0} style={{ marginBottom: 16 }}>
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Eyebrow>Enrolled courses</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {student.enrollments.length} course
              {student.enrollments.length === 1 ? "" : "s"}
            </span>
          </div>
          {student.enrollments.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--wf-body)",
              }}
            >
              This student isn&apos;t enrolled in any of your courses.
            </div>
          ) : (
            student.enrollments.map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 18px",
                  borderBottom:
                    i < student.enrollments.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/teacher/courses/${e.course.slug}/edit`}
                    style={{
                      textDecoration: "none",
                      color: "var(--wf-ink)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {e.course.title}
                  </Link>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 3,
                    }}
                  >
                    {e.course.subject} · Enrolled{" "}
                    {new Date(e.enrolledAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {e.lastActivityAt
                      ? ` · Last active ${timeAgo(e.lastActivityAt)}`
                      : " · Not started"}
                  </div>
                </div>
                <div style={{ width: 180 }}>
                  <Meter value={e.progressPct} variant="accent" />
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 9,
                      color: "var(--wf-mute)",
                      marginTop: 3,
                    }}
                  >
                    {e.progressPct}% {e.completed ? "· Completed" : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Recent activity */}
        <Card p={0}>
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Eyebrow>Recent activity</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              Last {student.recentAttempts.length} attempt
              {student.recentAttempts.length === 1 ? "" : "s"}
            </span>
          </div>
          {student.recentAttempts.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--wf-body)",
              }}
            >
              No quiz attempts yet.
            </div>
          ) : (
            student.recentAttempts.map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 18px",
                  borderBottom:
                    i < student.recentAttempts.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                }}
              >
                <Icon
                  name={a.correct ? "check" : "dot"}
                  size={14}
                  color={a.correct ? "var(--wf-good)" : "var(--wf-accent)"}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {a.lesson.slug ? (
                    <Link
                      href={`/student/lesson/${a.lesson.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "var(--wf-ink)",
                        fontSize: 13,
                      }}
                    >
                      {a.lesson.title}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 13 }}>{a.lesson.title}</span>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 2,
                    }}
                  >
                    {a.lesson.unit.course.title} ·{" "}
                    {a.correct ? "Correct" : "Wrong"} · {timeAgo(a.createdAt)}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </TeacherChrome>
  );
}

/**
 * Minimal "x mins ago" formatter so the page doesn't pull in
 * date-fns. Buckets: <1m, m, h, d, w. Past dates only.
 */
function timeAgo(date: Date | string): string {
  const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}
