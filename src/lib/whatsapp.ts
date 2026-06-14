import "server-only";
import { env } from "@/lib/env";

/**
 * WhatsApp notification channel (REQUIREMENTS R23) — India table stakes.
 *
 * Dormant by design, exactly like `lib/email.ts` is dormant without
 * RESEND_API_KEY: every sender is a logged no-op until BOTH
 * WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set, so the app
 * (and the test suite) runs fine with the channel off. The day those
 * env vars land on Vercel, streak nudges / assignment-due reminders /
 * the parent weekly digest start flowing with zero code changes.
 *
 * Transport is the Meta Graph "Cloud API" over plain fetch (no SDK to
 * install). Business-initiated messages must use pre-approved message
 * *templates* — so each sender targets a named template and passes its
 * body parameters positionally. Template names are config, defaulted to
 * sensible slugs; rename to match whatever gets approved in the Meta
 * dashboard.
 */

const GRAPH_VERSION = "v21.0";

/** True when the WhatsApp channel is fully configured (both vars set). */
export function isWhatsAppEnabled(): boolean {
  return !!env.WHATSAPP_API_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID;
}

/**
 * Normalize a phone number to the digits-only E.164-style form the
 * Graph API wants (no '+', spaces, or dashes). Returns null when there
 * aren't enough digits to be a real number — the caller skips the send.
 */
export function normalizeWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Low-level template send. Fire-safe: returns false (never throws) on a
 * missing config, a bad number, or a transport/HTTP error, so a nudge
 * can never break the cron loop or a mutation that triggers it.
 */
export async function sendWhatsAppTemplate(args: {
  to: string;
  template: string;
  /** Positional body params, substituted into the template's {{1}}, {{2}}… */
  bodyParams: string[];
  /** BCP-47-ish language code the template was approved under. */
  language?: string;
}): Promise<boolean> {
  if (!isWhatsAppEnabled()) {
    console.info(
      `[whatsapp] ${args.template} skipped — channel not configured`
    );
    return false;
  }
  const to = normalizeWhatsAppNumber(args.to);
  if (!to) {
    console.warn(`[whatsapp] ${args.template} skipped — invalid number`);
    return false;
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: args.template,
            language: { code: args.language ?? "en" },
            components: [
              {
                type: "body",
                parameters: args.bodyParams.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          },
        }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      console.error(
        `[whatsapp] ${args.template} send failed (${res.status}): ${detail}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[whatsapp] ${args.template} send threw`, err);
    return false;
  }
}

/** Streak-at-risk nudge: "Hi {1}, your {2}-day streak ends tonight…". */
export function sendStreakNudge(o: {
  to: string;
  firstName: string;
  streak: number;
}): Promise<boolean> {
  return sendWhatsAppTemplate({
    to: o.to,
    template: "streak_reminder",
    bodyParams: [o.firstName, String(o.streak)],
  });
}

/** Assignment-due reminder: "Hi {1}, '{2}' is due {3}.". */
export function sendAssignmentDue(o: {
  to: string;
  firstName: string;
  assignmentTitle: string;
  dueLabel: string;
}): Promise<boolean> {
  return sendWhatsAppTemplate({
    to: o.to,
    template: "assignment_due",
    bodyParams: [o.firstName, o.assignmentTitle, o.dueLabel],
  });
}

/** Parent weekly digest: "{1} did {2} lessons and earned {3} XP this week.". */
export function sendParentDigest(o: {
  to: string;
  childName: string;
  lessonsCompleted: number;
  xpEarned: number;
}): Promise<boolean> {
  return sendWhatsAppTemplate({
    to: o.to,
    template: "parent_weekly_digest",
    bodyParams: [
      o.childName,
      String(o.lessonsCompleted),
      String(o.xpEarned),
    ],
  });
}
