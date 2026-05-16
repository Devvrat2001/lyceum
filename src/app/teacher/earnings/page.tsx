import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { getServerCaller } from "@/lib/trpc/server";

export default async function TeacherEarningsPage() {
  const trpc = await getServerCaller();
  const analytics = await trpc.teacher.analytics({ rangeDays: 30 });
  const earningsKpi = analytics.kpis.find((k) => k.l.startsWith("Earnings"));

  return (
    <TeacherChrome active="earnings">
      <div style={{ overflow: "auto", padding: "24px 28px 40px" }}>
        <Eyebrow>Earnings</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 28, margin: "6px 0 18px" }}>
          Your creator payouts
        </h1>

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
            { l: "MTD", v: earningsKpi?.v ?? "$0", color: "var(--wf-ink)" },
            { l: "PENDING", v: "$0", color: "var(--wf-body)" },
            { l: "LIFETIME", v: "—", color: "var(--wf-body)" },
            { l: "REV-SHARE", v: "85%", color: "var(--wf-good)" },
          ].map((s) => (
            <Card key={s.l} p={16}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  marginBottom: 6,
                }}
              >
                {s.l}
              </div>
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
            </Card>
          ))}
        </div>

        <ComingSoon
          eyebrow="Payouts via Stripe Connect"
          title="Get paid for your courses"
          description="Connect your bank in 60 seconds via Stripe Connect Express. Once connected, you get monthly automatic payouts of your 85% revenue share with full earnings history and 1099 docs come tax season."
          icon="bolt"
          phase="Phase 3"
          bullets={[
            "Stripe Connect Express onboarding (60 sec)",
            "Monthly automatic payouts to your bank",
            "85% revenue share — Lyceum keeps 15%",
            "Detailed transaction history + 1099 export",
            "Real-time earnings dashboard with refund handling",
          ]}
          backHref="/teacher/analytics"
          backLabel="Back to analytics"
        />
      </div>
    </TeacherChrome>
  );
}
