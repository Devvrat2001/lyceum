import Link from "next/link";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { Btn, Card, Icon } from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";

export const metadata = { title: "My courses · Lyceum" };

function StatusPill({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  return (
    <span
      className="wf-chip"
      style={{
        fontSize: 9,
        color: published ? "var(--wf-good)" : "var(--wf-mute)",
        borderColor: published ? "var(--wf-good)" : "var(--wf-hairline)",
      }}
    >
      <Icon
        name={published ? "check" : "dot"}
        size={10}
        color="currentColor"
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}

/**
 * Teacher landing page — the courses this teacher owns (or every course,
 * for an ADMIN). Previously `/teacher` hard-redirected to one seeded demo
 * course's editor, which 404'd for any teacher who didn't own it.
 */
export default async function TeacherCoursesPage() {
  const trpc = await getServerCaller();
  const courses = await trpc.teacher.myCourses();

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
        <span style={{ fontSize: 16, fontWeight: 600 }}>My courses</span>
        {courses.length > 0 && (
          <span className="wf-chip">
            {courses.length} course{courses.length === 1 ? "" : "s"}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Link href="/teacher/courses/new" style={{ textDecoration: "none" }}>
          <Btn
            variant="primary"
            sm
            icon={<Icon name="plus" size={12} color="white" />}
          >
            New course
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {courses.length === 0 ? (
          <Card
            p={40}
            style={{
              textAlign: "center",
              maxWidth: 440,
              margin: "40px auto 0",
            }}
          >
            <Icon name="book" size={28} color="var(--wf-mute)" />
            <div
              style={{
                marginTop: 12,
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              No courses yet
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              Start from a blank canvas and build your units your way — or
              generate a draft with AI. You&apos;re in control either way.
            </div>
            <Link
              href="/teacher/courses/new"
              style={{ textDecoration: "none" }}
            >
              <Btn
                variant="primary"
                icon={<Icon name="plus" size={14} color="white" />}
              >
                Create your first course
              </Btn>
            </Link>
          </Card>
        ) : (
          <Card p={0}>
            {courses.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 18px",
                  borderBottom:
                    i < courses.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {c.title}
                    </span>
                    <StatusPill status={c.status} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                    {c.enrollCount} student
                    {c.enrollCount === 1 ? "" : "s"}
                    {c.ratingCount > 0
                      ? ` · ★ ${c.ratingAvg.toFixed(1)} (${c.ratingCount})`
                      : " · No ratings yet"}
                    {" · "}
                    {c.priceCents === 0
                      ? "Free"
                      : `$${(c.priceCents / 100).toFixed(2)}`}
                  </div>
                </div>
                <Link
                  href={`/teacher/courses/${c.slug}/edit`}
                  style={{ textDecoration: "none" }}
                >
                  <Btn sm variant="ghost">
                    Edit →
                  </Btn>
                </Link>
              </div>
            ))}
          </Card>
        )}
      </div>
    </TeacherChrome>
  );
}
