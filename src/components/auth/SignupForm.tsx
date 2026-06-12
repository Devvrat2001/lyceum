"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { safeRedirect } from "@/lib/roles";

type Role = "STUDENT" | "TEACHER";
type AgeBand = "under13" | "13to17" | "18plus";

export function SignupForm({ next }: { next?: string }) {
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
        setError("Account created. Please sign in.");
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
          setError("Passwords don't match.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        if (needsAge && !ageBand) {
          setError("Pick your age range.");
          return;
        }
        if (isUnder13 && !parentEmail.includes("@")) {
          setError("Under-13 signups need a parent or guardian email.");
          return;
        }
        if (!consent) {
          setError("Please accept the terms to continue.");
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
      <Field label="FIRST NAME">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          placeholder="Jordan"
          required
          style={inputStyle}
        />
      </Field>

      <Field label="EMAIL">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@school.edu"
          required
          style={inputStyle}
        />
      </Field>

      <Field label="PASSWORD · 8+ CHARACTERS">
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

      <Field label="CONFIRM PASSWORD">
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
            Passwords don&apos;t match.
          </span>
        )}
      </Field>

      <Field label="I'M A">
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
              {r === "STUDENT" ? "Student" : "Teacher"}
            </button>
          ))}
        </div>
      </Field>

      {needsAge && (
        <Field label="AGE">
          <select
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value as AgeBand | "")}
            required
            style={{ ...inputStyle, appearance: "auto" }}
          >
            <option value="" disabled>
              Select your age range
            </option>
            <option value="under13">Under 13</option>
            <option value="13to17">13–17</option>
            <option value="18plus">18 or older</option>
          </select>
        </Field>
      )}

      {isUnder13 && (
        <Field label="PARENT / GUARDIAN EMAIL">
          <input
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder="parent@example.com"
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
        <span>
          {isUnder13
            ? "My parent or guardian has reviewed and agrees to Lyceum's terms of service and privacy policy on my behalf."
            : "I agree to Lyceum's terms of service and privacy policy (with my parent or guardian's consent where required)."}
        </span>
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
        {signup.isPending ? "Creating account…" : "Create account →"}
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
