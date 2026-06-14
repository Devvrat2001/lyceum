/**
 * WhatsApp channel scaffolding (REQUIREMENTS R23). Dormant without the
 * env vars: senders must be safe no-ops returning false, and the number
 * normalizer must reject junk. No network is touched while disabled.
 */
import { describe, expect, it, vi } from "vitest";
import {
  isWhatsAppEnabled,
  normalizeWhatsAppNumber,
  sendParentDigest,
  sendStreakNudge,
} from "@/lib/whatsapp";

describe("normalizeWhatsAppNumber", () => {
  it("strips formatting to digits and rejects too-short input", () => {
    expect(normalizeWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("(044) 2345-6789")).toBe("04423456789");
    expect(normalizeWhatsAppNumber("123")).toBeNull();
    expect(normalizeWhatsAppNumber("not-a-number")).toBeNull();
  });
});

describe("dormant channel", () => {
  it("is disabled in the test env (no WHATSAPP_* vars)", () => {
    expect(isWhatsAppEnabled()).toBe(false);
  });

  it("senders are safe no-ops returning false and never fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const a = await sendStreakNudge({
      to: "+91 98765 43210",
      firstName: "Asha",
      streak: 5,
    });
    const b = await sendParentDigest({
      to: "+91 98765 43210",
      childName: "Asha",
      lessonsCompleted: 3,
      xpEarned: 120,
    });
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
