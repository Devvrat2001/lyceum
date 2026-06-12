import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketChrome } from "@/components/layouts/MarketChrome";
import { Annot, Avatar, Card, Icon } from "@/components/wf/primitives";
import { courseGradient } from "@/lib/thumbnail";
import { getServerCaller } from "@/lib/trpc/server";
import { auth } from "@/lib/auth";
import { TRPCError } from "@trpc/server";
import { CurriculumAccordion } from "@/components/course/CurriculumAccordion";
import { EnrollPanel } from "@/components/course/EnrollPanel";
import { CourseReviewForm } from "@/components/course/CourseReviewForm";
import { estimateCourseMinutes, formatDuration } from "@/lib/courseLength";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await getServerCaller();

  let course;
  try {
    course = await trpc.course.bySlug({ slug });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [reviews, myStatus, session] = await Promise.all([
    trpc.course.reviews({ courseId: course.id, limit: 4 }),
    trpc.course.myStatus({ courseId: course.id }),
    auth(),
  ]);

  const totalLessons = course.units.reduce((a, u) => a + u.lessons.length, 0);
  // Estimated time-to-complete: teacher-set lesson durations where present,
  // a per-lesson fallback otherwise (so every course shows a figure). `exact`
  // is false when any lesson was estimated → the UI prefixes "~".
  const { minutes: estimatedMinutes, exact: durationExact } =
    estimateCourseMinutes(course.units);
  const learn = (course.learnOutcomes as string[] | null) ?? [];

  return (
    <MarketChrome role={session?.user?.role ?? null}>
      <div
        style={{
          padding: "20px 28px 40px",
          maxWidth: 1600,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--wf-mute)",
            marginBottom: 12,
          }}
        >
          <Link
            href="/"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            Browse
          </Link>{" "}
          · {course.subject.toUpperCase()} · Grade {course.grade} ·{" "}
          <span style={{ color: "var(--wf-ink)" }}>{course.title}</span>
        </div>
        <div className="wf-two-col--wide">
          <div>
            {course.tagline && (
              <Annot style={{ marginBottom: 10 }}>{course.tagline}</Annot>
            )}
            <h1
              className="wf-h1"
              style={{ fontSize: 32, marginBottom: 10, maxWidth: 640 }}
            >
              {course.title}
            </h1>
            <div
              style={{
                fontSize: 14,
                maxWidth: 640,
                marginBottom: 16,
                color: "var(--wf-body)",
                lineHeight: 1.5,
              }}
            >
              {course.description}
            </div>
            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                marginBottom: 18,
                flexWrap: "wrap",
                fontSize: 13,
              }}
            >
              {course.ratingCount > 0 ? (
                <span>
                  ★ {course.ratingAvg.toFixed(1)}{" "}
                  <span style={{ color: "var(--wf-mute)" }}>
                    ({course.ratingCount.toLocaleString()})
                  </span>
                </span>
              ) : (
                <span style={{ color: "var(--wf-mute)" }}>Not yet rated</span>
              )}
              <span style={{ color: "var(--wf-mute)" }}>·</span>
              <span>
                By <b>{course.authorLabel ?? course.author.name ?? "—"}</b>
              </span>
              <span style={{ color: "var(--wf-mute)" }}>·</span>
              <span>
                Updated{" "}
                {new Date(course.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            {course.thumbnailUrl ? (
              // Arbitrary-host teacher thumbnail — plain <img> on
              // purpose (see CourseCard).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.thumbnailUrl}
                alt={`${course.title} thumbnail`}
                style={{
                  width: "100%",
                  height: 300,
                  objectFit: "cover",
                  display: "block",
                  borderRadius: 6,
                  border: "1px solid var(--wf-hairline)",
                  marginBottom: 24,
                }}
              />
            ) : (
              <div
                aria-hidden
                style={{
                  height: 300,
                  background: courseGradient(course.slug),
                  borderRadius: 6,
                  border: "1px solid var(--wf-hairline)",
                  marginBottom: 24,
                }}
              />
            )}

            {learn.length > 0 && (
              <>
                <h2
                  className="wf-h2"
                  style={{ fontSize: 18, marginBottom: 12 }}
                >
                  What you&apos;ll master
                </h2>
                <div
                  className="wf-grid-cards-2"
                  style={{ gap: 10, marginBottom: 28 }}
                >
                  {learn.map((s) => (
                    <div
                      key={s}
                      style={{ display: "flex", gap: 10, fontSize: 13 }}
                    >
                      <Icon
                        name="check"
                        size={14}
                        color="var(--wf-good)"
                        style={{ marginTop: 2 }}
                      />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 12,
              }}
            >
              <h2 className="wf-h2" style={{ fontSize: 18 }}>
                Curriculum
              </h2>
              <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>
                {course.units.length} units · {totalLessons} lessons
                {estimatedMinutes > 0
                  ? ` · ${durationExact ? "" : "~"}${formatDuration(estimatedMinutes)}`
                  : ""}
              </span>
            </div>
            <CurriculumAccordion
              units={course.units.map((u) => ({
                id: u.id,
                order: u.order,
                title: u.title,
                estLabel: u.estLabel,
                lessons: u.lessons.map((l) => ({
                  id: l.id,
                  slug: l.slug,
                  title: l.title,
                  isPreview: l.isPreview,
                })),
              }))}
            />

            {myStatus.isEnrolled && (
              <>
                <h2
                  className="wf-h2"
                  style={{ fontSize: 18, margin: "28px 0 12px" }}
                >
                  Review this course
                </h2>
                <CourseReviewForm courseId={course.id} />
              </>
            )}

            {reviews.length > 0 && (
              <>
                <h2
                  className="wf-h2"
                  style={{ fontSize: 18, margin: "28px 0 12px" }}
                >
                  What students say
                </h2>
                <div className="wf-grid-cards-2">
                  {reviews.map((r) => (
                    <Card key={r.id} p={16}>
                      <div
                        style={{
                          fontSize: 13,
                          marginBottom: 10,
                          fontStyle: "italic",
                          color: "var(--wf-body)",
                          lineHeight: 1.5,
                        }}
                      >
                        &ldquo;{r.body}&rdquo;
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <Avatar
                          initials={(r.reviewerName ?? "AB")
                            .split(" ")
                            .map((x) => x[0])
                            .join("")
                            .slice(0, 2)}
                          size={28}
                        />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>
                            {r.reviewerName ?? "Anonymous"}
                          </div>
                          <div
                            style={{ fontSize: 10, color: "var(--wf-mute)" }}
                          >
                            {r.reviewerRole ?? ""}
                          </div>
                        </div>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 11,
                            color: "var(--wf-accent)",
                          }}
                        >
                          {"★".repeat(r.rating)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>

          <aside>
            <Card p={20} style={{ position: "sticky", top: 76 }}>
              <EnrollPanel
                courseId={course.id}
                courseSlug={course.slug}
                priceCents={course.priceCents}
                totalLessons={totalLessons}
                upgradeNote={course.upgradeNote}
                aiHint={course.aiHint}
                isEnrolled={myStatus.isEnrolled}
                firstLessonSlug={myStatus.firstLessonSlug}
              />
            </Card>
          </aside>
        </div>
      </div>
    </MarketChrome>
  );
}
