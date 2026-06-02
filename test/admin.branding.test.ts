/**
 * Smoke: `admin.updateBranding` / `admin.branding` — the editor behind the
 * /admin/branding page (Phase 6.5, last ComingSoon stub). Each test creates
 * its OWN institution so the write never touches the seeded Cedar Middle
 * row (updateBranding falls back to the first institution when an admin has
 * none — which would otherwise corrupt the seed).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

const INST_PREFIX = "test-vitest-";

async function cleanup() {
  // Users first (they FK onto Institution), then the test institutions.
  await cleanupTestUsers();
  await db.institution.deleteMany({
    where: { slug: { startsWith: INST_PREFIX } },
  });
}

beforeAll(cleanup);
afterAll(cleanup);

function freshInstitution() {
  return db.institution.create({
    data: {
      slug: `${INST_PREFIX}inst-${crypto.randomUUID()}`,
      name: "Test Institution",
    },
  });
}

describe("admin.updateBranding / admin.branding", () => {
  it("sets name + accent colour and reads them back", async () => {
    const inst = await freshInstitution();
    const admin = await createTestUser({
      role: "ADMIN",
      institutionId: inst.id,
    });

    const res = await admin.caller.admin.updateBranding({
      name: "Cedar Prep",
      brandColor: "#2563eb",
    });
    expect(res.ok).toBe(true);

    const got = await admin.caller.admin.branding();
    expect(got.name).toBe("Cedar Prep");
    expect(got.brandColor).toBe("#2563eb");

    const row = await db.institution.findUnique({
      where: { id: inst.id },
      select: { name: true, brandColor: true },
    });
    expect(row?.name).toBe("Cedar Prep");
    expect(row?.brandColor).toBe("#2563eb");
  });

  it("clears the accent when brandColor is null", async () => {
    const inst = await freshInstitution();
    const admin = await createTestUser({
      role: "ADMIN",
      institutionId: inst.id,
    });

    await admin.caller.admin.updateBranding({ brandColor: "#059669" });
    await admin.caller.admin.updateBranding({ brandColor: null });

    const row = await db.institution.findUnique({
      where: { id: inst.id },
      select: { brandColor: true },
    });
    expect(row?.brandColor).toBeNull();
  });

  it("rejects an invalid hex colour", async () => {
    const inst = await freshInstitution();
    const admin = await createTestUser({
      role: "ADMIN",
      institutionId: inst.id,
    });

    await expect(
      admin.caller.admin.updateBranding({ brandColor: "blue" })
    ).rejects.toThrow(/hex/i);
  });

  it("rejects a non-admin caller (FORBIDDEN)", async () => {
    const inst = await freshInstitution();
    const teacher = await createTestUser({
      role: "TEACHER",
      institutionId: inst.id,
    });

    await expect(
      teacher.caller.admin.updateBranding({ name: "Nope" })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("scopes the write to the admin's own institution", async () => {
    const instA = await freshInstitution();
    const instB = await freshInstitution();
    const adminA = await createTestUser({
      role: "ADMIN",
      institutionId: instA.id,
    });

    await adminA.caller.admin.updateBranding({
      name: "Alpha",
      brandColor: "#7c3aed",
    });

    const b = await db.institution.findUnique({
      where: { id: instB.id },
      select: { name: true, brandColor: true },
    });
    expect(b?.name).toBe("Test Institution"); // untouched
    expect(b?.brandColor).toBeNull();

    const a = await db.institution.findUnique({
      where: { id: instA.id },
      select: { name: true },
    });
    expect(a?.name).toBe("Alpha");
  });
});
