import Link from "next/link";
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

export default async function StudentLibraryPage() {
  const session = await auth();
  const me = session!.user;

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
          units: {
            orderBy: { order: "asc" },
            select: {
              lessons: {
                orderBy: { order: "asc" },
                select: { slug: true, title: true },
                take: 1,
              },
            },
            take: 1,
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>My Library</span>
        <div style={{ flex: 1 }} />
        <Link href="/" style={{ textDecoration: "none" }}>
          <Btn variant="primary" sm icon={<Icon name="plus" size={12} color="white" />}>
            Add a course
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px 40px" }}>
        <Eyebrow style={{ marginBottom: 10 }}>
          {inProgress.length === 0
            ? "Nothing in progress yet"
            : `${inProgress.length} ${
                inProgress.length === 1 ? "course" : "courses"
              } in progress`}
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
              Your library is empty.
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              Enroll in a course from the marketplace and it&apos;ll appear
              here, ready to pick up where you left off.
            </p>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Btn variant="primary">Browse the marketplace</Btn>
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
                  const firstLesson = e.course.units[0]?.lessons[0];
                  const href = firstLesson?.slug
                    ? `/student/lesson/${firstLesson.slug}`
                    : `/course/${e.course.slug}`;
                  return (
                    <Link
                      key={e.id}
                      href={href}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <Card p={0} className="hover:shadow-sm">
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
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--wf-body)",
                                fontWeight: 600,
                              }}
                            >
                              Continue →
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
                  Completed · {completed.length}
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
                          COMPLETED
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
                        Finished{" "}
                        {e.lastActivityAt
                          ? new Date(e.lastActivityAt).toLocaleDateString()
                          : "—"}
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
