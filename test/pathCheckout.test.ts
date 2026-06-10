/**
 * payment.createPathCheckout + bundle fulfillment — paid multi-course
 * bundles produce a real Order (pathId, no courseId) and confirming it
 * enrolls EVERY course in the path via the shared fulfillPaidOrder.
 * Regressions here would let bundle money through without enrollments,
 * double-charge fully-owned students, or mis-handle bundle refunds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

const TEST_PATH_SLUG_PREFIX = "test-vitest";

async function cleanupTestPaths() {
  await db.path.deleteMany({
    where: { slug: { startsWith: TEST_PATH_SLUG_PREFIX } },
  });
}

beforeAll(async () => {
  await cleanupTestPaths();
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestPaths();
  await cleanupTestUsers();
});

async function makeCourse(ownerId: string, priceCents: number) {
  return db.course.create({
    data: {
      slug: `test-vitest-pathco-${crypto.randomUUID()}`,
      title: "Bundled Course",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      authorLabel: "Test Teacher",
      priceCents,
      status: "PUBLISHED",
    },
  });
}

async function makePaidBundle(
  teacher: Awaited<ReturnType<typeof createTestUser>>
) {
  const a = await makeCourse(teacher.id, 49900);
  const b = await makeCourse(teacher.id, 49900);
  const path = await teacher.caller.path.create({
    title: "Test Vitest Paid Pack",
    priceCents: 79900,
    courseIds: [a.id, b.id],
  });
  return { path, courseA: a, courseB: b };
}

describe("payment.createPathCheckout", () => {
  it("creates a PENDING bundle order and demoConfirm enrolls every course", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { path, courseA, courseB } = await makePaidBundle(teacher);

    // No payment keys in the test env → demo provider.
    const checkout = await student.caller.payment.createPathCheckout({
      pathId: path.id,
    });
    expect(checkout.alreadyEnrolled).toBe(false);
    expect(checkout.url).toBe(`/demo-checkout/${checkout.orderId}`);

    const order = await db.order.findUniqueOrThrow({
      where: { id: checkout.orderId! },
    });
    expect(order.pathId).toBe(path.id);
    expect(order.courseId).toBeNull();
    expect(order.teacherId).toBe(teacher.id);
    expect(order.grossCents).toBe(79900);
    expect(order.status).toBe("PENDING");

    const confirm = await student.caller.payment.demoConfirm({
      orderId: order.id,
    });
    expect(confirm.ok).toBe(true);
    expect(confirm.pathSlug).toBe(path.slug);
    expect(confirm.courseSlug).toBeNull();

    const after = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe("PAID");

    // Every course in the bundle is enrolled + counted.
    for (const c of [courseA, courseB]) {
      const enr = await db.enrollment.findUnique({
        where: {
          userId_courseId: { userId: student.id, courseId: c.id },
        },
      });
      expect(enr).toBeTruthy();
      const course = await db.course.findUniqueOrThrow({
        where: { id: c.id },
        select: { enrollCount: true },
      });
      expect(course.enrollCount).toBe(1);
    }
  });

  it("rejects free bundles (those go through path.enroll)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const a = await makeCourse(teacher.id, 0);
    const b = await makeCourse(teacher.id, 0);
    const path = await teacher.caller.path.create({
      title: "Test Vitest Free Buy Pack",
      priceCents: 0,
      courseIds: [a.id, b.id],
    });
    await expect(
      student.caller.payment.createPathCheckout({ pathId: path.id })
    ).rejects.toThrow(/free/i);
  });

  it("short-circuits when the student already owns every course", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { path, courseA, courseB } = await makePaidBundle(teacher);
    await db.enrollment.createMany({
      data: [
        { userId: student.id, courseId: courseA.id },
        { userId: student.id, courseId: courseB.id },
      ],
    });

    const res = await student.caller.payment.createPathCheckout({
      pathId: path.id,
    });
    expect(res.alreadyEnrolled).toBe(true);
    expect(res.orderId).toBeNull();
  });

  it("refuses to demo-refund a bundle order (v1 scope)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { path } = await makePaidBundle(teacher);

    const checkout = await student.caller.payment.createPathCheckout({
      pathId: path.id,
    });
    await student.caller.payment.demoConfirm({ orderId: checkout.orderId! });

    await expect(
      teacher.caller.payment.refundOrder({ orderId: checkout.orderId! })
    ).rejects.toThrow(/bundle/i);
  });
});
