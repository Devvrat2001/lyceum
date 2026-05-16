import { StudentChrome } from "@/components/layouts/StudentChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { getServerCaller } from "@/lib/trpc/server";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";

export default async function StudentProgressPage() {
  const trpc = await getServerCaller();
  const dashboard = await trpc.student.dashboard();

  return (
    <StudentChrome active="progress">
      <div style={{ overflow: "auto", padding: "24px 28px 40px" }}>
        <Eyebrow>Progress</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 28, margin: "6px 0 14px" }}>
          Your learning, at a glance
        </h1>

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
                l: "TOTAL XP",
                v: dashboard.stats.xp.toLocaleString(),
                color: "var(--wf-ink)",
              },
              {
                l: "DAY STREAK",
                v: dashboard.stats.streak.toString(),
                color: "var(--wf-accent)",
              },
              {
                l: "LEVEL",
                v: `L${dashboard.stats.level}`,
                color: "var(--wf-ink)",
              },
              {
                l: "BADGES",
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
          description="Drill into individual skills, see week-over-week mastery changes, export a printable parent report, and compare your trajectory to the class average. The aggregate stats above are real today — the per-strand breakdown is Phase 2."
          icon="chart"
          phase="Phase 2"
          bullets={[
            "Per-skill mastery history with confidence intervals",
            "Weekly XP/streak summary with trend lines",
            "Exportable parent-friendly PDF report",
            "Compare against anonymized class median",
          ]}
          backHref="/student"
          backLabel="Back to dashboard"
        />
      </div>
    </StudentChrome>
  );
}
