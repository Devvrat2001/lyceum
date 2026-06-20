import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { StudentChrome } from "@/components/layouts/StudentChrome";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";

type TFn = (key: string, values?: Record<string, string | number>) => string;

/** Coarse relative time for a thread's last activity. */
function fmtTime(d: Date, t: TFn, locale: string): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return t("justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("minutesAgo", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("hoursAgo", { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("daysAgo", { count: day });
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default async function StudentCommunityPage() {
  const trpc = await getServerCaller();
  const data = await trpc.lesson.studentCommunity();
  const threads = data.threads;
  const t = await getTranslations("Community");
  const locale = await getLocale();

  return (
    <StudentChrome active="community">
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px 40px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
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
            {t("subtitle")}
          </p>

          {threads.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <Card p={14}>
                <Eyebrow style={{ marginBottom: 6 }}>
                  {t("statThreads")}
                </Eyebrow>
                <div
                  className="wf-serif"
                  style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}
                >
                  {data.totals.threads}
                </div>
              </Card>
              <Card p={14}>
                <Eyebrow style={{ marginBottom: 6 }}>
                  {t("statJoined")}
                </Eyebrow>
                <div
                  className="wf-serif"
                  style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}
                >
                  {data.totals.joined}
                </div>
              </Card>
            </div>
          )}

          {threads.length === 0 ? (
            <Card p={28}>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--wf-mute)",
                  lineHeight: 1.55,
                }}
              >
                {t.rich("empty", {
                  link: (c) => (
                    <Link
                      href="/student/library"
                      style={{ color: "var(--wf-accent)" }}
                    >
                      {c}
                    </Link>
                  ),
                })}
              </div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {threads.map((thread) => {
                const inner = (
                  <Card
                    key={thread.blockId}
                    p={16}
                    style={{
                      transition: "none",
                      cursor: thread.lessonSlug ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: "var(--wf-mute)",
                        }}
                      >
                        {thread.courseTitle} · {thread.lessonTitle}
                      </span>
                      {thread.youPosted && (
                        <span
                          className="wf-mono"
                          style={{
                            fontSize: 9,
                            color: "var(--wf-good)",
                            border: "1px solid var(--wf-good)",
                            borderRadius: 3,
                            padding: "1px 5px",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {t("joinedBadge")}
                        </span>
                      )}
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
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--wf-ink)",
                        lineHeight: 1.4,
                      }}
                    >
                      {thread.prompt ?? t("joinDiscussion")}
                    </div>
                  </Card>
                );
                return thread.lessonSlug ? (
                  <Link
                    key={thread.blockId}
                    href={`/student/lesson/${thread.lessonSlug}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StudentChrome>
  );
}
