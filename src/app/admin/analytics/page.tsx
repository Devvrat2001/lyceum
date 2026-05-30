import Link from "next/link";
import { AdminChrome } from "@/components/layouts/AdminChrome";
import { Card, Eyebrow, Icon, Meter, Annot } from "@/components/wf/primitives";
import {
  BarLineChart,
  FunnelChart,
} from "@/components/admin/AnalyticsCharts";
import { getServerCaller } from "@/lib/trpc/server";

const RANGES = [12, 26, 52] as const;
type Range = (typeof RANGES)[number];

function trendColor(t: "up" | "down" | "flat"): string {
  if (t === "up") return "var(--wf-good)";
  if (t === "down") return "var(--wf-accent)";
  return "var(--wf-mute)";
}

function trendGlyph(t: "up" | "down" | "flat"): string {
  if (t === "up") return "▲";
  if (t === "down") return "▼";
  return "•";
}

/** "2026-05-25" → "May 25" for the range caption. */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const sp = await searchParams;
  const parsed = Number(sp.weeks);
  const weeks: Range = parsed === 26 ? 26 : parsed === 52 ? 52 : 12;

  const trpc = await getServerCaller();
  const data = await trpc.admin.analytics({ weeks });

  const first = data.series[0]?.weekStart;
  const last = data.series[data.series.length - 1]?.weekStart;

  return (
    <AdminChrome active="analytics">
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
            ? `Analytics · ${data.institution.name}`
            : "District analytics"}
        </span>
        {first && last && (
          <Annot>
            {prettyDate(first)} – {prettyDate(last)}
          </Annot>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map((r) => {
            const active = r === weeks;
            return (
              <Link
                key={r}
                href={`/admin/analytics?weeks=${r}`}
                style={{
                  padding: "5px 11px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  textDecoration: "none",
                  color: active ? "white" : "var(--wf-body)",
                  background: active ? "var(--wf-ink)" : "transparent",
                  border: "1px solid var(--wf-hairline)",
                }}
              >
                {r}w
              </Link>
            );
          })}
        </div>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 40px" }}>
        {/* ── KPI strip ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 12,
            marginBottom: 18,
          }}
        >
          {data.kpis.map((k) => (
            <Card key={k.label} p={14}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  marginBottom: 6,
                }}
              >
                {k.label}
              </div>
              <div
                className="wf-serif"
                style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}
              >
                {k.value}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: trendColor(k.trend),
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 8 }}>{trendGlyph(k.trend)}</span>
                  {k.deltaLabel}
                </span>
                <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                  {k.meta}
                </span>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Activity + enrolments ─────────────────────────────────── */}
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
                marginBottom: 14,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                Engagement · attempts &amp; accuracy
              </h3>
              <Annot>weekly</Annot>
            </div>
            <BarLineChart
              data={data.series.map((s) => ({
                label: s.weekStart,
                bar: s.attempts,
                line: s.accuracyPct,
              }))}
              barLabel="Attempts"
              lineLabel="Accuracy %"
              height={220}
            />
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
                New enrollments
              </h3>
              <Annot>weekly</Annot>
            </div>
            <BarLineChart
              data={data.series.map((s) => ({
                label: s.weekStart,
                bar: s.enrollments,
                line: null,
              }))}
              barColor="var(--wf-good)"
              height={140}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginTop: 14,
              }}
            >
              <Stat
                label="XP earned"
                value={data.series
                  .reduce((a, s) => a + s.xp, 0)
                  .toLocaleString()}
              />
              <Stat
                label="New signups"
                value={data.series
                  .reduce((a, s) => a + s.signups, 0)
                  .toLocaleString()}
              />
            </div>
          </Card>
        </div>

        {/* ── Subject breakdown + funnel ────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Card p={0}>
            <TableHead title="By subject" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 70px 90px 1.3fr 80px",
                gap: 12,
                padding: "8px 18px",
                fontSize: 10,
                color: "var(--wf-mute)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid var(--wf-hairline)",
              }}
            >
              <span>Subject</span>
              <span>Courses</span>
              <span>Enroll</span>
              <span>Avg completion</span>
              <span style={{ textAlign: "right" }}>Accuracy</span>
            </div>
            {data.bySubject.length === 0 ? (
              <Empty>No enrollment data yet.</Empty>
            ) : (
              data.bySubject.map((s, i) => (
                <div
                  key={s.subject}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 70px 90px 1.3fr 80px",
                    gap: 12,
                    padding: "11px 18px",
                    fontSize: 12,
                    alignItems: "center",
                    borderBottom:
                      i < data.bySubject.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
                    {s.subject}
                  </span>
                  <span className="wf-mono" style={{ color: "var(--wf-body)" }}>
                    {s.courses}
                  </span>
                  <span className="wf-mono" style={{ color: "var(--wf-body)" }}>
                    {s.enrollments.toLocaleString()}
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Meter value={s.avgCompletion} />
                    <span
                      className="wf-mono"
                      style={{ fontSize: 10, color: "var(--wf-mute)" }}
                    >
                      {s.avgCompletion}%
                    </span>
                  </span>
                  <span
                    className="wf-mono"
                    style={{ textAlign: "right", color: "var(--wf-body)" }}
                  >
                    {s.accuracyPct === null ? "—" : `${s.accuracyPct}%`}
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
                marginBottom: 16,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                Completion funnel
              </h3>
              <Annot>all enrollments</Annot>
            </div>
            <FunnelChart steps={data.funnel} />
          </Card>
        </div>

        {/* ── Top courses + grade breakdown ─────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 16,
          }}
        >
          <Card p={0}>
            <TableHead title="Top courses" subtitle="by enrollment" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.7fr 110px 90px 80px",
                gap: 12,
                padding: "8px 18px",
                fontSize: 10,
                color: "var(--wf-mute)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid var(--wf-hairline)",
              }}
            >
              <span>Course</span>
              <span>Enroll</span>
              <span>Completion</span>
              <span style={{ textAlign: "right" }}>Accuracy</span>
            </div>
            {data.topCourses.length === 0 ? (
              <Empty>No enrollment data yet.</Empty>
            ) : (
              data.topCourses.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.7fr 110px 90px 80px",
                    gap: 12,
                    padding: "11px 18px",
                    fontSize: 12,
                    alignItems: "center",
                    borderBottom:
                      i < data.topCourses.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.title}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--wf-mute)",
                        textTransform: "capitalize",
                      }}
                    >
                      {c.subject} · Grade {c.grade}
                    </span>
                  </span>
                  <span className="wf-mono" style={{ color: "var(--wf-body)" }}>
                    {c.enrollments.toLocaleString()}
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Meter value={c.completionPct} />
                    <span
                      className="wf-mono"
                      style={{ fontSize: 10, color: "var(--wf-mute)" }}
                    >
                      {c.completionPct}%
                    </span>
                  </span>
                  <span
                    className="wf-mono"
                    style={{ textAlign: "right", color: "var(--wf-body)" }}
                  >
                    {c.accuracyPct === null ? "—" : `${c.accuracyPct}%`}
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card p={0}>
            <TableHead title="By grade" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 1.2fr",
                gap: 12,
                padding: "8px 18px",
                fontSize: 10,
                color: "var(--wf-mute)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderBottom: "1px solid var(--wf-hairline)",
              }}
            >
              <span>Grade</span>
              <span>Enroll</span>
              <span>Avg completion</span>
            </div>
            {data.byGrade.length === 0 ? (
              <Empty>No enrollment data yet.</Empty>
            ) : (
              data.byGrade.map((g, i) => (
                <div
                  key={g.grade}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 1.2fr",
                    gap: 12,
                    padding: "11px 18px",
                    fontSize: 12,
                    alignItems: "center",
                    borderBottom:
                      i < data.byGrade.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Grade {g.grade}</span>
                  <span className="wf-mono" style={{ color: "var(--wf-body)" }}>
                    {g.enrollments.toLocaleString()}
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Meter value={g.avgCompletion} />
                    <span
                      className="wf-mono"
                      style={{ fontSize: 10, color: "var(--wf-mute)" }}
                    >
                      {g.avgCompletion}%
                    </span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--wf-hairline)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--wf-mute)", marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="wf-mono"
        style={{ fontSize: 16, fontWeight: 700, color: "var(--wf-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

function TableHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        padding: "12px 18px",
        borderBottom: "1px solid var(--wf-hairline)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Eyebrow>{title}</Eyebrow>
      {subtitle && (
        <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>{subtitle}</span>
      )}
      <Icon
        name="chart"
        size={13}
        color="var(--wf-mute)"
        style={{ marginLeft: "auto" }}
      />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 28,
        textAlign: "center",
        fontSize: 13,
        color: "var(--wf-mute)",
      }}
    >
      {children}
    </div>
  );
}
