"use client";

import Link from "next/link";
import { Avatar, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/** Coarse relative time — wire value may arrive as a string. */
function fmtTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Teacher-side moderation hub: every DISCUSSION thread across the
 * teacher's authored courses, with the recent comments inline so they
 * can moderate (delete) without leaving the page. Backed by
 * `lesson.teacherDiscussions`; deletes go through `lesson.deleteComment`
 * (audited server-side) and invalidate the feed.
 */
export function TeacherDiscussionsClient() {
  const q = trpc.lesson.teacherDiscussions.useQuery();
  const utils = trpc.useUtils();
  const del = trpc.lesson.deleteComment.useMutation({
    onSuccess: () => utils.lesson.teacherDiscussions.invalidate(),
  });

  const data = q.data;
  const threads = data?.threads ?? [];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px 40px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <Icon name="chat" size={20} color="var(--wf-ink)" />
          <h1 className="wf-h1" style={{ fontSize: 24, margin: 0 }}>
            Discussions
          </h1>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--wf-mute)",
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          Every discussion thread across your courses. Remove any comment
          that breaks class rules — moderated deletes are recorded in the
          institution audit log.
        </p>

        {/* Stat strip */}
        {data && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard label="Threads" value={data.totals.threads} />
            <StatCard label="With activity" value={data.totals.active} />
            <StatCard label="Total comments" value={data.totals.comments} />
          </div>
        )}

        {q.isLoading ? (
          <Card p={28}>
            <div style={{ fontSize: 13, color: "var(--wf-mute)" }}>
              Loading discussions…
            </div>
          </Card>
        ) : threads.length === 0 ? (
          <Card p={28}>
            <div
              style={{
                fontSize: 13,
                color: "var(--wf-mute)",
                lineHeight: 1.55,
              }}
            >
              No discussion blocks yet. Add a{" "}
              <strong>Discussion</strong> block to any lesson in the course
              builder and student conversations will show up here.
            </div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {threads.map((t) => (
              <Card key={t.blockId} p={0}>
                {/* Thread header */}
                <div
                  style={{
                    padding: "14px 18px",
                    borderBottom:
                      t.commentCount > 0
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <Link
                      href={`/teacher/courses/${t.courseSlug}/edit`}
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        textDecoration: "none",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t.courseTitle}
                    </Link>
                    <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                      · {t.lessonTitle}
                    </span>
                    <span
                      className="wf-mono"
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        color: "var(--wf-mute)",
                      }}
                    >
                      {t.commentCount}{" "}
                      {t.commentCount === 1 ? "comment" : "comments"}
                      {t.lastActivity ? ` · ${fmtTime(t.lastActivity)}` : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--wf-ink)",
                    }}
                  >
                    {t.prompt ?? "Discussion"}
                  </div>
                </div>

                {/* Recent comments + inline moderation */}
                {t.recent.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {t.recent.map((c, i) => {
                      const deleting =
                        del.isPending && del.variables?.commentId === c.id;
                      return (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            gap: 10,
                            padding: "11px 18px",
                            borderTop:
                              i === 0 ? "none" : "1px solid var(--wf-hairline)",
                            alignItems: "flex-start",
                          }}
                        >
                          <Avatar initials={initialsOf(c.author.name)} size={26} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 8,
                                marginBottom: 2,
                              }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {c.author.name}
                              </span>
                              <span
                                style={{ fontSize: 10, color: "var(--wf-mute)" }}
                              >
                                {fmtTime(c.createdAt)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  del.mutate({ commentId: c.id })
                                }
                                disabled={deleting}
                                title="Remove this comment"
                                style={{
                                  marginLeft: "auto",
                                  border: "none",
                                  background: "none",
                                  padding: 0,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: "var(--wf-accent)",
                                  cursor: deleting ? "default" : "pointer",
                                }}
                              >
                                {deleting ? "Removing…" : "Remove"}
                              </button>
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                color: "var(--wf-body)",
                                lineHeight: 1.45,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {c.body}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {t.commentCount > t.recent.length && (
                      <div
                        style={{
                          padding: "8px 18px 12px",
                          fontSize: 11,
                          color: "var(--wf-mute)",
                        }}
                      >
                        + {t.commentCount - t.recent.length} earlier comment
                        {t.commentCount - t.recent.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {del.error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "var(--wf-accent)",
            }}
          >
            {del.error.message ?? "Couldn't remove that comment."}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card p={14}>
      <Eyebrow style={{ marginBottom: 6 }}>{label}</Eyebrow>
      <div
        className="wf-serif"
        style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}
      >
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
