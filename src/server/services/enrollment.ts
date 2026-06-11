import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

type EnrollmentExtras = Partial<
  Pick<
    Prisma.EnrollmentCreateManyInput,
    "lastActivityAt" | "progressPct" | "completed"
  >
>;

/**
 * Create the (userId, courseId) Enrollment if it's missing and bump the
 * denormalized `Course.enrollCount` in the same transaction. The counter
 * drives the marketplace "Popular" sort and every "N students" figure
 * (teacher cards, storefronts), and the bare `enrollment.upsert`s this
 * replaces never touched it — so organically-created courses sat at
 * "0 students" forever no matter how many students enrolled.
 *
 * When the row already exists, `extras` (activity/progress fields) are
 * applied as a plain update instead and the counter is left alone — so
 * re-enrolls and webhook re-deliveries can never double-count. Race-safe:
 * `createMany + skipDuplicates` is atomic on the (userId, courseId)
 * unique index, so two concurrent first-enrollments insert (and count)
 * exactly once.
 *
 * Accepts either the root client (wraps create+increment in its own
 * transaction) or a TransactionClient from a caller already inside one.
 */
export async function ensureEnrollment(
  db: Db,
  userId: string,
  courseId: string,
  extras?: EnrollmentExtras
): Promise<{ created: boolean }> {
  const run = async (tx: Db) => {
    const inserted = await tx.enrollment.createMany({
      data: { userId, courseId, ...extras },
      skipDuplicates: true,
    });
    const created = inserted.count === 1;
    if (created) {
      await tx.course.update({
        where: { id: courseId },
        data: { enrollCount: { increment: 1 } },
      });
    } else if (extras && Object.keys(extras).length > 0) {
      await tx.enrollment.update({
        where: { userId_courseId: { userId, courseId } },
        data: extras,
      });
    }
    return { created };
  };
  return "$transaction" in db ? db.$transaction(run) : run(db);
}

/**
 * Exact mirror of `ensureEnrollment` for the refund paths: delete the
 * (userId, courseId) Enrollment if present and decrement the denormalized
 * `Course.enrollCount` in the same transaction. Without this, every refund
 * left the counter one too high forever (the delete never touched it), so
 * "N students" drifted upward as refunds accumulated.
 *
 * Idempotent: removing a missing row is a no-op (webhook re-deliveries are
 * safe). The decrement is guarded with `enrollCount > 0` so historical
 * drift can never push the counter negative.
 */
export async function removeEnrollment(
  db: Db,
  userId: string,
  courseId: string
): Promise<{ removed: boolean }> {
  const run = async (tx: Db) => {
    const deleted = await tx.enrollment.deleteMany({
      where: { userId, courseId },
    });
    const removed = deleted.count === 1;
    if (removed) {
      await tx.course.updateMany({
        where: { id: courseId, enrollCount: { gt: 0 } },
        data: { enrollCount: { decrement: 1 } },
      });
    }
    return { removed };
  };
  return "$transaction" in db ? db.$transaction(run) : run(db);
}
