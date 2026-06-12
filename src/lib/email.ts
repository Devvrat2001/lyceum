import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/currency";

/**
 * Email — purchase receipts (transactional) + weekly progress digests
 * (engagement, opt-out-gated).
 *
 * Lazy-inits the Resend client, mirroring the Stripe lazy-import in
 * lib/payments/stripe.ts: returns null when RESEND_API_KEY is unset, so
 * the codebase (and the test suite) runs fine without a key — every send
 * becomes a logged no-op rather than an error. To go live: set
 * RESEND_API_KEY (the `resend` package is already a dependency).
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
    const { Resend } = await import("resend");
    _client = new Resend(env.RESEND_API_KEY) as unknown as ResendLike;
    return _client;
  } catch (err) {
    console.warn("[email] failed to initialize Resend client", err);
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
        path: { select: { title: true } },
        user: { select: { email: true, name: true, firstName: true } },
      },
    });
    if (!order || order.status !== "PAID" || !order.user.email) return;

    // Single-course orders link to the course page; bundle orders have
    // no public detail page yet, so they link home.
    const itemTitle =
      order.course?.title ?? order.path?.title ?? "your purchase";
    const itemUrl = order.course
      ? `${env.PUBLIC_BASE_URL}/course/${order.course.slug}`
      : env.PUBLIC_BASE_URL;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: order.user.email,
      subject: `Your Lyceum receipt — ${itemTitle}`,
      html: receiptHtml({
        buyerName: order.user.name ?? order.user.firstName ?? "there",
        courseTitle: itemTitle,
        amount: formatMoney(order.grossCents),
        paidAt: (order.paidAt ?? new Date()).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        courseUrl: itemUrl,
      }),
    });
  } catch (err) {
    console.error("[email] sendOrderReceipt failed", err);
  }
}

/** Sender identity for account/security mail (R10). */
const ACCOUNT_FROM_ADDRESS = "Lyceum <account@lyceum.app>";

/** Small shared template for account-action emails (reset / verify). */
function actionEmailHtml(o: {
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Lyceum</div>
      <div style="background:#ffffff;border:1px solid #e5e3dd;border-radius:8px;padding:24px;">
        <div style="font-size:11px;letter-spacing:0.08em;color:#8a8780;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(
          o.eyebrow
        )}</div>
        <h1 style="font-size:18px;margin:0 0 12px;">${escapeHtml(o.heading)}</h1>
        <p style="font-size:14px;line-height:1.5;color:#555555;margin:0 0 20px;">${escapeHtml(
          o.body
        )}</p>
        <a href="${o.ctaUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px;">
          ${escapeHtml(o.ctaLabel)} &rarr;
        </a>
      </div>
      <p style="font-size:12px;color:#8a8780;line-height:1.5;margin:16px 4px 0;">${escapeHtml(
        o.footer
      )}</p>
    </div>
  </body>
</html>`;
}

/**
 * Password-reset link email. Fire-safe boolean like sendWeeklyDigest —
 * the request mutation always answers the same regardless, so the
 * response can't be used to probe which addresses exist.
 */
export async function sendPasswordResetEmail(o: {
  to: string;
  firstName: string;
  resetUrl: string;
}): Promise<boolean> {
  try {
    const resend = await getResend();
    if (!resend) {
      console.info("[email] password reset skipped — email not configured");
      return false;
    }
    await resend.emails.send({
      from: ACCOUNT_FROM_ADDRESS,
      to: o.to,
      subject: "Reset your Lyceum password",
      html: actionEmailHtml({
        eyebrow: "Password reset",
        heading: `Hi ${o.firstName} — reset your password`,
        body: "Someone (hopefully you) asked to reset the password for this Lyceum account. The link below works for 1 hour. If you didn't ask, you can safely ignore this email — nothing changes until the link is used.",
        ctaLabel: "Choose a new password",
        ctaUrl: o.resetUrl,
        footer:
          "This security email is sent to the account's address whenever a reset is requested.",
      }),
    });
    return true;
  } catch (err) {
    console.error("[email] sendPasswordResetEmail failed", err);
    return false;
  }
}

/** Email-address verification link, sent on signup. Fire-safe. */
export async function sendVerificationEmail(o: {
  to: string;
  firstName: string;
  verifyUrl: string;
}): Promise<boolean> {
  try {
    const resend = await getResend();
    if (!resend) return false;
    await resend.emails.send({
      from: ACCOUNT_FROM_ADDRESS,
      to: o.to,
      subject: "Verify your Lyceum email",
      html: actionEmailHtml({
        eyebrow: "Verify your email",
        heading: `Welcome, ${o.firstName}!`,
        body: "Confirm this is your email address so we can send receipts and account notices to the right place. The link works for 24 hours.",
        ctaLabel: "Verify my email",
        ctaUrl: o.verifyUrl,
        footer:
          "You're getting this because this address was used to create a Lyceum account. If that wasn't you, ignore this email.",
      }),
    });
    return true;
  } catch (err) {
    console.error("[email] sendVerificationEmail failed", err);
    return false;
  }
}

/** Sender identity for engagement (non-transactional) mail. */
const DIGEST_FROM_ADDRESS = "Lyceum <hello@lyceum.app>";

/** One student's weekly-progress digest. Shaped by `buildWeeklyDigests`. */
export type WeeklyDigestPayload = {
  to: string;
  firstName: string;
  lessonsCompleted: number;
  questionsAnswered: number;
  questionsCorrect: number;
  xpEarned: number;
  streak: number;
  dashboardUrl: string;
};

function statRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#8a8780;border-bottom:1px solid #e5e3dd;">${label}</td>
    <td style="padding:8px 0;text-align:right;font-weight:700;border-bottom:1px solid #e5e3dd;">${value}</td>
  </tr>`;
}

function digestHtml(d: WeeklyDigestPayload): string {
  const accuracy =
    d.questionsAnswered > 0
      ? `${Math.round((d.questionsCorrect / d.questionsAnswered) * 100)}%`
      : "—";
  const streakLine =
    d.streak > 0
      ? `<p style="font-size:14px;line-height:1.5;color:#1a1a1a;margin:0 0 20px;">
           🔥 You're on a <strong>${d.streak}-day streak</strong> — keep it alive today.
         </p>`
      : "";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Lyceum</div>
      <div style="background:#ffffff;border:1px solid #e5e3dd;border-radius:8px;padding:24px;">
        <div style="font-size:11px;letter-spacing:0.08em;color:#8a8780;text-transform:uppercase;margin-bottom:8px;">Your week in review</div>
        <h1 style="font-size:18px;margin:0 0 12px;">Nice work this week, ${escapeHtml(
          d.firstName
        )}.</h1>
        ${streakLine}
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${statRow("Lessons completed", String(d.lessonsCompleted))}
          ${statRow("Questions answered", String(d.questionsAnswered))}
          ${statRow("Accuracy", accuracy)}
          ${statRow("XP earned", `${d.xpEarned} XP`)}
        </table>
        <a href="${
          d.dashboardUrl
        }" style="display:inline-block;margin-top:20px;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px;">
          Pick up where you left off &rarr;
        </a>
      </div>
      <p style="font-size:12px;color:#8a8780;line-height:1.5;margin:16px 4px 0;">
        You're getting this weekly summary because you have a Lyceum learner
        account. Don't want it? Turn off &ldquo;weekly progress emails&rdquo; in
        your account settings &mdash; receipts and account notices still arrive.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Send one student's weekly-progress digest. Best-effort and fire-safe:
 * a missing key or send error is swallowed with a log (a digest must
 * never throw into the cron loop). Returns true only when a message was
 * actually handed to Resend, so the caller can report a real sent-count.
 *
 * Audience selection + opt-out filtering happen upstream in
 * `buildWeeklyDigests` — by the time we're here, this address has already
 * earned the email.
 */
export async function sendWeeklyDigest(
  payload: WeeklyDigestPayload
): Promise<boolean> {
  try {
    const resend = await getResend();
    if (!resend) return false;
    await resend.emails.send({
      from: DIGEST_FROM_ADDRESS,
      to: payload.to,
      subject: `Your week on Lyceum — ${payload.lessonsCompleted} lesson${
        payload.lessonsCompleted === 1 ? "" : "s"
      } done`,
      html: digestHtml(payload),
    });
    return true;
  } catch (err) {
    console.error("[email] sendWeeklyDigest failed", err);
    return false;
  }
}
