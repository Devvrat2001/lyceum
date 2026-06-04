import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  gatherBoardReportData,
  resolveAdminInstitutionId,
} from "@/server/services/boardReport";
import { renderBoardReportPdf } from "@/lib/reports/BoardReportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Board report PDF — a trustee-facing institution snapshot (KPIs, top teachers,
 * AI insights). Mirrors the auth posture of /api/teacher/1099: ADMIN only,
 * scoped to the admin's own institution; querying another institution is not
 * a URL-surface option.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) return new Response("Sign in required.", { status: 401 });
  if (user.role !== "ADMIN") return new Response("Admins only.", { status: 403 });

  const institutionId = await resolveAdminInstitutionId(db, user.id);
  if (!institutionId) {
    return new Response("No institution found for this admin.", { status: 404 });
  }

  const data = await gatherBoardReportData(db, institutionId);
  const pdf = await renderBoardReportPdf(data);
  const filename = `board-report-${data.generatedAt
    .toISOString()
    .slice(0, 10)}.pdf`;

  // Buffer is a Uint8Array — a valid BodyInit for the Web Response.
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
