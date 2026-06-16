import Link from "next/link";
import { getTranslations } from "next-intl/server";
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

  const t = await getTranslations("AdminCurriculum");

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
        <span style={{ fontSize: 16, fontWeight: 600 }}>{t("title")}</span>
        <span className="wf-chip">{t("allGrades")}</span>
        <span className="wf-chip">{t("allSubjects")}</span>
        <div style={{ flex: 1 }} />
        <Link href="/" style={{ textDecoration: "none" }}>
          <Btn variant="primary" sm icon={<Icon name="plus" size={12} color="white" />}>
            {t("browseMarketplace")}
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
            <Eyebrow>{t("adopted")}</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {t("courseCount", { count: courses.length })}
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
              {t("empty")}
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
                      {c.authorLabel} · {t("gradeLabel", { grade: c.grade })} ·{" "}
                      {c.subject}
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
                      {pct}% · {t("studentsCount", { count: g?._count._all ?? 0 })}
                    </div>
                  </div>
                  <Btn variant="ghost" sm>
                    {t("manage")}
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
