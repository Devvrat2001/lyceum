"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/react";
import { Btn, Card, Eyebrow } from "@/components/wf/primitives";

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--wf-hairline)",
  borderRadius: 4,
  fontSize: 14,
  width: "100%",
  background: "transparent",
  color: "inherit",
};

function Shell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--wf-bg)",
        padding: 24,
      }}
    >
      <Card p={28} style={{ width: "100%", maxWidth: 420 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 24, margin: "8px 0 16px" }}>
          {title}
        </h1>
        {children}
        <div style={{ marginTop: 18, fontSize: 12 }}>
          <Link
            href="/login"
            style={{
              color: "var(--wf-accent)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ← Back to sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}

/** /forgot-password — request a reset link. Response copy never reveals
 *  whether the address has an account. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
  });

  return (
    <Shell eyebrow="Password reset" title="Forgot your password?">
      {sent ? (
        <p style={{ fontSize: 13, color: "var(--wf-body)", lineHeight: 1.5 }}>
          If an account exists for <b>{email}</b>, a reset link is on its way.
          It works for 1 hour — check spam if it doesn&apos;t arrive.
        </p>
      ) : (
        <>
          <p
            style={{
              fontSize: 13,
              color: "var(--wf-body)",
              lineHeight: 1.5,
              marginBottom: 14,
            }}
          >
            Enter your account email and we&apos;ll send a link to choose a
            new password.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            autoFocus
          />
          {request.error && (
            <div
              style={{ marginTop: 8, fontSize: 12, color: "var(--wf-bad)" }}
            >
              {request.error.message}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Btn
              variant="primary"
              full
              disabled={!email.includes("@") || request.isPending}
              onClick={() => request.mutate({ email })}
            >
              {request.isPending ? "Sending…" : "Send reset link"}
            </Btn>
          </div>
        </>
      )}
    </Shell>
  );
}

/** /reset-password?token&email — set the new password. */
export function ResetPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
  });
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit = pw.length >= 8 && pw === pw2 && !reset.isPending;

  if (!token || !email) {
    return (
      <Shell eyebrow="Password reset" title="Missing reset link">
        <p style={{ fontSize: 13, color: "var(--wf-body)" }}>
          Open the link from your reset email — it carries the token this
          page needs.
        </p>
      </Shell>
    );
  }

  return (
    <Shell eyebrow="Password reset" title="Choose a new password">
      {done ? (
        <p style={{ fontSize: 13, color: "var(--wf-good)", lineHeight: 1.5 }}>
          Password updated ✓ — sign in with it now.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password (min 8 characters)"
              style={inputStyle}
              autoFocus
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Repeat new password"
              style={inputStyle}
            />
          </div>
          {mismatch && (
            <div
              style={{ marginTop: 8, fontSize: 12, color: "var(--wf-bad)" }}
            >
              Passwords don&apos;t match.
            </div>
          )}
          {reset.error && (
            <div
              style={{ marginTop: 8, fontSize: 12, color: "var(--wf-bad)" }}
            >
              {reset.error.message}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Btn
              variant="primary"
              full
              disabled={!canSubmit}
              onClick={() => reset.mutate({ email, token, password: pw })}
            >
              {reset.isPending ? "Saving…" : "Set new password"}
            </Btn>
          </div>
        </>
      )}
    </Shell>
  );
}

/** /verify-email?token&email — fires the verification once on load. */
export function VerifyEmailClient({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  // A missing token/email is knowable at render time — derive the
  // initial state from props instead of setState-ing in the effect.
  const missingLink = !token || !email;
  const firedRef = useRef(false);
  const [state, setState] = useState<"working" | "ok" | "error">(
    missingLink ? "error" : "working"
  );
  const [message, setMessage] = useState(
    missingLink ? "Open the link from your verification email." : ""
  );
  const verify = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => setState("ok"),
    onError: (e) => {
      setState("error");
      setMessage(e.message);
    },
  });

  useEffect(() => {
    if (firedRef.current || missingLink) return;
    firedRef.current = true;
    // One-shot mutation fire on mount (external system); results land
    // via the mutation callbacks, never synchronously here.
    verify.mutate({ token, email });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell eyebrow="Email verification" title="Verifying your email…">
      {state === "working" && (
        <p style={{ fontSize: 13, color: "var(--wf-mute)" }}>One moment…</p>
      )}
      {state === "ok" && (
        <p style={{ fontSize: 13, color: "var(--wf-good)", lineHeight: 1.5 }}>
          Email verified ✓ — receipts and account notices will reach you at{" "}
          <b>{email}</b>.
        </p>
      )}
      {state === "error" && (
        <p style={{ fontSize: 13, color: "var(--wf-bad)", lineHeight: 1.5 }}>
          {message}
        </p>
      )}
    </Shell>
  );
}

/**
 * Parental-consent confirmation (R47, COPPA). The parent lands here from
 * the emailed link; fires the confirm mutation once on mount and shows the
 * outcome. Mirrors VerifyEmailClient.
 */
export function ParentalConsentClient({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const missingLink = !token || !email;
  const firedRef = useRef(false);
  const [state, setState] = useState<"working" | "ok" | "error">(
    missingLink ? "error" : "working"
  );
  const [message, setMessage] = useState(
    missingLink ? "Open the link from the consent email." : ""
  );
  const confirm = trpc.auth.confirmParentalConsent.useMutation({
    onSuccess: () => setState("ok"),
    onError: (e) => {
      setState("error");
      setMessage(e.message);
    },
  });

  useEffect(() => {
    if (firedRef.current || missingLink) return;
    firedRef.current = true;
    confirm.mutate({ token, email });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell eyebrow="Parental consent" title="Confirming consent…">
      {state === "working" && (
        <p style={{ fontSize: 13, color: "var(--wf-mute)" }}>One moment…</p>
      )}
      {state === "ok" && (
        <p style={{ fontSize: 13, color: "var(--wf-good)", lineHeight: 1.5 }}>
          Thank you ✓ — you&apos;ve approved this Lyceum account. Your child can
          now use it fully.
        </p>
      )}
      {state === "error" && (
        <p style={{ fontSize: 13, color: "var(--wf-bad)", lineHeight: 1.5 }}>
          {message}
        </p>
      )}
    </Shell>
  );
}
