import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Transactional email — purchase receipts.
 *
 * Lazy-inits the Resend client, mirroring the Stripe lazy-import in
 * lib/payments/stripe.ts: returns null when RESEND_API_KEY is unset OR
 * the `resend` package isn't installed, so the codebase runs fine
 * without either. To go live: `npm i resend` + set RESEND_API_KEY.
 */
type ResendLike = {
  emails: {
    send: (params: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<unknown>;
  };
};

let _client: ResendLike | null = null;
let _initialized = false;

async function getResend(): Promise<ResendLike | null> {
  if (!env.RESEND_API_KEY) return null;
  if (_initialized) return _client;
  _initialized = true;
  try {
    // @ts-expect-error - optional dep, may not be installed
    const { Resend } = await import("resend");
    _client = new Resend(env.RESEND_API_KEY) as ResendLike;
    return _client;
  } catch {
    console.warn(
      "[email] RESEND_API_KEY set but `resend` package not installed. Run `npm i resend` to enable email."
    );
    return null;
  }
}

/** True when transactional email is configured (key present). */
export function isEmailEnabled(): boolean {
  return !!env.RESEND_API_KEY;
}

/** Sender identity for all transactional mail. */
const FROM_ADDRESS = "Lyceum <receipts@lyceum.app>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function receiptHtml(o: {
  buyerName: string;
  courseTitle: string;
  amount: string;
  paidAt: string;
  courseUrl: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Lyceum</div>
      <div style="background:#ffffff;border:1px solid #e5e3dd;border-radius:8px;padding:24px;">
        <div style="font-size:11px;letter-spacing:0.08em;color:#8a8780;text-transform:uppercase;margin-bottom:8px;">Receipt</div>
        <h1 style="font-size:18px;margin:0 0 12px;">Thanks for your purchase, ${escapeHtml(
          o.buyerName
        )}.</h1>
        <p style="font-size:14px;line-height:1.5;color:#555555;margin:0 0 20px;">
          You're enrolled. Your receipt is below &mdash; keep it for your records.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#8a8780;border-bottom:1px solid #e5e3dd;">Course</td>
            <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e5e3dd;">${escapeHtml(
              o.courseTitle
            )}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#8a8780;border-bottom:1px solid #e5e3dd;">Date</td>
            <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e5e3dd;">${escapeHtml(
              o.paidAt
            )}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#8a8780;font-weight:700;">Total paid</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(
              o.amount
            )}</td>
          </tr>
        </table>
        <a href="${o.courseUrl}" style="display:inline-block;margin-top:20px;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px;">
          Go to your course &rarr;
        </a>
      </div>
      <p style="font-size:12px;color:#8a8780;line-height:1.5;margin:16px 4px 0;">
        Course refunds are available within 14 days of purchase &mdash; reply to
        this email or contact the course's teacher. This receipt was sent by
        Lyceum.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Send a purchase-receipt email for a PAID order. Best-effort and
 * fire-safe: every failure path (no key, package missing, order not
 * found, send error) is swallowed with a log — a receipt must never
 * break the checkout flow. Called from payment.demoConfirm and the
 * Stripe `checkout.session.completed` webhook.
 */
export async function sendOrderReceipt(orderId: string): Promise<void> {
  try {
    const resend = await getResend();
    if (!resend) {
      console.info(
        `[email] receipt for order ${orderId} skipped — email not configured`
      );
      return;
    }
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        course: { select: { title: true, slug: true } },
        user: { select: { email: true, name: true, firstName: true } },
      },
    });
    if (!order || order.status !== "PAID" || !order.user.email) return;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: order.user.email,
      subject: `Your Lyceum receipt — ${order.course.title}`,
      html: receiptHtml({
        buyerName: order.user.name ?? order.user.firstName ?? "there",
        courseTitle: order.course.title,
        amount: `$${(order.grossCents / 100).toFixed(2)}`,
        paidAt: (order.paidAt ?? new Date()).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        courseUrl: `${env.PUBLIC_BASE_URL}/course/${order.course.slug}`,
      }),
    });
  } catch (err) {
    console.error("[email] sendOrderReceipt failed", err);
  }
}
