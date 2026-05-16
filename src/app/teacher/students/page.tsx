import Link from "next/link";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import {
  Avatar,
  Btn,
  Card,
  Eyebrow,
  Icon,
  Meter,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export default async function TeacherStudentsPage() {
  const session = await auth();
  const teacherId = session?.user?.id;

  // Students enrolled in any of this teacher's courses.
  const students = teacherId
    ? await db.user.findMany({
        where: {
          role: "STUDENT",
          enrollments: {
            some: {
              course:
                session?.user?.role === "ADMIN"
                  ? undefined
                  : { authorId: teacherId },
            },
          },
        },
        include: {
          enrollments: {
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
  const analytics = await trpc.teacher.analytics({ rangeDays: 30 });

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
        <span style={{ fontSize: 16, fontWeight: 600 }}>Students</span>
        <span className="wf-chip">All courses ▾</span>
        <span className="wf-chip">All classes ▾</span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" sm icon={<Icon name="download" size={12} />}>
          Export
        </Btn>
        <Btn
          variant="primary"
          sm
          icon={<Icon name="plus" size={12} color="white" />}
        >
          Invite student
        </Btn>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {analytics.kpis.slice(0, 3).map((k) => (
            <Card key={k.l} p={14}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  marginBottom: 6,
                }}
              >
                {k.l}
              </div>
              <div
                className="wf-serif"
                style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}
              >
                {k.v}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--wf-mute)" }}>
                {k.meta}
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
            <Eyebrow>Enrolled</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {students.length} student{students.length === 1 ? "" : "s"}
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
              No students have enrolled in your courses yet.
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
                      {s.class?.name ? `Class ${s.class.name} · ` : ""}
                      {s.enrollments.length} course
                      {s.enrollments.length === 1 ? "" : "s"} ·{" "}
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
                      {meanPct}% avg completion
                    </div>
                  </div>
                  <Link
                    href={`/teacher/students/${s.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Btn sm variant="ghost">
                      View →
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
