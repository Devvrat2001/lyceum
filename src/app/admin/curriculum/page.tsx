import Link from "next/link";
import { AdminChrome } from "@/components/layouts/AdminChrome";
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

export default async function AdminCurriculumPage() {
  const session = await auth();
  const me = await db.user.findUnique({
    where: { id: session!.user.id },
    select: { institutionId: true },
  });
  const institutionId =
    me?.institutionId ??
    (await db.institution.findFirst({ select: { id: true } }))?.id;

  const grouped = await db.enrollment.groupBy({
    by: ["courseId"],
    where: { user: { institutionId } },
    _count: { _all: true },
    _avg: { progressPct: true },
  });
  const courses = await db.course.findMany({
    where: { id: { in: grouped.map((g) => g.courseId) } },
    select: {
      id: true,
      slug: true,
      title: true,
      authorLabel: true,
      subject: true,
      grade: true,
      ratingAvg: true,
      ratingCount: true,
    },
  });

  return (
    <AdminChrome active="curriculum">
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>Curriculum</span>
        <span className="wf-chip">All grades ▾</span>
        <span className="wf-chip">All subjects ▾</span>
        <div style={{ flex: 1 }} />
        <Link href="/" style={{ textDecoration: "none" }}>
          <Btn variant="primary" sm icon={<Icon name="plus" size={12} color="white" />}>
            Browse marketplace
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 40px" }}>
        <Card p={0}>
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Eyebrow>Adopted across the institution</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </span>
          </div>
          {courses.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--wf-mute)",
              }}
            >
              No curricula adopted yet. Browse the marketplace to add one.
            </div>
          ) : (
            courses.map((c, i) => {
              const g = grouped.find((g) => g.courseId === c.id);
              const pct = Math.round(g?._avg.progressPct ?? 0);
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    gap: 14,
                    padding: "14px 18px",
                    borderBottom:
                      i < courses.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                    alignItems: "center",
                  }}
                >
                  <ImageBox w={56} h={42} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/course/${c.slug}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {c.title}
                      </div>
                    </Link>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        marginTop: 2,
                      }}
                    >
                      {c.authorLabel} · Grade {c.grade} · {c.subject}
                      {c.ratingCount > 0 && ` · ★ ${c.ratingAvg.toFixed(1)}`}
                    </div>
                  </div>
                  <div style={{ width: 180 }}>
                    <Meter value={pct} variant="accent" />
                    <div
                      className="wf-mono"
                      style={{
                        fontSize: 10,
                        color: "var(--wf-mute)",
                        marginTop: 2,
                      }}
                    >
                      {pct}% · {g?._count._all ?? 0} students
                    </div>
                  </div>
                  <Btn variant="ghost" sm>
                    Manage
                  </Btn>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </AdminChrome>
  );
}
