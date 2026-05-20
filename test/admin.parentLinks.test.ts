/**
 * Smoke: admin-managed parent ↔ student linking. The parent dashboard
 * at /parent reads through `ParentChild`, so if `linkParentToChild`
 * regresses, parents see "No children linked yet" forever.
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

describe("admin.linkParentToChild / unlinkParentFromChild", () => {
  it("links a PARENT to a STUDENT by email", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const parent = await createTestUser({ role: "PARENT" });
    const child = await createTestUser({ role: "STUDENT" });

    const result = await admin.caller.admin.linkParentToChild({
      parentId: parent.id,
      childEmail: child.email,
    });
    expect(result.ok).toBe(true);
    expect(result.childId).toBe(child.id);

    const link = await db.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: parent.id, childId: child.id },
      },
    });
    expect(link).toBeTruthy();
  });

  it("is idempotent — re-linking the same pair leaves exactly one row", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const parent = await createTestUser({ role: "PARENT" });
    const child = await createTestUser({ role: "STUDENT" });

    await admin.caller.admin.linkParentToChild({
      parentId: parent.id,
      childEmail: child.email,
    });
    const second = await admin.caller.admin.linkParentToChild({
      parentId: parent.id,
      childEmail: child.email,
    });
    expect(second.ok).toBe(true);

    const links = await db.parentChild.findMany({
      where: { parentId: parent.id, childId: child.id },
    });
    expect(links).toHaveLength(1);
  });

  it("normalises childEmail to lowercase before the lookup", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const parent = await createTestUser({ role: "PARENT" });
    const child = await createTestUser({ role: "STUDENT" });

    const upperEmail = child.email.toUpperCase();
    const result = await admin.caller.admin.linkParentToChild({
      parentId: parent.id,
      childEmail: upperEmail,
    });
    expect(result.childId).toBe(child.id);
  });

  it("unlink removes the row + a second unlink is a no-op", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const parent = await createTestUser({ role: "PARENT" });
    const child = await createTestUser({ role: "STUDENT" });

    await admin.caller.admin.linkParentToChild({
      parentId: parent.id,
      childEmail: child.email,
    });

    const first = await admin.caller.admin.unlinkParentFromChild({
      parentId: parent.id,
      childId: child.id,
    });
    expect(first.ok).toBe(true);

    const link = await db.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: parent.id, childId: child.id },
      },
    });
    expect(link).toBeNull();

    const second = await admin.caller.admin.unlinkParentFromChild({
      parentId: parent.id,
      childId: child.id,
    });
    expect(second.ok).toBe(true);
  });

  it("rejects linking to a TEACHER (must be STUDENT)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const parent = await createTestUser({ role: "PARENT" });
    const teacher = await createTestUser({ role: "TEACHER" });

    await expect(
      admin.caller.admin.linkParentToChild({
        parentId: parent.id,
        childEmail: teacher.email,
      })
    ).rejects.toThrow(/STUDENT/);
  });

  it("rejects when the named parentId is not a PARENT", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const notParent = await createTestUser({ role: "TEACHER" });
    const child = await createTestUser({ role: "STUDENT" });

    await expect(
      admin.caller.admin.linkParentToChild({
        parentId: notParent.id,
        childEmail: child.email,
      })
    ).rejects.toThrow(/PARENT/);
  });

  it("rejects when caller is not an ADMIN", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const parent = await createTestUser({ role: "PARENT" });
    const child = await createTestUser({ role: "STUDENT" });

    await expect(
      teacher.caller.admin.linkParentToChild({
        parentId: parent.id,
        childEmail: child.email,
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("parentLinks query returns the linked children with enrollment counts", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const parent = await createTestUser({ role: "PARENT" });
    const child = await createTestUser({ role: "STUDENT" });

    await admin.caller.admin.linkParentToChild({
      parentId: parent.id,
      childEmail: child.email,
    });

    const links = await admin.caller.admin.parentLinks({
      parentId: parent.id,
    });
    expect(links).toHaveLength(1);
    expect(links[0].childId).toBe(child.id);
    expect(links[0].email).toBe(child.email);
    expect(typeof links[0].enrollmentCount).toBe("number");
  });
});
