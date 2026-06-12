import type { PrismaClient } from "@prisma/client";
import { ensureEnrollment, removeEnrollment } from "./enrollment";

/**
 * Flip a PENDING order to PAID and create the enrollment(s) it bought —
 * one course, or every course in a bundle (path) order — in a single
 * transaction. Shared by payment.demoConfirm and the Stripe + Razorpay
 * webhooks so all three providers fulfill identically and bundle
 * support can never drift per-provider.
 *
 * Callers gate on `status === "PENDING"` for webhook re-delivery
 * idempotency; ensureEnrollment dedupes (and keeps each course's
 * enrollCount honest) regardless.
 */
export async function fulfillPaidOrder(
  db: PrismaClient,
  order: {
    id: string;
    userId: string;
    courseId: string | null;
    pathId: string | null;
  }
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (order.courseId) {
      await ensureEnrollment(tx, order.userId, order.courseId, {
        lastActivityAt: new Date(),
      });
    } else if (order.pathId) {
      const pathCourses = await tx.pathCourse.findMany({
        where: { pathId: order.pathId },
        select: { courseId: true },
      });
      for (const pc of pathCourses) {
        await ensureEnrollment(tx, order.userId, pc.courseId, {
          lastActivityAt: new Date(),
        });
      }
    }
  });
}

/**
 * The inverse of fulfillPaidOrder: flip a PAID order to REFUNDED and
 * revoke the enrollment(s) it bought — the single course, or every
 * course in a bundle — in one transaction. Shared by the teacher demo
 * refund and the Stripe + Razorpay refund webhooks so revocation can
 * never drift per-provider. removeEnrollment keeps each course's
 * enrollCount honest (deletes are hard deletes: the student loses
 * access immediately; re-buying later creates a fresh row).
 *
 * Callers gate on `status === "PAID"` for webhook re-delivery
 * idempotency; removeEnrollment is itself a no-op on missing rows.
 */
export async function revokePaidOrder(
  db: PrismaClient,
  order: {
    id: string;
    userId: string;
    courseId: string | null;
    pathId: string | null;
  }
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    if (order.courseId) {
      await removeEnrollment(tx, order.userId, order.courseId);
    } else if (order.pathId) {
      const pathCourses = await tx.pathCourse.findMany({
        where: { pathId: order.pathId },
        select: { courseId: true },
      });
      for (const pc of pathCourses) {
        await removeEnrollment(tx, order.userId, pc.courseId);
      }
    }
  });
}
