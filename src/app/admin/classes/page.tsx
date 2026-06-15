import { getTranslations } from "next-intl/server";
import { AdminChrome } from "@/components/layouts/AdminChrome";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export default async function AdminClassesPage() {
  const t = await getTranslations("AdminClasses");
  const session = await auth();
  const me = await db.user.findUnique({
    where: { id: session!.user.id },
    select: { institutionId: true },
  });
  const institutionId =
    me?.institutionId ??
    (await db.institution.findFirst({ select: { id: true } }))?.id;

  const classes = await db.class.findMany({
    where: { institutionId },
    include: {
      teacher: { select: { name: true, firstName: true } },
      _count: { select: { students: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <AdminChrome active="classes">
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
        <span className="wf-chip">{t("term")} ▾</span>
        <span className="wf-chip">{t("allGrades")} ▾</span>
        <div style={{ flex: 1 }} />
        <Btn
          variant="primary"
          sm
          icon={<Icon name="plus" size={12} color="white" />}
        >
          {t("newClass")}
        </Btn>
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
            <Eyebrow>{t("allClasses")}</Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {t("total", { count: classes.length })}
            </span>
          </div>
          {classes.length === 0 ? (
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
            classes.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 18px",
                  borderBottom:
                    i < classes.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    border: "1px solid var(--wf-hairline)",
                    background: "var(--wf-fillsoft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-serif-stack)",
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  {c.name}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {t("rowClass", { name: c.name })}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 2,
                    }}
                  >
                    {c.teacher?.name
                      ? t("taughtBy", { name: c.teacher.name })
                      : t("unassigned")}
                  </div>
                </div>
                <span
                  className="wf-mono"
                  style={{ fontSize: 11, color: "var(--wf-body)" }}
                >
                  {t("countStudents", { count: c._count.students })}
                </span>
                <Btn variant="ghost" sm>
                  {t("manage")} →
                </Btn>
              </div>
            ))
          )}
        </Card>
      </div>
    </AdminChrome>
  );
}
