import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAwaitingParentalConsent } from "@/lib/parentalConsent";
import { Icon } from "@/components/wf/primitives";

/**
 * Soft parental-consent nudge (R47 v2). An under-13 learner whose parent
 * hasn't confirmed yet sees this banner. Deliberately NOT a hard block:
 * the confirm email is dormant until R44, so gating lesson access would
 * lock every under-13 account out permanently. Renders nothing for
 * everyone else (13+, confirmed, or signed-out).
 */
export async function ParentalConsentBanner() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { ageBand: true, parentConsentAt: true, parentEmail: true },
  });
  if (!u || !isAwaitingParentalConsent(u)) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        margin: "16px 28px 0",
        padding: "12px 16px",
        background: "var(--wf-ai-soft)",
        border: "1px solid var(--wf-ai)",
        borderRadius: 8,
      }}
    >
      <Icon name="lock" size={16} color="var(--wf-ai)" />
      <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--wf-ink)" }}>
        <strong>Waiting for a grown-up to confirm your account.</strong> We
        emailed your parent or guardian
        {u.parentEmail ? ` (${u.parentEmail})` : ""} a link to approve it. Ask
        them to check their inbox — you can keep exploring in the meantime.
      </div>
    </div>
  );
}
