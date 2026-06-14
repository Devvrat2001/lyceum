import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StudentChrome } from "@/components/layouts/StudentChrome";
import {
  Btn,
  Card,
  Eyebrow,
  Icon,
  ImageBox,
  Meter,
} from "@/components/wf/primitives";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { SaveCourseOffline } from "@/components/offline/SaveCourseOffline";

export default async function StudentLibraryPage() {
  const session = await auth();
  const me = session!.user;
  const t = await getTranslations("Library");

  const enrollments = await db.enrollment.findMany({
    where: { userId: me.id },
    orderBy: [{ lastActivityAt: "desc" }, { enrolledAt: "desc" }],
    include: {
      course: {
        select: {
          slug: true,
          title: true,
          tagline: true,
          subject: true,
          grade: true,
          authorLabel: true,
          ratingAvg: true,
          ratingCount: true,
          // Every lesson slug (not just the first) — the Continue link
          // wants the first one and SaveCourseOffline pre-caches them
          // all. Slug-only select keeps the payload tiny.
          units: {
            orderBy: { order: "asc" },
            select: {
              lessons: {
                orderBy: { order: "asc" },
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  });

  const inProgress = enrollments.filter((e) => !e.completed);
  const completed = enrollments.filter((e) => e.completed);

  return (
    <StudentChrome active="library">
      <header
        style={{
          height: 56,
          padding: "0 28px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>{t("title")}</span>
        <div style={{ flex: 1 }} />
        <Link href="/" style={{ textDecoration: "none" }}>
          <Btn variant="primary" sm icon={<Icon name="plus" size={12} color="white" />}>
            {t("addCourse")}
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px 40px" }}>
        <Eyebrow style={{ marginBottom: 10 }}>
          {t("inProgress", { count: inProgress.length })}
        </Eyebrow>

        {enrollments.length === 0 ? (
          <Card p={32} style={{ textAlign: "center", maxWidth: 560, margin: "20px auto" }}>
            <Icon
              name="book"
              size={28}
              color="var(--wf-mute)"
              style={{ marginBottom: 10 }}
            />
            <h2
              className="wf-h2"
              style={{ fontSize: 20, marginBottom: 8 }}
            >
              {t("emptyTitle")}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              {t("emptyBody")}
            </p>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Btn variant="primary" className="st-pop">
                {t("browse")}
              </Btn>
            </Link>
          </Card>
        ) : (
          <>
            <section style={{ marginBottom: 32 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 14,
                }}
              >
                {inProgress.map((e) => {
                  const lessonSlugs = e.course.units
                    .flatMap((u) => u.lessons.map((l) => l.slug))
                    .filter((s): s is string => !!s);
                  const href = lessonSlugs[0]
                    ? `/student/lesson/${lessonSlugs[0]}`
                    : `/course/${e.course.slug}`;
                  return (
                    <Link
                      key={e.id}
                      href={href}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <Card p={0} className="st-card">
                        <ImageBox h={110} kind="video" />
                        <div style={{ padding: 14 }}>
                          <div
                            className="wf-mono"
                            style={{
                              fontSize: 9,
                              color: "var(--wf-mute)",
                              letterSpacing: "0.06em",
                              marginBottom: 4,
                            }}
                          >
                            {e.course.subject.toUpperCase()} · GRADE{" "}
                            {e.course.grade}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              marginBottom: 4,
                              lineHeight: 1.25,
                            }}
                          >
                            {e.course.title}
                          </div>
                          {e.course.authorLabel && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--wf-mute)",
                                marginBottom: 10,
                              }}
                            >
                              {e.course.authorLabel}
                            </div>
                          )}
                          <Meter
                            value={e.progressPct}
                            variant="accent"
                          />
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginTop: 8,
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              className="wf-mono"
                              style={{
                                fontSize: 11,
                                color: "var(--wf-mute)",
                              }}
                            >
                              {e.progressPct}%
                            </span>
                            <SaveCourseOffline lessonSlugs={lessonSlugs} />
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--wf-body)",
                                fontWeight: 600,
                              }}
                            >
                              {t("continue")}
                            </span>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>

            {completed.length > 0 && (
              <section style={{ marginTop: 32 }}>
                <Eyebrow style={{ marginBottom: 10 }}>
                  {t("completedCount", { count: completed.length })}
                </Eyebrow>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 14,
                  }}
                >
                  {completed.map((e) => (
                    <Card key={e.id} p={14}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Icon
                          name="trophy"
                          size={14}
                          color="var(--wf-good)"
                        />
                        <span
                          className="wf-mono"
                          style={{
                            fontSize: 9,
                            color: "var(--wf-good)",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {t("completedTag")}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        {e.course.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--wf-mute)",
                        }}
                      >
                        {t("finished", {
                          date: e.lastActivityAt
                            ? new Date(e.lastActivityAt).toLocaleDateString()
                            : "—",
                        })}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </StudentChrome>
  );
}
