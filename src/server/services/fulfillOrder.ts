import type { PrismaClient } from "@prisma/client";
import { ensureEnrollment } from "./enrollment";

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
