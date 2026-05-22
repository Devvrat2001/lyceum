"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";
import { safeRedirect } from "@/lib/roles";

type Role = "STUDENT" | "TEACHER";

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [error, setError] = useState<string | null>(null);

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
        signup.mutate({
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          role,
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

      <p
        style={{
          fontSize: 11,
          color: "var(--wf-mute)",
          textAlign: "center",
          margin: 0,
        }}
      >
        By creating an account, you agree to Lyceum&apos;s terms of service
        and privacy policy. K-12 users require parent consent.
      </p>
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
