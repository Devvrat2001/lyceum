/**
 * payment.linkRazorpayAccount + razorpayPayoutStatus — the Route
 * payouts groundwork. Regressions here would let a non-admin claim a
 * linked account (routing other people's money), link a non-teacher,
 * or report the wrong payout state on the earnings page.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("payment.linkRazorpayAccount", () => {
  it("admin links a teacher; the teacher sees the status", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const teacher = await createTestUser({ role: "TEACHER" });

    const before = await teacher.caller.payment.razorpayPayoutStatus();
    expect(before.linked).toBe(false);

    const linked = await admin.caller.payment.linkRazorpayAccount({
      teacherId: teacher.id,
      accountId: "acc_TestVitest123",
    });
    expect(linked.ok).toBe(true);
    expect(linked.status).toBe("activated"); // default

    const after = await teacher.caller.payment.razorpayPayoutStatus();
    expect(after).toEqual({ linked: true, status: "activated" });
  });

  it("re-linking upserts (new id / status) instead of duplicating", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const teacher = await createTestUser({ role: "TEACHER" });

    await admin.caller.payment.linkRazorpayAccount({
      teacherId: teacher.id,
      accountId: "acc_TestVitestA",
    });
    const relinked = await admin.caller.payment.linkRazorpayAccount({
      teacherId: teacher.id,
      accountId: "acc_TestVitestB",
      status: "suspended",
    });
    expect(relinked.accountId).toBe("acc_TestVitestB");
    expect(relinked.status).toBe("suspended");

    const status = await teacher.caller.payment.razorpayPayoutStatus();
    expect(status).toEqual({ linked: true, status: "suspended" });
  });

  it("rejects malformed account ids and non-teacher targets", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const student = await createTestUser({ role: "STUDENT" });
    const teacher = await createTestUser({ role: "TEACHER" });

    await expect(
      admin.caller.payment.linkRazorpayAccount({
        teacherId: teacher.id,
        accountId: "not-an-account",
      })
    ).rejects.toThrow(/acc_/);

    await expect(
      admin.caller.payment.linkRazorpayAccount({
        teacherId: student.id,
        accountId: "acc_TestVitestS",
      })
    ).rejects.toThrow(/TEACHER/i);
  });

  it("is admin-only — teachers can't self-claim an account", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    await expect(
      teacher.caller.payment.linkRazorpayAccount({
        teacherId: teacher.id,
        accountId: "acc_TestVitestSelf",
      })
    ).rejects.toThrow();
  });
});
