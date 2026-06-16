"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { safeRedirect } from "@/lib/roles";

type Role = "STUDENT" | "TEACHER";
type AgeBand = "under13" | "13to17" | "18plus";

export function SignupForm({ next }: { next?: string }) {
  const t = useTranslations("SignupPage");
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [ageBand, setAgeBand] = useState<AgeBand | "">("");
  const [parentEmail, setParentEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Teachers are adults — the age band only applies to students.
  const needsAge = role === "STUDENT";
  const isUnder13 = needsAge && ageBand === "under13";

  const signup = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      // Auto sign-in with the new credentials.
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.ok) {
        router.replace(safeRedirect(role, next));
        router.refresh();
      } else {
        setError(t("createdSignIn"));
        router.push("/login");
      }
    },
    onError: (e) => setError(e.message),
  });

  const passwordMismatch =
    password.length > 0 && confirm.length > 0 && password !== confirm;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (passwordMismatch) {
          setError(t("mismatch"));
          return;
        }
        if (password.length < 8) {
          setError(t("errPasswordLength"));
          return;
        }
        if (needsAge && !ageBand) {
          setError(t("errAge"));
          return;
        }
        if (isUnder13 && !parentEmail.includes("@")) {
          setError(t("errParent"));
          return;
        }
        if (!consent) {
          setError(t("errConsent"));
          return;
        }
        signup.mutate({
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          role,
          ...(needsAge && ageBand ? { ageBand } : {}),
          ...(isUnder13 ? { parentEmail: parentEmail.trim() } : {}),
          consent,
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <Field label={t("firstNameLabel")}>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          placeholder={t("firstNamePlaceholder")}
          required
          style={inputStyle}
        />
      </Field>

      <Field label={t("emailLabel")}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          required
          style={inputStyle}
        />
      </Field>

      <Field label={t("passwordLabel")}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          required
          minLength={8}
          style={inputStyle}
        />
      </Field>

      <Field label={t("confirmLabel")}>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          required
          minLength={8}
          style={inputStyle}
        />
        {passwordMismatch && (
          <span style={{ fontSize: 11, color: "var(--wf-accent)" }}>
            {t("mismatch")}
          </span>
        )}
      </Field>

      <Field label={t("roleLabel")}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["STUDENT", "TEACHER"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              style={{
                flex: 1,
                padding: "10px 14px",
                border: `1.5px solid ${
                  role === r ? "var(--wf-ink)" : "var(--wf-hairline)"
                }`,
                borderRadius: 4,
                background: role === r ? "var(--wf-ink)" : "white",
                color: role === r ? "white" : "var(--wf-ink)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Icon
                name={r === "STUDENT" ? "user" : "book"}
                size={13}
                color="currentColor"
              />
              {r === "STUDENT" ? t("roleStudent") : t("roleTeacher")}
            </button>
          ))}
        </div>
      </Field>

      {needsAge && (
        <Field label={t("ageLabel")}>
          <select
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value as AgeBand | "")}
            required
            style={{ ...inputStyle, appearance: "auto" }}
          >
            <option value="" disabled>
              {t("ageSelect")}
            </option>
            <option value="under13">{t("ageUnder13")}</option>
            <option value="13to17">{t("age13to17")}</option>
            <option value="18plus">{t("age18plus")}</option>
          </select>
        </Field>
      )}

      {isUnder13 && (
        <Field label={t("parentLabel")}>
          <input
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder={t("parentPlaceholder")}
            required
            style={inputStyle}
          />
        </Field>
      )}

      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          fontSize: 12,
          color: "var(--wf-body)",
          lineHeight: 1.45,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          style={{ marginTop: 2 }}
        />
        <span>{isUnder13 ? t("consentUnder13") : t("consentRegular")}</span>
      </label>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "var(--wf-accent)",
            padding: "6px 10px",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      <Btn
        type="submit"
        variant="primary"
        disabled={signup.isPending || passwordMismatch}
        full
      >
        {signup.isPending ? t("submitting") : t("submit")}
      </Btn>

    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 14,
  border: "1.5px solid var(--wf-line)",
  outline: "none",
  background: "white",
  padding: "10px 14px",
  borderRadius: 4,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <span
        className="wf-mono"
        style={{
          fontSize: 10,
          color: "var(--wf-mute)",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
