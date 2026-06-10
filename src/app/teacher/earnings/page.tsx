import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { Card, Eyebrow } from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { EarningsClient } from "@/components/teacher/EarningsClient";
import { formatMoney as fmtPrice } from "@/lib/currency";

export default async function TeacherEarningsPage() {
  const trpc = await getServerCaller();
  const data = await trpc.payment.teacherEarnings({ limit: 30 });

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
          <KpiCard label="MTD NET" value={fmtPrice(data.mtdNetCents)} highlight />
          <KpiCard
            label="LIFETIME NET"
            value={fmtPrice(data.lifetime.netCents)}
          />
          <KpiCard
            label="ORDERS"
            value={data.lifetime.count.toString()}
            sub={`${fmtPrice(data.lifetime.grossCents)} gross`}
          />
          <KpiCard
            label="REV-SHARE"
            value="85%"
            sub={`Lyceum fee ${fmtPrice(data.lifetime.feeCents)}`}
          />
        </div>

        <EarningsClient
          initialAccount={data.stripeAccount}
          orders={data.orders}
        />

        <Card
          p={20}
          style={{
            marginTop: 18,
            maxWidth: 1200,
            background: "var(--wf-fillsoft)",
          }}
        >
          <Eyebrow>What ships next</Eyebrow>
          <div
            style={{
              fontSize: 12,
              color: "var(--wf-body)",
              lineHeight: 1.55,
              marginTop: 8,
            }}
          >
            Stripe Connect is wired end-to-end above. Refunds work in demo
            mode (real-Stripe refunds land with the Tier 2.2 smoke test).
            Annual earnings CSV is ready in the export card above. Still
            ahead: monthly automatic payouts to your bank and the
            buyer-side invoice email.
          </div>
        </Card>
      </div>
    </TeacherChrome>
  );
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card p={16}>
      <div
        className="wf-mono"
        style={{
          fontSize: 10,
          color: "var(--wf-mute)",
          marginBottom: 6,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        className="wf-serif"
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1,
          color: highlight ? "var(--wf-accent)" : "var(--wf-ink)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--wf-mute)",
            marginTop: 4,
          }}
        >
          {sub}
        </div>
      )}
    </Card>
  );
}
