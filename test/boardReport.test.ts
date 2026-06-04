/**
 * Board report — data gatherer + PDF renderer.
 *
 * The render assertions check the @react-pdf/renderer pipeline actually emits
 * valid PDF bytes (the "%PDF-" magic) in the Node runtime, including the
 * empty-section / no-brand-color paths. The gatherer test asserts the
 * institution snapshot is shaped correctly off real rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  gatherBoardReportData,
  resolveAdminInstitutionId,
  type BoardReportData,
} from "@/server/services/boardReport";
import { renderBoardReportPdf } from "@/lib/reports/BoardReportPdf";
import { cleanupTestUsers, createTestUser } from "./helpers";

const createdInstitutionIds: string[] = [];

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
  if (createdInstitutionIds.length > 0) {
    await db.institution.deleteMany({
      where: { id: { in: createdInstitutionIds } },
    });
  }
});

function pdfMagic(buf: Buffer): string {
  return buf.subarray(0, 5).toString("latin1");
}

const SAMPLE: BoardReportData = {
  institutionName: "Test Academy",
  brandColor: "#2563eb",
  generatedAt: new Date("2026-06-04T00:00:00.000Z"),
  kpis: [
    { label: "Students", value: "120" },
    { label: "Teachers", value: "8" },
    { label: "Avg quiz score", value: "82%" },
  ],
  topTeachers: [{ name: "Ms. Rivera", classes: 3, students: 64 }],
  insights: [{ kind: "STRENGTH", body: "Engagement is up 12% over last month." }],
};

describe("renderBoardReportPdf", () => {
  it("emits valid PDF bytes for a populated report", async () => {
    const buf = await renderBoardReportPdf(SAMPLE);
    expect(buf.length).toBeGreaterThan(500);
    expect(pdfMagic(buf)).toBe("%PDF-");
  });

  it("renders cleanly with no brand color and empty sections", async () => {
    const buf = await renderBoardReportPdf({
      ...SAMPLE,
      brandColor: null,
      topTeachers: [],
      insights: [],
    });
    expect(pdfMagic(buf)).toBe("%PDF-");
  });
});

describe("gatherBoardReportData", () => {
  it("snapshots an institution's headline counts", async () => {
    const institution = await db.institution.create({
      data: { slug: `test-vitest-inst-${crypto.randomUUID()}`, name: "Cedar High" },
    });
    createdInstitutionIds.push(institution.id);

    await createTestUser({ role: "TEACHER", institutionId: institution.id });
    await createTestUser({ role: "STUDENT", institutionId: institution.id });
    await createTestUser({ role: "STUDENT", institutionId: institution.id });

    const data = await gatherBoardReportData(db, institution.id);

    expect(data.institutionName).toBe("Cedar High");
    const kpi = (label: string) =>
      data.kpis.find((k) => k.label === label)?.value;
    expect(kpi("Students")).toBe("2");
    expect(kpi("Teachers")).toBe("1");
    // No attempts seeded for this fresh institution → avg renders as a dash.
    expect(kpi("Avg quiz score")).toBe("—");
    expect(data.insights).toEqual([]);

    // And the snapshot renders to a valid PDF end-to-end.
    const buf = await renderBoardReportPdf(data);
    expect(pdfMagic(buf)).toBe("%PDF-");
  });

  it("resolveAdminInstitutionId returns the admin's own institution", async () => {
    const institution = await db.institution.create({
      data: { slug: `test-vitest-inst-${crypto.randomUUID()}`, name: "Birch" },
    });
    createdInstitutionIds.push(institution.id);
    const admin = await createTestUser({
      role: "ADMIN",
      institutionId: institution.id,
    });
    const resolved = await resolveAdminInstitutionId(db, admin.id);
    expect(resolved).toBe(institution.id);
  });
});
