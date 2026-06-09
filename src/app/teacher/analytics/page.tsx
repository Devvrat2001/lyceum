import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import {
  Btn,
  Card,
  Icon,
  ImageBox,
  Meter,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { ChartLine } from "@/components/teacher/ChartLine";
import { AnalyticsInsights } from "@/components/teacher/AnalyticsInsights";

export default async function TeacherAnalyticsPage() {
  const trpc = await getServerCaller();
  const data = await trpc.teacher.analytics({ rangeDays: 30 });

  return (
    <TeacherChrome active="analytics">
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>Analytics</span>
        <span className="wf-chip" style={{ marginLeft: 4 }}>
          All courses ▾
        </span>
        <span className="wf-chip">Last 30 days ▾</span>
        <span className="wf-chip">All cohorts ▾</span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" sm icon={<Icon name="download" size={12} />}>
          Export CSV
        </Btn>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
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
                style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}
              >
                {k.v}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: k.neg ? "var(--wf-accent)" : "var(--wf-good)",
                    fontWeight: 600,
                  }}
                >
                  {k.d}
                </span>
                <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                  {k.meta}
                </span>
              </div>
            </Card>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr",
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
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                Engagement over time
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <LegendDot color="var(--wf-ink)" label="Active learners" />
                <LegendDot color="var(--wf-accent)" label="New enrollments" />
                <LegendDot color="var(--wf-ai)" label="AI tutor sessions" />
              </div>
            </div>
            <ChartLine series={data.series} />
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
                Where students drop off
              </h3>
            </div>
            {data.funnel.map((s) => (
              <div key={s.label} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontWeight: s.hot ? 600 : 500,
                      color: s.hot ? "var(--wf-accent)" : "var(--wf-ink)",
                    }}
                  >
                    {s.label}
                    {s.hot ? " · biggest drop" : ""}
                  </span>
                  <span
                    className="wf-mono"
                    style={{ color: "var(--wf-mute)" }}
                  >
                    {s.count} · {s.pct}%
                  </span>
                </div>
                <Meter value={s.pct} variant={s.hot ? "accent" : undefined} />
              </div>
            ))}
          </Card>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <Card p={20}>
            <h3
              style={{
                fontSize: 14,
                margin: "0 0 14px",
                fontWeight: 600,
              }}
            >
              Course performance
            </h3>
            {data.coursePerformance.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  textAlign: "center",
                }}
              >
                No courses yet.
              </div>
            ) : (
              data.coursePerformance.map((c, i) => (
                <div
                  key={c.slug}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < data.coursePerformance.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <ImageBox h={36} w={48} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--wf-mute)" }}>
                      {c.students} students · ★ {c.ratingAvg.toFixed(1)}
                    </div>
                  </div>
                  <div style={{ width: 100 }}>
                    <Meter value={c.completionPct} variant="accent" />
                    <div
                      className="wf-mono"
                      style={{
                        fontSize: 9,
                        color: "var(--wf-mute)",
                        marginTop: 2,
                      }}
                    >
                      {c.completionPct}% completion
                    </div>
                  </div>
                </div>
              ))
            )}
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
                  fontWeight: 600,
                  color: "var(--wf-ai)",
                }}
              >
                AI insights · top 3
              </h3>
            </div>
            <AnalyticsInsights />
          </Card>
        </div>
      </div>
    </TeacherChrome>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: "var(--wf-body)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 2,
          background: color,
        }}
      />
      {label}
    </span>
  );
}
