"use client";

import { useState } from "react";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type Account = {
  id: string;
  externalId: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  provider: string;
};

type Order = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  netCents: number;
  grossCents: number;
  courseTitle: string;
  courseSlug: string;
  buyerName: string;
  provider: string;
};

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function EarningsClient({
  initialAccount,
  orders,
}: {
  initialAccount: Account | null;
  orders: Order[];
}) {
  const [account, setAccount] = useState<Account | null>(initialAccount);
  const [error, setError] = useState<string | null>(null);

  const startOnboarding = trpc.payment.startConnectOnboarding.useMutation({
    onSuccess: ({ url, provider, accountId }) => {
      setAccount({
        id: accountId,
        externalId: "",
        payoutsEnabled: provider === "demo",
        chargesEnabled: provider === "demo",
        provider,
      });
      if (url.startsWith("http")) {
        window.location.href = url;
      } else {
        window.location.href = url;
      }
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 18 }}>
      <Card p={20}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Icon
            name="bolt"
            size={20}
            color={
              account?.payoutsEnabled ? "var(--wf-good)" : "var(--wf-accent)"
            }
          />
          <div style={{ flex: 1 }}>
            <Eyebrow>Stripe Connect</Eyebrow>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {account
                ? account.payoutsEnabled
                  ? `Connected${account.provider === "demo" ? " (demo)" : ""} — payouts enabled`
                  : "Onboarding incomplete — finish to receive payouts"
                : "Not connected"}
            </div>
            {account && (
              <div
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  marginTop: 4,
                  letterSpacing: "0.04em",
                }}
              >
                provider={account.provider}
                {account.externalId
                  ? ` · ${account.externalId.slice(0, 20)}…`
                  : ""}
              </div>
            )}
          </div>
          {!account || !account.payoutsEnabled ? (
            <Btn
              variant="primary"
              disabled={startOnboarding.isPending}
              onClick={() => {
                setError(null);
                startOnboarding.mutate();
              }}
            >
              {startOnboarding.isPending
                ? "Starting…"
                : account
                ? "Continue onboarding"
                : "Connect Stripe →"}
            </Btn>
          ) : (
            <span
              className="wf-mono"
              style={{
                fontSize: 10,
                color: "var(--wf-good)",
                letterSpacing: "0.06em",
              }}
            >
              ● READY FOR PAYOUTS
            </span>
          )}
        </div>
        {error && (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              fontSize: 11,
              color: "var(--wf-accent)",
              border: "1px solid var(--wf-accent)",
              background: "var(--wf-accent-soft)",
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}
      </Card>

      <Card p={0}>
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--wf-hairline)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Eyebrow>Recent orders</Eyebrow>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "var(--wf-mute)",
            }}
          >
            {orders.length} shown
          </span>
        </div>
        {orders.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              fontSize: 13,
              color: "var(--wf-mute)",
            }}
          >
            No paid orders yet. Once a student buys one of your courses,
            you&apos;ll see the line item here.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr 140px 100px 90px",
              gap: 0,
            }}
          >
            <CellHeader>Paid</CellHeader>
            <CellHeader>Course / Buyer</CellHeader>
            <CellHeader>Gross / Fee</CellHeader>
            <CellHeader align="right">Net</CellHeader>
            <CellHeader align="right">Source</CellHeader>
            {orders.map((o) => (
              <Row key={o.id} order={o} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CellHeader({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <div
      className="wf-mono"
      style={{
        fontSize: 9,
        color: "var(--wf-mute)",
        letterSpacing: "0.08em",
        padding: "10px 14px",
        borderBottom: "1px solid var(--wf-hairline)",
        textAlign: align ?? "left",
      }}
    >
      {children}
    </div>
  );
}

function Row({ order }: { order: Order }) {
  return (
    <>
      <Cell>
        {order.paidAt ? fmtDate(order.paidAt) : "—"}
      </Cell>
      <Cell>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{order.courseTitle}</div>
        <div style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 2 }}>
          {order.buyerName}
        </div>
      </Cell>
      <Cell>
        <div style={{ fontSize: 12 }}>{fmtPrice(order.grossCents)}</div>
        <div style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 2 }}>
          fee {fmtPrice(order.grossCents - order.netCents)}
        </div>
      </Cell>
      <Cell align="right">
        <span
          className="wf-serif"
          style={{ fontSize: 14, fontWeight: 700, color: "var(--wf-good)" }}
        >
          {fmtPrice(order.netCents)}
        </span>
      </Cell>
      <Cell align="right">
        <span
          className="wf-mono"
          style={{
            fontSize: 9,
            color:
              order.provider === "stripe"
                ? "var(--wf-good)"
                : "var(--wf-mute)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {order.provider}
        </span>
      </Cell>
    </>
  );
}

function Cell({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--wf-hairline)",
        textAlign: align ?? "left",
      }}
    >
      {children}
    </div>
  );
}
