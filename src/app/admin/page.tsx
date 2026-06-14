import { getTranslations } from "next-intl/server";
import { AdminChrome } from "@/components/layouts/AdminChrome";
import {
  Annot,
  Avatar,
  Btn,
  Card,
  Icon,
  Meter,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { AdminInsights } from "@/components/admin/AdminInsights";
import { PdfDownloadButton } from "@/components/ui/PdfDownloadButton";

export default async function AdminDashboardPage() {
  const trpc = await getServerCaller();
  const [data, t] = await Promise.all([
    trpc.admin.overview(),
    getTranslations("AdminDashboard"),
  ]);

  return (
    <AdminChrome active="overview">
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {data.institution.name
            ? t("overviewNamed", { name: data.institution.name })
            : t("overview")}
        </span>
        <div style={{ flex: 1 }} />
        <PdfDownloadButton
          href="/api/admin/board-report"
          downloadName="board-report.pdf"
          label={t("boardReport")}
          icon={<Icon name="download" size={12} />}
        />
        <Btn
          variant="primary"
          sm
          icon={<Icon name="plus" size={12} color="white" />}
        >
          {t("inviteTeacher")}
        </Btn>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {data.kpis.map((k) => (
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
              {(k.d || k.meta) && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {k.d && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--wf-good)",
                        fontWeight: 600,
                      }}
                    >
                      {k.d}
                    </span>
                  )}
                  {k.meta && (
                    <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                      {k.meta}
                    </span>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Card p={20}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                {t("masteryTitle")}
              </h3>
              <Annot>{t("masteryAnnot")}</Annot>
            </div>
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 12,
                color: "var(--wf-mute)",
                lineHeight: 1.55,
              }}
            >
              {t("masteryEmpty")}
            </div>
          </Card>

          <Card
            p={20}
            style={{
              background: "var(--wf-ai-soft)",
              borderColor: "var(--wf-ai)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Icon name="sparkles" size={16} color="var(--wf-ai)" />
              <h3
                style={{
                  fontSize: 14,
                  margin: 0,
                  fontWeight: 700,
                  color: "var(--wf-ai)",
                }}
              >
                {t("aiBrief")}
              </h3>
            </div>
            <AdminInsights />
          </Card>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          <Card p={20}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                {t("teachersTitle")}
              </h3>
              <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                {t("total", { count: data.teachers.length })}
              </span>
            </div>
            {data.teachers.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  padding: 8,
                }}
              >
                {t("noTeachers")}
              </div>
            ) : (
              data.teachers.map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < data.teachers.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                    alignItems: "center",
                  }}
                >
                  <Avatar
                    initials={t.n
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                    size={28}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{t.n}</div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--wf-mute)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.s}
                    </div>
                  </div>
                  <span
                    className="wf-mono"
                    style={{
                      fontSize: 10,
                      color:
                        t.t === "top"
                          ? "var(--wf-good)"
                          : t.t === "low"
                          ? "var(--wf-accent)"
                          : "var(--wf-mute)",
                    }}
                  >
                    {t.m}
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card p={20}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                {t("curriculaTitle")}
              </h3>
              <Btn sm variant="ghost" icon={<Icon name="plus" size={11} />}>
                {t("add")}
              </Btn>
            </div>
            {data.curricula.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  padding: 8,
                }}
              >
                {t("noCurricula")}
              </div>
            ) : (
              data.curricula.map((c, i) => (
                <div
                  key={c.courseId}
                  style={{
                    padding: "10px 0",
                    borderBottom:
                      i < data.curricula.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.t}
                      </div>
                      <div
                        style={{ fontSize: 10, color: "var(--wf-mute)" }}
                      >
                        {c.s}
                      </div>
                    </div>
                    <span
                      className="wf-mono"
                      style={{ fontSize: 10, color: "var(--wf-mute)" }}
                    >
                      {c.p}%
                    </span>
                  </div>
                  <Meter value={c.p} />
                </div>
              ))
            )}
          </Card>

          <Card p={20}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                {t("complianceTitle")}
              </h3>
              <Annot>{t("complianceAnnot")}</Annot>
            </div>
            {data.compliance.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  padding: 8,
                  lineHeight: 1.5,
                }}
              >
                {t("complianceEmpty")}
              </div>
            ) : (
              data.compliance.map(([k, v], i) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    fontSize: 12,
                    borderBottom:
                      i < data.compliance.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <span style={{ color: "var(--wf-body)" }}>{k}</span>
                  <span
                    style={{
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                      color: "var(--wf-good)",
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="check" size={11} color="var(--wf-good)" />
                    <span style={{ fontSize: 11 }}>{v}</span>
                  </span>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </AdminChrome>
  );
}

