"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/** Minimal translator shape — enough to format keyed ICU strings. */
type TFn = (key: string, values?: Record<string, string | number>) => string;

/**
 * Coarse relative time. The wire value may arrive as a string; `t` localizes
 * the "just now" / m / h / d buckets and `locale` drives the older-than-a-month
 * date fallback.
 */
function fmtTime(value: Date | string, t: TFn, locale: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return t("justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("daysAgo", { n: day });
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
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
  const t = useTranslations("TeacherDiscussions");
  const locale = useLocale();
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
            {t("title")}
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
          {t("intro")}
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
            <StatCard label={t("statThreads")} value={data.totals.threads} />
            <StatCard label={t("statActive")} value={data.totals.active} />
            <StatCard label={t("statComments")} value={data.totals.comments} />
          </div>
        )}

        {q.isLoading ? (
          <Card p={28}>
            <div style={{ fontSize: 13, color: "var(--wf-mute)" }}>
              {t("loading")}
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
              {t.rich("emptyBody", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {threads.map((thread) => (
              <Card key={thread.blockId} p={0}>
                {/* Thread header */}
                <div
                  style={{
                    padding: "14px 18px",
                    borderBottom:
                      thread.commentCount > 0
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
                      href={`/teacher/courses/${thread.courseSlug}/edit`}
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        textDecoration: "none",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {thread.courseTitle}
                    </Link>
                    <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                      · {thread.lessonTitle}
                    </span>
                    <span
                      className="wf-mono"
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        color: "var(--wf-mute)",
                      }}
                    >
                      {t("commentCount", { count: thread.commentCount })}
                      {thread.lastActivity
                        ? ` · ${fmtTime(thread.lastActivity, t, locale)}`
                        : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--wf-ink)",
                    }}
                  >
                    {thread.prompt ?? t("defaultPrompt")}
                  </div>
                </div>

                {/* Recent comments + inline moderation */}
                {thread.recent.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {thread.recent.map((c, i) => {
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
                                {fmtTime(c.createdAt, t, locale)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  del.mutate({ commentId: c.id })
                                }
                                disabled={deleting}
                                title={t("removeTitle")}
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
                                {deleting ? t("removing") : t("remove")}
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
                    {thread.commentCount > thread.recent.length && (
                      <div
                        style={{
                          padding: "8px 18px 12px",
                          fontSize: 11,
                          color: "var(--wf-mute)",
                        }}
                      >
                        {t("earlierComments", {
                          count: thread.commentCount - thread.recent.length,
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Instructor reply composer */}
                <ThreadComposer blockId={thread.blockId} />
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
            {del.error.message ?? t("deleteError")}
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

/**
 * Inline composer that lets the teacher post a reply to a thread as the
 * instructor. Posts through `lesson.postComment` (a protectedProcedure —
 * any signed-in user can post to a DISCUSSION block) and invalidates the
 * hub feed so the new reply shows up in the thread's recent comments.
 */
function ThreadComposer({ blockId }: { blockId: string }) {
  const t = useTranslations("TeacherDiscussions");
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const post = trpc.lesson.postComment.useMutation({
    onSuccess: () => {
      setDraft("");
      setError(null);
      utils.lesson.teacherDiscussions.invalidate();
    },
    onError: (err) => setError(err.message ?? t("postError")),
  });

  const trimmed = draft.trim();
  const canPost = trimmed.length > 0 && !post.isPending;

  return (
    <div
      style={{
        padding: "10px 18px 12px",
        borderTop: "1px solid var(--wf-hairline)",
        background: "var(--wf-fillsoft)",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("composerPlaceholder")}
          rows={1}
          maxLength={2000}
          disabled={post.isPending}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 13,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            background: "white",
            fontFamily: "inherit",
            resize: "vertical",
            color: "var(--wf-ink)",
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (canPost) post.mutate({ blockId, body: trimmed });
          }}
          disabled={!canPost}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 3,
            background: canPost ? "var(--wf-ink)" : "var(--wf-fill)",
            color: canPost ? "white" : "var(--wf-mute)",
            cursor: canPost ? "pointer" : "default",
            alignSelf: "stretch",
          }}
        >
          {post.isPending ? t("posting") : t("reply")}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--wf-accent)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
