import { getTranslations } from "next-intl/server";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { Card, Eyebrow } from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { EarningsClient } from "@/components/teacher/EarningsClient";
import { formatMoney as fmtPrice } from "@/lib/currency";

export default async function TeacherEarningsPage() {
  const trpc = await getServerCaller();
  const [data, t] = await Promise.all([
    trpc.payment.teacherEarnings({ limit: 30 }),
    getTranslations("TeacherEarnings"),
  ]);

  return (
    <TeacherChrome active="earnings">
      <div style={{ overflow: "auto", padding: "24px 28px 40px" }}>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 28, margin: "6px 0 18px" }}>
          {t("title")}
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 24,
            maxWidth: 1200,
          }}
        >
          <KpiCard
            label={t("kpiMtdNet")}
            value={fmtPrice(data.mtdNetCents)}
            highlight
          />
          <KpiCard
            label={t("kpiLifetimeNet")}
            value={fmtPrice(data.lifetime.netCents)}
          />
          <KpiCard
            label={t("kpiOrders")}
            value={data.lifetime.count.toString()}
            sub={t("subGross", { amount: fmtPrice(data.lifetime.grossCents) })}
          />
          <KpiCard
            label={t("kpiRevShare")}
            value="85%"
            sub={t("subFee", { amount: fmtPrice(data.lifetime.feeCents) })}
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
          <Eyebrow>{t("payoutsEyebrow")}</Eyebrow>
          <div
            style={{
              fontSize: 12,
              color: "var(--wf-body)",
              lineHeight: 1.55,
              marginTop: 8,
            }}
          >
            {t("payoutsBody")}
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
