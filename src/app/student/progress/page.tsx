import { getTranslations } from "next-intl/server";
import { StudentChrome } from "@/components/layouts/StudentChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { getServerCaller } from "@/lib/trpc/server";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { PdfDownloadButton } from "@/components/ui/PdfDownloadButton";

export default async function StudentProgressPage() {
  const trpc = await getServerCaller();
  const [dashboard, t] = await Promise.all([
    trpc.student.dashboard(),
    getTranslations("Progress"),
  ]);

  return (
    <StudentChrome active="progress">
      <div style={{ overflow: "auto", padding: "24px 28px 40px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1 className="wf-h1" style={{ fontSize: 28, margin: "6px 0 14px" }}>
              {t("title")}
            </h1>
          </div>
          <div
            style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}
          >
            {/* Locale switcher now in the shared sidebar menu (R37). */}
            <PdfDownloadButton
              href="/api/student/report"
              downloadName="progress-report.pdf"
              label={t("downloadReport")}
              icon={<Icon name="download" size={12} />}
            />
          </div>
        </div>

        {dashboard && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginBottom: 24,
              maxWidth: 1200,
            }}
          >
            {[
              {
                l: t("totalXp"),
                v: dashboard.stats.xp.toLocaleString(),
                color: "var(--wf-ink)",
              },
              {
                l: t("dayStreak"),
                v: dashboard.stats.streak.toString(),
                color: "var(--wf-accent)",
              },
              {
                l: t("level"),
                v: `L${dashboard.stats.level}`,
                color: "var(--wf-ink)",
              },
              {
                l: t("badges"),
                v: dashboard.badges.length.toString(),
                color: "var(--wf-ink)",
              },
            ].map((s) => (
              <Card key={s.l} p={16}>
                <div
                  className="wf-serif"
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: s.color,
                  }}
                >
                  {s.v}
                </div>
                <div
                  className="wf-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--wf-mute)",
                    marginTop: 6,
                  }}
                >
                  {s.l}
                </div>
              </Card>
            ))}
          </div>
        )}

        <ComingSoon
          eyebrow="Detailed reports"
          title="Per-strand progress reports"
          description="Drill into individual skills, see week-over-week mastery changes, and compare your trajectory to the class average. The aggregate stats above are real today — and downloadable as a parent-friendly PDF via “Download report.” The per-strand breakdown is Phase 2."
          icon="chart"
          phase="Phase 2"
          bullets={[
            "Per-skill mastery history with confidence intervals",
            "Weekly XP/streak summary with trend lines",
            "Compare against anonymized class median",
          ]}
          backHref="/student"
          backLabel="Back to dashboard"
        />
      </div>
    </StudentChrome>
  );
}
