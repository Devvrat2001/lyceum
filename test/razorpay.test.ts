/**
 * Pure halves of the Razorpay integration: webhook signature
 * verification and event → Order.id extraction. The webhook route is a
 * thin verify+dedup+dispatch over these (the PENDING→PAID+enroll flip
 * it performs is the same transaction shape already DB-tested via
 * payment.demoConfirm and ensureEnrollment), so — like the Mux webhook
 * tests — covering the pure parts covers the behaviour without forging
 * deliveries.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  orderIdFromRazorpayEvent,
  paymentIdFromRazorpayEvent,
  refundInfoFromRazorpayEvent,
  verifyRazorpaySignature,
} from "@/lib/payments/razorpay";

const SECRET = "test_whsec_vitest";
const sign = (body: string) =>
  crypto.createHmac("sha256", SECRET).update(body).digest("hex");

describe("verifyRazorpaySignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ event: "payment_link.paid", n: 1 });
    expect(verifyRazorpaySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "payment_link.paid", n: 1 });
    const tampered = body.replace('"n":1', '"n":2');
    expect(verifyRazorpaySignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a missing or wrong-length signature without throwing", () => {
    const body = "{}";
    expect(verifyRazorpaySignature(body, null, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, "abc", SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const body = "{}";
    const wrong = crypto
      .createHmac("sha256", "other_secret")
      .update(body)
      .digest("hex");
    expect(verifyRazorpaySignature(body, wrong, SECRET)).toBe(false);
  });
});

describe("orderIdFromRazorpayEvent", () => {
  it("reads reference_id from payment_link.paid", () => {
    expect(
      orderIdFromRazorpayEvent({
        event: "payment_link.paid",
        payload: {
          payment_link: { entity: { reference_id: "order_abc" } },
        },
      })
    ).toBe("order_abc");
  });

  it("reads notes.orderId from payment.captured", () => {
    expect(
      orderIdFromRazorpayEvent({
        event: "payment.captured",
        payload: {
          payment: { entity: { notes: { orderId: "order_xyz" } } },
        },
      })
    ).toBe("order_xyz");
  });

  it("returns null for unrelated events and junk", () => {
    expect(
      orderIdFromRazorpayEvent({ event: "refund.processed", payload: {} })
    ).toBeNull();
    expect(orderIdFromRazorpayEvent(null)).toBeNull();
    expect(orderIdFromRazorpayEvent("payment_link.paid")).toBeNull();
    expect(
      orderIdFromRazorpayEvent({ event: "payment_link.paid", payload: {} })
    ).toBeNull();
  });
});

describe("refundInfoFromRazorpayEvent", () => {
  it("reads orderId from payment notes on payment.refunded", () => {
    expect(
      refundInfoFromRazorpayEvent({
        event: "payment.refunded",
        payload: {
          payment: {
            entity: { id: "pay_1", notes: { orderId: "order_abc" } },
          },
        },
      })
    ).toEqual({ orderId: "order_abc", paymentId: "pay_1" });
  });

  it("reads orderId from the inline payment entity on refund.processed", () => {
    expect(
      refundInfoFromRazorpayEvent({
        event: "refund.processed",
        payload: {
          refund: { entity: { payment_id: "pay_2" } },
          payment: {
            entity: { id: "pay_2", notes: { orderId: "order_xyz" } },
          },
        },
      })
    ).toEqual({ orderId: "order_xyz", paymentId: "pay_2" });
  });

  it("falls back to the refund entity's payment_id when no payment entity ships", () => {
    expect(
      refundInfoFromRazorpayEvent({
        event: "refund.processed",
        payload: { refund: { entity: { payment_id: "pay_3" } } },
      })
    ).toEqual({ orderId: null, paymentId: "pay_3" });
  });

  it("returns null for non-refund events and junk", () => {
    expect(
      refundInfoFromRazorpayEvent({ event: "payment.captured", payload: {} })
    ).toBeNull();
    expect(refundInfoFromRazorpayEvent(null)).toBeNull();
    expect(refundInfoFromRazorpayEvent("refund.processed")).toBeNull();
  });
});

describe("paymentIdFromRazorpayEvent", () => {
  it("reads the payment entity id from either event shape", () => {
    const payload = { payment: { entity: { id: "pay_123" } } };
    expect(
      paymentIdFromRazorpayEvent({ event: "payment.captured", payload })
    ).toBe("pay_123");
    expect(
      paymentIdFromRazorpayEvent({ event: "payment_link.paid", payload })
    ).toBe("pay_123");
  });

  it("returns null when the payment entity is absent or input is junk", () => {
    expect(
      paymentIdFromRazorpayEvent({ event: "payment_link.paid", payload: {} })
    ).toBeNull();
    expect(paymentIdFromRazorpayEvent(null)).toBeNull();
    expect(paymentIdFromRazorpayEvent(42)).toBeNull();
  });
});
