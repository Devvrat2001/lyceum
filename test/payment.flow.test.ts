/**
 * Smoke: the demo-mode happy path for paid course checkout. This is
 * the longest chain in the app — `createCheckoutSession` writes an
 * Order(PENDING), then `demoConfirm` flips it to PAID + creates an
 * Enrollment in one transaction. If either side breaks, marketplace
 * conversions silently zero out.
 *
 * Real-Stripe mode is intentionally out of scope: the test runs with
 * no STRIPE_SECRET_KEY, so `isStripeEnabled()` returns false and the
 * router takes the demo branch.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function findPaidCourse() {
  const course = await db.course.findFirst({
    where: { priceCents: { gt: 0 } },
  });
  if (!course) {
    throw new Error(
      "No paid course in DB — run `npm run db:seed` before tests."
    );
  }
  return course;
}

describe("payment demo flow: createCheckoutSession → demoConfirm", () => {
  it("starts in PENDING + finishes in PAID with a matching Enrollment", async () => {
    const course = await findPaidCourse();
    const buyer = await createTestUser({ role: "STUDENT" });

    const start = await buyer.caller.payment.createCheckoutSession({
      courseId: course.id,
    });
    expect(start.alreadyEnrolled).toBe(false);
    expect(start.provider).toBe("demo");
    expect(start.orderId).toBeTruthy();
    expect(start.url).toContain("/demo-checkout/");

    const pendingOrder = await db.order.findUnique({
      where: { id: start.orderId! },
    });
    expect(pendingOrder?.status).toBe("PENDING");
    expect(pendingOrder?.grossCents).toBe(course.priceCents);
    expect(pendingOrder?.userId).toBe(buyer.id);
    // Pre-confirm: no enrollment row yet.
    const preEnroll = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId: buyer.id, courseId: course.id },
      },
    });
    expect(preEnroll).toBeNull();

    const confirm = await buyer.caller.payment.demoConfirm({
      orderId: start.orderId!,
    });
    expect(confirm.ok).toBe(true);
    expect(confirm.alreadyPaid).toBe(false);
    expect(confirm.courseSlug).toBe(course.slug);

    const paidOrder = await db.order.findUnique({
      where: { id: start.orderId! },
    });
    expect(paidOrder?.status).toBe("PAID");
    expect(paidOrder?.paidAt).not.toBeNull();

    const enrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId: buyer.id, courseId: course.id },
      },
    });
    expect(enrollment).toBeTruthy();
  });

  it("re-confirming an already-paid order is a no-op (idempotent)", async () => {
    const course = await findPaidCourse();
    const buyer = await createTestUser({ role: "STUDENT" });

    const start = await buyer.caller.payment.createCheckoutSession({
      courseId: course.id,
    });
    await buyer.caller.payment.demoConfirm({ orderId: start.orderId! });
    const again = await buyer.caller.payment.demoConfirm({
      orderId: start.orderId!,
    });
    expect(again.ok).toBe(true);
    expect(again.alreadyPaid).toBe(true);
  });

  it("createCheckoutSession on an already-owned course short-circuits to alreadyEnrolled", async () => {
    const course = await findPaidCourse();
    const buyer = await createTestUser({ role: "STUDENT" });
    const first = await buyer.caller.payment.createCheckoutSession({
      courseId: course.id,
    });
    await buyer.caller.payment.demoConfirm({ orderId: first.orderId! });

    const second = await buyer.caller.payment.createCheckoutSession({
      courseId: course.id,
    });
    expect(second.alreadyEnrolled).toBe(true);
    expect(second.orderId).toBeNull();
    expect(second.url).toBe(`/course/${course.slug}`);
  });

  it("rejects checkout for a free course (use course.enroll instead)", async () => {
    const free = await db.course.findFirst({ where: { priceCents: 0 } });
    if (!free) throw new Error("No free course in DB — run db:seed");
    const buyer = await createTestUser({ role: "STUDENT" });
    await expect(
      buyer.caller.payment.createCheckoutSession({ courseId: free.id })
    ).rejects.toThrow(/free courses/);
  });

  it("a foreign user cannot demoConfirm someone else's order", async () => {
    const course = await findPaidCourse();
    const buyer = await createTestUser({ role: "STUDENT" });
    const thief = await createTestUser({ role: "STUDENT" });

    const start = await buyer.caller.payment.createCheckoutSession({
      courseId: course.id,
    });
    await expect(
      thief.caller.payment.demoConfirm({ orderId: start.orderId! })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
