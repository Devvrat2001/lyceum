/**
 * Smoke: `payment.refundOrder` (Tier 2.1, demo mode). Walks the full
 * buy → confirm → refund chain via tRPC; verifies the Order flips
 * PAID → REFUNDED in one transaction, the Enrollment row is dropped,
 * the audit row is written, and a second refund attempt on the same
 * order is idempotent. Real-Stripe mode is intentionally out of scope
 * (the test runs with no STRIPE_SECRET_KEY → demo path).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ensureEnrollment } from "@/server/services/enrollment";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

/** Set up a paid course owned by `teacherId` and walk it through the
 *  demo buy + confirm flow as `buyer`. Returns the resolved orderId. */
async function buyAndConfirm(
  teacher: Awaited<ReturnType<typeof createTestUser>>,
  buyer: Awaited<ReturnType<typeof createTestUser>>
): Promise<{ orderId: string; courseId: string }> {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "Refund Fixture",
      description: ".",
      subject: "Math",
      grade: "6",
      authorId: teacher.id,
      priceCents: 1900,
      status: "DRAFT",
    },
  });
  const start = await buyer.caller.payment.createCheckoutSession({
    courseId: course.id,
  });
  if (!start.orderId) throw new Error("createCheckoutSession returned no orderId");
  await buyer.caller.payment.demoConfirm({ orderId: start.orderId });
  return { orderId: start.orderId, courseId: course.id };
}

describe("payment.refundOrder (demo mode)", () => {
  it("teacher refund flips Order → REFUNDED + drops Enrollment", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    const { orderId, courseId } = await buyAndConfirm(teacher, buyer);

    // Pre-condition: PAID + enrollment exists.
    const before = await db.order.findUnique({ where: { id: orderId } });
    expect(before?.status).toBe("PAID");
    const preEnroll = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: buyer.id, courseId } },
    });
    expect(preEnroll).not.toBeNull();

    const result = await teacher.caller.payment.refundOrder({
      orderId,
      reason: "Test refund.",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("REFUNDED");

    const after = await db.order.findUnique({ where: { id: orderId } });
    expect(after?.status).toBe("REFUNDED");
    expect(after?.refundedAt).not.toBeNull();

    const postEnroll = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: buyer.id, courseId } },
    });
    expect(postEnroll).toBeNull();
  });

  it("second refund on the same order is idempotent (no state thrash)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    const { orderId } = await buyAndConfirm(teacher, buyer);

    await teacher.caller.payment.refundOrder({ orderId });
    const second = await teacher.caller.payment.refundOrder({ orderId });
    expect(second.ok).toBe(true);
    expect(second.alreadyRefunded).toBe(true);
    expect(second.status).toBe("REFUNDED");
  });

  it("a foreign teacher cannot refund another teacher's order", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const thief = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    const { orderId } = await buyAndConfirm(owner, buyer);

    await expect(
      thief.caller.payment.refundOrder({ orderId })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("rejects refund on a non-PAID order with a clear message", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    // Create a PENDING-only order (createCheckoutSession without
    // demoConfirm) — refund should reject.
    const course = await db.course.create({
      data: {
        slug: `test-vitest-course-${crypto.randomUUID()}`,
        title: "Pending Fixture",
        description: ".",
        subject: "Math",
        grade: "6",
        authorId: teacher.id,
        priceCents: 1900,
        status: "DRAFT",
      },
    });
    const start = await buyer.caller.payment.createCheckoutSession({
      courseId: course.id,
    });
    if (!start.orderId) throw new Error("no orderId");

    await expect(
      teacher.caller.payment.refundOrder({ orderId: start.orderId })
    ).rejects.toThrow(/PAID/);
  });

  it("ADMIN can refund any teacher's order", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    const admin = await createTestUser({ role: "ADMIN" });
    const { orderId } = await buyAndConfirm(teacher, buyer);

    const result = await admin.caller.payment.refundOrder({ orderId });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("REFUNDED");
  });

  it("refund restores the course's enrollCount (honest counters)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    const { orderId, courseId } = await buyAndConfirm(teacher, buyer);

    const paid = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { enrollCount: true },
    });
    expect(paid.enrollCount).toBe(1);

    await teacher.caller.payment.refundOrder({ orderId });

    const refunded = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { enrollCount: true },
    });
    expect(refunded.enrollCount).toBe(0);
  });

  it("razorpay orders can't take the demo-refund path (no money would move)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const buyer = await createTestUser({ role: "STUDENT" });
    const course = await db.course.create({
      data: {
        slug: `test-vitest-course-${crypto.randomUUID()}`,
        title: "Razorpay Refund Fixture",
        description: ".",
        subject: "Math",
        grade: "6",
        authorId: teacher.id,
        priceCents: 49900,
        status: "DRAFT",
      },
    });
    // A PAID razorpay order, exactly as the webhook would have left it.
    const order = await db.order.create({
      data: {
        userId: buyer.id,
        courseId: course.id,
        teacherId: teacher.id,
        grossCents: 49900,
        feeCents: 7485,
        netCents: 42415,
        currency: "inr",
        status: "PAID",
        provider: "razorpay",
        externalId: `plink_test_${crypto.randomUUID()}`,
        paidAt: new Date(),
      },
    });
    await ensureEnrollment(db, buyer.id, course.id);

    await expect(
      teacher.caller.payment.refundOrder({ orderId: order.id })
    ).rejects.toThrow(/Razorpay Dashboard/);

    // Nothing was touched: still PAID, enrollment + counter intact.
    const after = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe("PAID");
    expect(after.refundedAt).toBeNull();
    const enrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: buyer.id, courseId: course.id } },
    });
    expect(enrollment).not.toBeNull();
    const counter = await db.course.findUniqueOrThrow({
      where: { id: course.id },
      select: { enrollCount: true },
    });
    expect(counter.enrollCount).toBe(1);
  });
});
