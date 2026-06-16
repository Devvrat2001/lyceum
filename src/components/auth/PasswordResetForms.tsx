"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("AuthRecovery");
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
            {t("backToSignIn")}
          </Link>
        </div>
      </Card>
    </div>
  );
}

/** /forgot-password — request a reset link. Response copy never reveals
 *  whether the address has an account. */
export function ForgotPasswordForm() {
  const t = useTranslations("AuthRecovery");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
  });

  return (
    <Shell eyebrow={t("fpEyebrow")} title={t("fpTitle")}>
      {sent ? (
        <p style={{ fontSize: 13, color: "var(--wf-body)", lineHeight: 1.5 }}>
          {t.rich("fpSent", { email, b: (c) => <b>{c}</b> })}
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
            {t("fpIntro")}
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("fpEmailPlaceholder")}
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
              {request.isPending ? t("fpSending") : t("fpSend")}
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
  const t = useTranslations("AuthRecovery");
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
      <Shell eyebrow={t("fpEyebrow")} title={t("rpMissingTitle")}>
        <p style={{ fontSize: 13, color: "var(--wf-body)" }}>
          {t("rpMissingBody")}
        </p>
      </Shell>
    );
  }

  return (
    <Shell eyebrow={t("fpEyebrow")} title={t("rpTitle")}>
      {done ? (
        <p style={{ fontSize: 13, color: "var(--wf-good)", lineHeight: 1.5 }}>
          {t("rpDone")}
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t("rpNewPlaceholder")}
              style={inputStyle}
              autoFocus
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder={t("rpRepeatPlaceholder")}
              style={inputStyle}
            />
          </div>
          {mismatch && (
            <div
              style={{ marginTop: 8, fontSize: 12, color: "var(--wf-bad)" }}
            >
              {t("rpMismatch")}
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
              {reset.isPending ? t("rpSaving") : t("rpSet")}
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
  const t = useTranslations("AuthRecovery");
  // A missing token/email is knowable at render time — derive the
  // initial state from props instead of setState-ing in the effect.
  const missingLink = !token || !email;
  const firedRef = useRef(false);
  const [state, setState] = useState<"working" | "ok" | "error">(
    missingLink ? "error" : "working"
  );
  const [message, setMessage] = useState(
    missingLink ? t("veMissing") : ""
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
    <Shell eyebrow={t("veEyebrow")} title={t("veTitle")}>
      {state === "working" && (
        <p style={{ fontSize: 13, color: "var(--wf-mute)" }}>{t("oneMoment")}</p>
      )}
      {state === "ok" && (
        <p style={{ fontSize: 13, color: "var(--wf-good)", lineHeight: 1.5 }}>
          {t.rich("veOk", { email, b: (c) => <b>{c}</b> })}
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
  const t = useTranslations("AuthRecovery");
  const missingLink = !token || !email;
  const firedRef = useRef(false);
  const [state, setState] = useState<"working" | "ok" | "error">(
    missingLink ? "error" : "working"
  );
  const [message, setMessage] = useState(
    missingLink ? t("pcMissing") : ""
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
    <Shell eyebrow={t("pcEyebrow")} title={t("pcTitle")}>
      {state === "working" && (
        <p style={{ fontSize: 13, color: "var(--wf-mute)" }}>{t("oneMoment")}</p>
      )}
      {state === "ok" && (
        <p style={{ fontSize: 13, color: "var(--wf-good)", lineHeight: 1.5 }}>
          {t("pcOk")}
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
