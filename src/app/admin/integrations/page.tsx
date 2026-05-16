import { AdminChrome } from "@/components/layouts/AdminChrome";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";

const INTEGRATIONS = [
  {
    name: "Clever",
    desc: "Single sign-on + roster sync for K-12 districts",
    status: "Connected",
    statusGood: true,
  },
  {
    name: "ClassLink",
    desc: "Alternate SSO/SIS provider",
    status: "Available",
    statusGood: false,
  },
  {
    name: "Google Classroom",
    desc: "Two-way assignment sync",
    status: "Available",
    statusGood: false,
  },
  {
    name: "Canvas",
    desc: "Embed Lyceum courses in your LMS",
    status: "Available",
    statusGood: false,
  },
  {
    name: "PowerSchool SIS",
    desc: "Roster + gradebook sync",
    status: "Available",
    statusGood: false,
  },
  {
    name: "Webhooks",
    desc: "Outbound events for your data warehouse",
    status: "Beta",
    statusGood: false,
  },
];

export default function AdminIntegrationsPage() {
  return (
    <AdminChrome active="integrations">
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>Integrations</span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" sm icon={<Icon name="cog" size={12} />}>
          API keys
        </Btn>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 40px" }}>
        <Eyebrow style={{ marginBottom: 12 }}>
          Roster, SSO, and LMS connections
        </Eyebrow>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
            maxWidth: 1200,
          }}
        >
          {INTEGRATIONS.map((i) => (
            <Card key={i.name} p={16}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: "var(--wf-fill)",
                    border: "1px solid var(--wf-hairline)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="cog" size={14} color="var(--wf-body)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{i.name}</div>
                </div>
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 9,
                    color: i.statusGood ? "var(--wf-good)" : "var(--wf-mute)",
                    letterSpacing: "0.06em",
                  }}
                >
                  ● {i.status.toUpperCase()}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-body)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                {i.desc}
              </div>
              <Btn
                variant={i.statusGood ? "ghost" : "primary"}
                sm
                full
                disabled={!i.statusGood && i.status === "Beta"}
              >
                {i.statusGood ? "Manage" : i.status === "Beta" ? "Request access" : "Connect"}
              </Btn>
            </Card>
          ))}
        </div>
      </div>
    </AdminChrome>
  );
}
