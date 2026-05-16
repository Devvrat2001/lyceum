import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { DemoCheckoutForm } from "@/components/payments/DemoCheckoutForm";

function fmtPrice(cents: number, currency = "usd") {
  return `${currency === "usd" ? "$" : currency.toUpperCase() + " "}${(
    cents / 100
  ).toFixed(2)}`;
}

export default async function DemoCheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?next=/demo-checkout/${orderId}`);

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      course: { select: { title: true, slug: true, tagline: true } },
      teacher: { select: { name: true, firstName: true } },
    },
  });

  if (!order || order.userId !== session.user.id) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Card p={28} style={{ maxWidth: 420, textAlign: "center" }}>
          <Eyebrow>Order not found</Eyebrow>
          <h1 className="wf-h1" style={{ fontSize: 22, margin: "10px 0" }}>
            We couldn&apos;t load that checkout.
          </h1>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Btn variant="primary">Back to marketplace</Btn>
          </Link>
        </Card>
      </div>
    );
  }

  if (order.status === "PAID") {
    redirect(`/checkout/success?courseSlug=${order.course.slug}`);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--wf-fillsoft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: 520, maxWidth: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              background: "var(--wf-ink)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--wf-bg)",
              fontFamily: "var(--font-serif-stack)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            L
          </div>
          <span
            style={{
              fontFamily: "var(--font-serif-stack)",
              fontSize: 17,
              fontWeight: 600,
            }}
          >
            Lyceum
          </span>
          <span
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-mute)",
              marginLeft: 8,
              letterSpacing: "0.08em",
            }}
          >
            DEMO CHECKOUT
          </span>
        </div>

        <Card p={28}>
          <Eyebrow>Course purchase</Eyebrow>
          <h1
            className="wf-h1"
            style={{ fontSize: 22, margin: "8px 0 4px" }}
          >
            {order.course.title}
          </h1>
          {order.course.tagline && (
            <div style={{ fontSize: 12, color: "var(--wf-mute)" }}>
              {order.course.tagline}
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 0",
              borderTop: "1px solid var(--wf-hairline)",
              borderBottom: "1px solid var(--wf-hairline)",
              margin: "16px 0",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--wf-body)" }}>
              Total
            </span>
            <span
              className="wf-serif"
              style={{ fontSize: 28, fontWeight: 700 }}
            >
              {fmtPrice(order.grossCents, order.currency)}
            </span>
          </div>
          <div
            style={{
              padding: 12,
              background: "var(--wf-ai-soft)",
              border: "1px solid var(--wf-ai)",
              borderRadius: 4,
              marginBottom: 16,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Icon name="sparkles" size={14} color="var(--wf-ai)" />
            <div style={{ fontSize: 11, color: "var(--wf-body)", lineHeight: 1.5 }}>
              <b style={{ color: "var(--wf-ai)" }}>Demo mode.</b> No card is
              charged. Set <code className="wf-mono">STRIPE_SECRET_KEY</code> in
              <code className="wf-mono"> .env.local</code> to enable real
              Stripe Checkout. The order shape, enrollment, and earnings flow
              are identical in both modes.
            </div>
          </div>
          <DemoCheckoutForm orderId={order.id} />
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <Link
              href={`/course/${order.course.slug}`}
              style={{
                fontSize: 11,
                color: "var(--wf-mute)",
                textDecoration: "none",
              }}
            >
              ← Cancel and go back
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
