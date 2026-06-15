import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import {
  Avatar,
  Btn,
  Card,
  Eyebrow,
  Meter,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { StudentsToolbar } from "@/components/teacher/StudentsToolbar";

/**
 * Teacher gradebook — list of students enrolled in any of this
 * teacher's courses. URL search params drive filtering:
 *   ?courseSlug=<slug>  → only students enrolled in that course
 *   ?classId=<id>       → only students whose class.id matches
 *
 * Filter options (courses + classes) are loaded server-side and
 * passed into `<StudentsToolbar>` so the dropdowns render with their
 * full option list on first paint — no flash of empty selects, no
 * extra client query.
 */
export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseSlug?: string; classId?: string }>;
}) {
  const session = await auth();
  const teacherId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const { courseSlug, classId } = await searchParams;

  // Filter-option data: the teacher's own courses (admin sees all) and
  // every class in their institution. Both are bounded-size lookups,
  // safe to fetch on every render.
  const [coursesOwned, classes, institutionId] = teacherId
    ? await Promise.all([
        db.course.findMany({
          where: isAdmin ? {} : { authorId: teacherId },
          orderBy: { updatedAt: "desc" },
          select: { slug: true, title: true },
        }),
        // Defer the actual class query until we know the institution.
        Promise.resolve(null as null),
        db.user
          .findUnique({
            where: { id: teacherId },
            select: { institutionId: true },
          })
          .then((u) => u?.institutionId ?? null),
      ])
    : [[], null, null];

  const classOptions = institutionId
    ? await db.class.findMany({
        where: { institutionId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  // Mark `classes` as used so the destructure stays symmetric for a
  // future swap to a single Promise.all — currently we depend on the
  // institutionId before we can issue the class query.
  void classes;

  // Resolve the selected-course filter to the matching owned course
  // (prevents one teacher from filtering by another teacher's course
  // slug via URL fiddling — out-of-scope slugs silently fall back to
  // "no filter").
  const filterCourseSlug = courseSlug
    ? coursesOwned.find((c) => c.slug === courseSlug)?.slug
    : undefined;
  // Same idempotency for classes: only honor classIds that belong to
  // the teacher's institution.
  const filterClassId = classId
    ? classOptions.find((c) => c.id === classId)?.id
    : undefined;

  const students = teacherId
    ? await db.user.findMany({
        where: {
          role: "STUDENT",
          enrollments: {
            some: {
              course: isAdmin
                ? filterCourseSlug
                  ? { slug: filterCourseSlug }
                  : undefined
                : {
                    authorId: teacherId,
                    ...(filterCourseSlug ? { slug: filterCourseSlug } : {}),
                  },
            },
          },
          ...(filterClassId ? { classId: filterClassId } : {}),
        },
        include: {
          enrollments: {
            // When filtering by course, only show that course's
            // enrollment for the per-row progress meter — otherwise
            // the meter averages every course they're in, which is
            // confusing when the page is supposed to be scoped.
            where: filterCourseSlug
              ? { course: { slug: filterCourseSlug } }
              : isAdmin
                ? undefined
                : { course: { authorId: teacherId } },
            include: {
              course: {
                select: { title: true, slug: true, subject: true },
              },
            },
          },
          class: { select: { name: true } },
          xpEvents: { select: { points: true } },
        },
        take: 50,
      })
    : [];

  const trpc = await getServerCaller();
  // Pull analytics to surface a small KPI row at the top
  const [analytics, t, ts] = await Promise.all([
    trpc.teacher.analytics({ rangeDays: 30 }),
    getTranslations("TeacherAnalytics"),
    getTranslations("TeacherStudents"),
  ]);
  // Localize the server-built KPI labels by key (R41), English fallback.
  const kpiLabel: Record<string, string> = {
    activeStudents: t("kpiActiveStudents"),
    avgCompletion: t("kpiAvgCompletion"),
    avgQuizScore: t("kpiAvgQuizScore"),
  };

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
        <span style={{ fontSize: 16, fontWeight: 600 }}>{ts("title")}</span>
        <StudentsToolbar
          courses={coursesOwned}
          classes={classOptions}
          initialCourseSlug={filterCourseSlug}
          initialClassId={filterClassId}
        />
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {analytics.kpis.slice(0, 3).map((k) => (
            <Card key={k.key} p={14}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  marginBottom: 6,
                }}
              >
                {kpiLabel[k.key] ?? k.l}
              </div>
              <div
                className="wf-serif"
                style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}
              >
                {k.v}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--wf-mute)" }}>
                {t(k.meta.key, k.meta.params)}
              </div>
            </Card>
          ))}
        </div>

        <Card p={0}>
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Eyebrow>{ts("enrolled")}</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {ts("studentCount", { count: students.length })}
              {filterCourseSlug || filterClassId ? ts("filteredSuffix") : ""}
            </span>
          </div>
          {students.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--wf-body)",
              }}
            >
              {filterCourseSlug || filterClassId
                ? ts("emptyFiltered")
                : ts("emptyNone")}
            </div>
          ) : (
            students.map((s, i) => {
              const xp = s.xpEvents.reduce((a, e) => a + e.points, 0);
              const meanPct =
                s.enrollments.length > 0
                  ? Math.round(
                      s.enrollments.reduce(
                        (a, e) => a + e.progressPct,
                        0
                      ) / s.enrollments.length
                    )
                  : 0;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 18px",
                    borderBottom:
                      i < students.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <Avatar
                    initials={(s.name ?? s.email)
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                    size={32}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {s.name ?? s.firstName ?? s.email}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        marginTop: 2,
                      }}
                    >
                      {s.class?.name
                        ? `${ts("rowClass", { name: s.class.name })} · `
                        : ""}
                      {ts("courseCount", { count: s.enrollments.length })} ·{" "}
                      {xp.toLocaleString()} XP
                    </div>
                  </div>
                  <div style={{ width: 160 }}>
                    <Meter value={meanPct} variant="accent" />
                    <div
                      className="wf-mono"
                      style={{
                        fontSize: 9,
                        color: "var(--wf-mute)",
                        marginTop: 2,
                      }}
                    >
                      {ts("rowAvgCompletion", { pct: meanPct })}
                    </div>
                  </div>
                  <Link
                    href={`/teacher/students/${s.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Btn sm variant="ghost">
                      {ts("view")} →
                    </Btn>
                  </Link>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </TeacherChrome>
  );
}
