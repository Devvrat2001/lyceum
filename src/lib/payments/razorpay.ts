import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Razorpay — the India-launch payment rail (UPI + cards + netbanking).
 * Stripe stays in the codebase for the international phase, but Stripe
 * India onboarding is invite-only and UPI is effectively unavailable
 * through it, so when Razorpay keys are present they take precedence in
 * payment.createCheckoutSession.
 *
 * v1 uses **Payment Links** (REST, no SDK dependency): server-side
 * create returns a short_url the client redirects to — exactly the
 * redirect shape of Stripe Checkout and the demo flow, so zero client
 * changes. The on-page Standard Checkout overlay is a later polish.
 * Teacher revenue-split via Razorpay Route is phase 2 (collections
 * first, mirroring how Stripe Connect was phased).
 */

export function isRazorpayEnabled(): boolean {
  return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

const API_BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  return `Basic ${Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
  ).toString("base64")}`;
}

export type RazorpayPaymentLink = {
  id: string;
  short_url: string;
};

/**
 * Create a Payment Link for one order. `referenceId` is our Order.id —
 * it round-trips through the webhook (`payment_link.paid` carries
 * reference_id; `payment.captured` carries notes.orderId) so the
 * webhook can resolve the order without trusting amounts.
 */
export async function createPaymentLink(params: {
  amountPaise: number;
  referenceId: string;
  description: string;
  customerEmail?: string;
  callbackUrl: string;
}): Promise<RazorpayPaymentLink> {
  const res = await fetch(`${API_BASE}/payment_links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      reference_id: params.referenceId,
      description: params.description,
      ...(params.customerEmail
        ? {
            customer: { email: params.customerEmail },
            // We send our own receipt (sendOrderReceipt) — don't have
            // Razorpay double-notify.
            notify: { email: false, sms: false },
          }
        : {}),
      callback_url: params.callbackUrl,
      callback_method: "get",
      notes: { orderId: params.referenceId },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Razorpay payment_links failed (${res.status}): ${body.slice(0, 300)}`
    );
  }
  return (await res.json()) as RazorpayPaymentLink;
}

/**
 * Verify the `x-razorpay-signature` webhook header: hex HMAC-SHA256 of
 * the raw request body with the webhook secret. Pure — unit-tested with
 * real HMAC vectors. timingSafeEqual prevents a timing oracle; the
 * length guard comes first because timingSafeEqual throws on mismatch.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Minimal structural shape of the webhook events we handle. Razorpay
 * payloads are large; we only trust the ids we extract and re-verify
 * order state against our own DB.
 */
type RazorpayWebhookEvent = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { reference_id?: string } };
    payment?: { entity?: { notes?: { orderId?: string } } };
  };
};

/**
 * Pull our Order.id out of a verified webhook event. Two shapes:
 * `payment_link.paid` → payload.payment_link.entity.reference_id, and
 * `payment.captured` → payload.payment.entity.notes.orderId (set at
 * link creation). Returns null for anything else — callers 200 those
 * so Razorpay doesn't retry events we don't care about.
 */
export function orderIdFromRazorpayEvent(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as RazorpayWebhookEvent;
  if (e.event !== "payment_link.paid" && e.event !== "payment.captured") {
    return null;
  }
  return (
    e.payload?.payment_link?.entity?.reference_id ??
    e.payload?.payment?.entity?.notes?.orderId ??
    null
  );
}
