"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Btn, Icon } from "@/components/wf/primitives";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        setPending(false);
        if (res?.ok) {
          router.replace(next ?? "/student");
          router.refresh();
        } else {
          setError(
            "Couldn't sign you in. Check your email and password, or sign up below."
          );
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            letterSpacing: "0.08em",
          }}
        >
          EMAIL
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            border: "1.5px solid var(--wf-line)",
            borderRadius: 4,
            background: "white",
          }}
        >
          <Icon name="user" size={14} color="var(--wf-mute)" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@school.edu"
            style={{
              flex: 1,
              fontSize: 14,
              border: "none",
              outline: "none",
              background: "transparent",
            }}
          />
        </div>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            letterSpacing: "0.08em",
          }}
        >
          PASSWORD
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            border: "1.5px solid var(--wf-line)",
            borderRadius: 4,
            background: "white",
          }}
        >
          <Icon name="lock" size={14} color="var(--wf-mute)" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            style={{
              flex: 1,
              fontSize: 14,
              border: "none",
              outline: "none",
              background: "transparent",
            }}
          />
        </div>
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

      <Btn type="submit" variant="primary" disabled={pending} full>
        {pending ? "Signing in…" : "Sign in →"}
      </Btn>

      <div
        style={{
          fontSize: 12,
          color: "var(--wf-mute)",
          textAlign: "center",
          marginTop: 4,
        }}
      >
        New here?{" "}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          style={{ color: "var(--wf-ink)", fontWeight: 600 }}
        >
          Create an account
        </Link>
      </div>
    </form>
  );
}
