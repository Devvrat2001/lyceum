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

export default async function AdminDashboardPage() {
  const trpc = await getServerCaller();
  const data = await trpc.admin.overview();

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
          Institution overview · {data.institution.name}
        </span>
        <span className="wf-chip" style={{ marginLeft: 4 }}>
          Spring 2026 ▾
        </span>
        <span className="wf-chip">All grades ▾</span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" sm icon={<Icon name="download" size={12} />}>
          Board report
        </Btn>
        <Btn
          variant="primary"
          sm
          icon={<Icon name="plus" size={12} color="white" />}
        >
          Invite teacher
        </Btn>
        <Avatar initials="CM" />
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
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--wf-good)",
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
                Mastery by class · current term
              </h3>
              <Annot>Heatmap · click to drill in</Annot>
            </div>
            <div style={{ overflowX: "auto" }}>
              <Heatmap />
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
                AI insights · principal brief
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
                Teachers · activity
              </h3>
              <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                {data.teachers.length} total
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
                No teachers yet.
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
                Adopted curricula
              </h3>
              <Btn sm variant="ghost" icon={<Icon name="plus" size={11} />}>
                Add
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
                No curricula adopted yet.
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
                Safety & compliance
              </h3>
              <Annot>K-12 specific</Annot>
            </div>
            {data.compliance.map(([k, v], i) => (
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
            ))}
          </Card>
        </div>
      </div>
    </AdminChrome>
  );
}

/**
 * Decorative cohort heatmap — uses deterministic Math.sin pseudo-random
 * values so the visual stays stable. Real per-skill mastery aggregation
 * by class will replace this in P2.
 */
function Heatmap() {
  const classes = ["6A", "6B", "6C", "7A", "7B", "7C", "8A", "8B", "8C"];
  const skills = [
    "Number",
    "Fractions",
    "Decimals",
    "Algebra",
    "Geometry",
    "Statistics",
    "Reading",
    "Writing",
    "Vocab",
    "Science",
    "Lab skills",
    "Spanish",
  ];
  const cellW = 50;
  const cellH = 32;
  const rng = (i: number, j: number) =>
    Math.sin(i * 13.7 + j * 7.3) * 0.5 + 0.5;
  const colorFor = (v: number) =>
    v > 0.5
      ? `rgba(31,29,26,${0.15 + (v - 0.5) * 1.4})`
      : `rgba(255,91,31,${0.1 + (0.5 - v) * 0.6})`;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `60px repeat(${classes.length}, ${cellW}px)`,
          gap: 2,
          marginBottom: 2,
        }}
      >
        <div />
        {classes.map((c) => (
          <div
            key={c}
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-mute)",
              textAlign: "center",
            }}
          >
            {c}
          </div>
        ))}
      </div>
      {skills.map((s, i) => (
        <div
          key={s}
          style={{
            display: "grid",
            gridTemplateColumns: `60px repeat(${classes.length}, ${cellW}px)`,
            gap: 2,
            marginBottom: 2,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--wf-body)",
              alignSelf: "center",
            }}
          >
            {s}
          </div>
          {classes.map((c, j) => {
            const v = rng(i, j);
            return (
              <div
                key={c}
                className="wf-mono"
                style={{
                  height: cellH,
                  background: colorFor(v),
                  borderRadius: 2,
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: v > 0.7 ? "white" : "var(--wf-body)",
                  cursor: "pointer",
                }}
              >
                {Math.round(50 + v * 49)}
              </div>
            );
          })}
        </div>
      ))}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 14,
          fontSize: 10,
          color: "var(--wf-mute)",
          alignItems: "center",
        }}
      >
        <span>Mastery score</span>
        <div style={{ display: "flex", gap: 1, alignItems: "center" }}>
          <span>50</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 12,
                background: colorFor(v),
              }}
            />
          ))}
          <span>99</span>
        </div>
      </div>
    </div>
  );
}
