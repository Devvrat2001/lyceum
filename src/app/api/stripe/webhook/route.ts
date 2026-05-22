import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/payments/stripe";
import { audit } from "@/lib/audit";
import { sendOrderReceipt } from "@/lib/email";

/**
 * Stripe webhook. Only runs in real-Stripe mode — demo orders never
 * hit this; they go through payment.demoConfirm instead.
 *
 * Expected events:
 *   checkout.session.completed → mark Order PAID + create Enrollment
 *   account.updated            → sync StripeAccount.payoutsEnabled
 *   charge.refunded            → mark Order REFUNDED + delete Enrollment
 */
export const runtime = "nodejs";

type StripeLike = {
  webhooks: {
    constructEvent: (
      body: string,
      sig: string,
      secret: string
    ) => StripeEvent;
  };
};

type StripeEvent = { id: string } & (
  | {
      type: "checkout.session.completed";
      data: {
        object: {
          id: string;
          client_reference_id: string | null;
          metadata?: Record<string, string>;
        };
      };
    }
  | {
      type: "account.updated";
      data: {
        object: {
          id: string;
          payouts_enabled?: boolean;
          charges_enabled?: boolean;
        };
      };
    }
  | {
      type: "charge.refunded";
      data: {
        object: {
          payment_intent: string;
          metadata?: Record<string, string>;
        };
      };
    }
  | { type: string; data: { object: Record<string, unknown> } }
);

export async function POST(req: Request) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response(
      "Webhook secret not configured (running in demo mode).",
      { status: 503 }
    );
  }
  const stripe = (await getStripe()) as StripeLike | null;
  if (!stripe) {
    return new Response("Stripe SDK not installed.", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const body = await req.text();
  let event: StripeEvent;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return new Response(
      `Webhook signature verify failed: ${err instanceof Error ? err.message : err}`,
      { status: 400 }
    );
  }

  // Event-level dedup: try to insert this event's id BEFORE any side
  // effects. The unique constraint on StripeEvent.eventId makes a
  // replay a single index lookup + a failed insert, then a clean
  // HTTP 200. Race-safe because the insert is atomic — concurrent
  // deliveries lose to the first one. Also gives ops a full audit
  // trail of every event Stripe has ever delivered to us.
  try {
    await db.stripeEvent.create({
      data: { eventId: event.id, type: event.type },
    });
  } catch (err) {
    // P2002 = unique constraint violation = we've seen this eventId
    // before. Any other DB error is unexpected; log + bail with 500
    // so Stripe retries (transient infra issue).
    const isDupe =
      err !== null &&
      typeof err === "object" &&
      (err as { code?: string }).code === "P2002";
    if (isDupe) {
      return new Response("ok (already processed)", { status: 200 });
    }
    console.error("[stripe.webhook] dedup insert failed", err);
    return new Response("internal error", { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const sess = event.data.object as {
        id: string;
        client_reference_id: string | null;
        metadata?: Record<string, string>;
      };
      const orderId =
        sess.client_reference_id ?? sess.metadata?.orderId ?? null;
      if (orderId) {
        const order = await db.order.findUnique({ where: { id: orderId } });
        if (order && order.status === "PENDING") {
          await db.$transaction([
            db.order.update({
              where: { id: orderId },
              data: { status: "PAID", paidAt: new Date() },
            }),
            db.enrollment.upsert({
              where: {
                userId_courseId: {
                  userId: order.userId,
                  courseId: order.courseId,
                },
              },
              create: {
                userId: order.userId,
                courseId: order.courseId,
                lastActivityAt: new Date(),
              },
              update: {},
            }),
          ]);
          await audit({
            actorId: order.userId,
            kind: "course.publish",
            payload: {
              variant: "checkout_completed",
              orderId,
              grossCents: order.grossCents,
              netCents: order.netCents,
            },
            courseId: order.courseId,
          });
          // Purchase receipt — best-effort, swallows its own errors.
          await sendOrderReceipt(orderId);
        }
      }
    } else if (event.type === "account.updated") {
      const acc = event.data.object as {
        id: string;
        payouts_enabled?: boolean;
        charges_enabled?: boolean;
      };
      await db.stripeAccount
        .update({
          where: { externalId: acc.id },
          data: {
            payoutsEnabled: !!acc.payouts_enabled,
            chargesEnabled: !!acc.charges_enabled,
          },
        })
        .catch(() => {
          /* race with first onboarding click — ok */
        });
    } else if (event.type === "charge.refunded") {
      // Charges inherit metadata from their PaymentIntent, and we stamp
      // `orderId` on the PI at checkout-session creation
      // (see payment.createCheckoutSession). So the refund event
      // arrives with our orderId directly — no need to do extra
      // round-trips to resolve Charge → PI → Session → Order.
      const charge = event.data.object as {
        payment_intent?: string;
        metadata?: Record<string, string>;
      };
      const orderId = charge.metadata?.orderId ?? null;
      const order = orderId
        ? await db.order.findUnique({ where: { id: orderId } })
        : null;
      if (!order) {
        console.warn(
          "[stripe.webhook] charge.refunded: no order matched",
          { metadata: charge.metadata, pi: charge.payment_intent }
        );
      }
      if (order && order.status === "PAID") {
        // Flip the Order and cancel the Enrollment in one tx. We delete
        // (not soft-delete) the Enrollment so the student loses access
        // immediately — re-enrolling later just creates a fresh row.
        await db.$transaction([
          db.order.update({
            where: { id: order.id },
            data: { status: "REFUNDED", refundedAt: new Date() },
          }),
          db.enrollment.deleteMany({
            where: {
              userId: order.userId,
              courseId: order.courseId,
            },
          }),
        ]);
        await audit({
          actorId: order.userId,
          kind: "course.publish",
          payload: {
            variant: "checkout_refunded",
            orderId: order.id,
            grossCents: order.grossCents,
            netCents: order.netCents,
          },
          courseId: order.courseId,
        });
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[stripe.webhook]", err);
    return new Response("internal error", { status: 500 });
  }
}
