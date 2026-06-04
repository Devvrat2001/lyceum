import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gatherStudentReportData } from "@/server/services/studentReport";
import { renderStudentReportPdf } from "@/lib/reports/StudentReportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Student progress report PDF — a parent-friendly snapshot. Always scoped to
 * the signed-in user's OWN id (never a query param), so there's no surface to
 * pull another student's report.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user) return new Response("Sign in required.", { status: 401 });

  const data = await gatherStudentReportData(db, user.id);
  const pdf = await renderStudentReportPdf(data);
  const filename = `progress-report-${data.generatedAt
    .toISOString()
    .slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
