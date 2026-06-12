import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Annual earnings CSV export for teachers (R27 — currency-neutral;
 * formerly /api/teacher/1099, renamed because the product is INR-first
 * and the export was never US-tax-specific).
 *
 * GET /api/teacher/earnings-export?year=YYYY
 *
 * Returns one row per PAID Order with paidAt in the requested year,
 * plus a totals footer. Amounts are major currency units (paise/cents
 * ÷ 100, fixed-2) with the order's currency in its own column — the
 * teacher takes this to their accountant in any jurisdiction.
 *
 * Auth: TEACHER or ADMIN only. Admin gets THEIR rows (admins also
 * accumulate orders if seeded); querying-as-another-teacher is not
 * supported in v1 — keep it out of the URL surface entirely.
 *
 * Year range guard: 2020..currentYear+1 (someone running this in
 * January for prior year is the most common case).
 */
export const runtime = "nodejs";

const MIN_YEAR = 2020;

function csvField(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const v = String(s);
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Minor units → major units (paise→₹, cents→$), 2dp. Currency-agnostic
 *  by design — the currency code travels in its own CSV column. */
function majorUnits(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) {
    return new Response("Sign in required.", { status: 401 });
  }
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    return new Response("Teachers only.", { status: 403 });
  }

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const now = new Date();
  const maxYear = now.getUTCFullYear() + 1;
  const parsedYear = yearParam ? parseInt(yearParam, 10) : now.getUTCFullYear();
  if (
    !Number.isFinite(parsedYear) ||
    parsedYear < MIN_YEAR ||
    parsedYear > maxYear
  ) {
    return new Response(
      `Bad year — must be between ${MIN_YEAR} and ${maxYear}.`,
      { status: 400 }
    );
  }

  const yearStart = new Date(Date.UTC(parsedYear, 0, 1));
  const yearEnd = new Date(Date.UTC(parsedYear + 1, 0, 1));

  const orders = await db.order.findMany({
    where: {
      teacherId: user.id,
      status: "PAID",
      paidAt: { gte: yearStart, lt: yearEnd },
    },
    orderBy: { paidAt: "asc" },
    include: {
      course: { select: { slug: true, title: true } },
      path: { select: { slug: true, title: true } },
      user: { select: { name: true, firstName: true, email: true } },
    },
  });

  const rows: string[] = [];
  rows.push(
    [
      "Order ID",
      "Paid Date (UTC)",
      "Course Slug",
      "Course Title",
      "Buyer",
      "Buyer Email",
      "Gross",
      "Platform Fee",
      "Net",
      "Currency",
      "Provider",
    ]
      .map(csvField)
      .join(",")
  );

  let totalGross = 0;
  let totalFee = 0;
  let totalNet = 0;

  for (const o of orders) {
    totalGross += o.grossCents;
    totalFee += o.feeCents;
    totalNet += o.netCents;
    rows.push(
      [
        o.id,
        o.paidAt
          ? o.paidAt.toISOString().slice(0, 10)
          : "",
        o.course?.slug ?? o.path?.slug ?? "—",
        o.course?.title ?? (o.path ? `Bundle: ${o.path.title}` : "—"),
        o.user.name ?? o.user.firstName ?? "Anonymous",
        o.user.email,
        majorUnits(o.grossCents),
        majorUnits(o.feeCents),
        majorUnits(o.netCents),
        o.currency.toUpperCase(),
        o.provider,
      ]
        .map(csvField)
        .join(",")
    );
  }

  // Blank separator + totals footer. Spreadsheets ignore the blank
  // row; humans can read the totals at a glance.
  rows.push("");
  rows.push(
    [
      `${orders.length} order${orders.length === 1 ? "" : "s"}`,
      "",
      "",
      "",
      "",
      "TOTALS:",
      majorUnits(totalGross),
      majorUnits(totalFee),
      majorUnits(totalNet),
      "",
      "",
    ]
      .map(csvField)
      .join(",")
  );

  // UTF-8 BOM so Excel auto-detects encoding (non-ASCII course names
  // or buyer names otherwise show as mojibake in Excel/Numbers).
  const body = "﻿" + rows.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lyceum-earnings-${parsedYear}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
