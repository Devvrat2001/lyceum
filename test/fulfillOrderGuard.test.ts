/**
 * KNOWN_ISSUES S2-6 guard — `fulfillPaidOrder` must refuse an order that has
 * neither courseId nor pathId (the shape the Prisma pg-adapter bind-param drop
 * can persist for a bundle order). It must throw BEFORE flipping the order to
 * PAID, so we never mark an order paid while enrolling the buyer in nothing.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { fulfillPaidOrder } from "@/server/services/fulfillOrder";
import { createTestUser, cleanupTestUsers } from "./helpers";

afterAll(async () => {
  await cleanupTestUsers();
  await db.$disconnect();
});

describe("fulfillPaidOrder — S2-6 both-null guard", () => {
  it("refuses to fulfill an order with neither courseId nor pathId, leaving it PENDING", async () => {
    const buyer = await createTestUser({ role: "STUDENT" });
    // Directly create the corrupted shape (the Order XOR CHECK is deferred
    // pending the adapter fix, so this insert is currently allowed).
    const order = await db.order.create({
      data: {
        userId: buyer.id,
        grossCents: 100,
        feeCents: 15,
        netCents: 85,
        provider: "demo",
        externalId: `demo_${randomUUID()}`,
      },
      select: { id: true, userId: true, courseId: true, pathId: true },
    });

    await expect(fulfillPaidOrder(db, order)).rejects.toThrow(/S2-6|neither/);

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("PENDING");
    expect(after.paidAt).toBeNull();

    await db.order.deleteMany({ where: { id: order.id } });
  });
});
