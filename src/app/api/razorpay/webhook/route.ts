import crypto from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { sendOrderReceipt } from "@/lib/email";
import {
  fulfillPaidOrder,
  revokePaidOrder,
} from "@/server/services/fulfillOrder";
import {
  createRouteTransfer,
  fetchPayment,
  isRazorpayEnabled,
  orderIdFromRazorpayEvent,
  paymentIdFromRazorpayEvent,
  refundInfoFromRazorpayEvent,
  verifyRazorpaySignature,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";

/**
 * Razorpay webhook — the source of truth for India-launch payments,
 * exactly as /api/stripe/webhook is for Stripe. Handles
 * `payment_link.paid` / `payment.captured`: resolve our Order via the
 * reference_id / notes.orderId round-trip, then PENDING → PAID +
 * ensureEnrollment in one transaction (so the enrollment counter rides
 * along), audit, receipt.
 *
 * Never processes an unverified body: without RAZORPAY_WEBHOOK_SECRET
 * the route refuses outright (mirrors the Mux webhook posture).
 * Re-deliveries are deduped through the StripeEvent ledger — despite
 * the name it's a generic (eventId, type) table; razorpay ids get an
 * `rzp_` prefix so they can never collide with Stripe's `evt_…` ids.
 */
export async function POST(req: Request) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    return new Response("razorpay webhook not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (
    !verifyRazorpaySignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)
  ) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  const eventType =
    typeof event === "object" && event !== null && "event" in event
      ? String((event as { event: unknown }).event)
      : "unknown";

  // Dedup. Razorpay sends x-razorpay-event-id on every delivery; the
  // body-hash fallback keeps replays idempotent even if that ever
  // changes.
  const eventId =
    req.headers.get("x-razorpay-event-id") ??
    crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 40);
  try {
    await db.stripeEvent.create({
      data: { eventId: `rzp_${eventId}`, type: eventType },
    });
  } catch (err) {
    const isDupe =
      err !== null &&
      typeof err === "object" &&
      (err as { code?: string }).code === "P2002";
    if (isDupe) {
      return new Response("ok (already processed)", { status: 200 });
    }
    console.error("[razorpay.webhook] dedup insert failed", err);
    return new Response("internal error", { status: 500 });
  }

  try {
    const orderId = orderIdFromRazorpayEvent(event);
    if (orderId) {
      const order = await db.order.findUnique({ where: { id: orderId } });
      if (order && order.status === "PENDING") {
        // Shared fulfillment: PAID flip + enrollment(s) — single course
        // or every course in a bundle order.
        await fulfillPaidOrder(db, order);
        await audit({
          actorId: order.userId,
          kind: "course.publish",
          payload: {
            variant: "checkout_completed",
            provider: "razorpay",
            orderId,
            grossCents: order.grossCents,
            netCents: order.netCents,
          },
          courseId: order.courseId,
        });
        // Purchase receipt — best-effort, swallows its own errors.
        await sendOrderReceipt(orderId);

        // Payouts groundwork: best-effort Route transfer of the
        // teacher's net to their activated linked account. A transfer
        // failure must never affect fulfillment — the platform simply
        // holds the funds (and the audit row flags it for follow-up).
        const paymentId = paymentIdFromRazorpayEvent(event);
        if (paymentId && order.teacherId && order.netCents > 0) {
          try {
            const acct = await db.razorpayAccount.findUnique({
              where: { teacherId: order.teacherId },
            });
            if (acct?.status === "activated") {
              const transfers = await createRouteTransfer({
                paymentId,
                accountId: acct.externalId,
                amountPaise: order.netCents,
                notes: { orderId: order.id },
              });
              await audit({
                actorId: order.userId,
                kind: "payment.route_transfer",
                payload: {
                  ok: true,
                  orderId: order.id,
                  teacherId: order.teacherId,
                  netCents: order.netCents,
                  transferIds: transfers.map((t) => t.id),
                },
                courseId: order.courseId,
              });
            }
          } catch (err) {
            console.error("[razorpay.webhook] route transfer failed", err);
            await audit({
              actorId: order.userId,
              kind: "payment.route_transfer",
              payload: {
                ok: false,
                orderId: order.id,
                teacherId: order.teacherId,
                netCents: order.netCents,
              },
              courseId: order.courseId,
            });
          }
        }
      }
    }

    // Refund sync (refund.processed / payment.refunded — fired when a
    // refund is issued from the Razorpay Dashboard; in-app Razorpay
    // refunds aren't wired, so this IS the razorpay refund path).
    // Resolve our Order.id from the payment entity's notes, falling
    // back to an API fetch of the payment when the delivery carried
    // only the refund entity. v1 semantics match the Stripe
    // charge.refunded branch: ANY refund (partial included) revokes
    // the order's enrollment(s).
    const refundInfo = refundInfoFromRazorpayEvent(event);
    if (refundInfo) {
      let refundOrderId = refundInfo.orderId;
      if (!refundOrderId && refundInfo.paymentId && isRazorpayEnabled()) {
        try {
          const payment = await fetchPayment(refundInfo.paymentId);
          refundOrderId = payment?.notes?.orderId ?? null;
        } catch (err) {
          console.error(
            "[razorpay.webhook] payment fetch for refund failed",
            err
          );
        }
      }
      const order = refundOrderId
        ? await db.order.findUnique({ where: { id: refundOrderId } })
        : null;
      if (!order) {
        console.warn("[razorpay.webhook] refund event: no order matched", {
          orderId: refundOrderId,
          paymentId: refundInfo.paymentId,
        });
      }
      if (order && order.status === "PAID") {
        await revokePaidOrder(db, order);
        await audit({
          actorId: order.userId,
          kind: "course.publish",
          payload: {
            variant: "checkout_refunded",
            provider: "razorpay",
            orderId: order.id,
            grossCents: order.grossCents,
            netCents: order.netCents,
          },
          courseId: order.courseId,
        });
      }
    }
    // Unknown / irrelevant events get a 200 so Razorpay doesn't retry.
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[razorpay.webhook] handler failed", err);
    return new Response("internal error", { status: 500 });
  }
}
