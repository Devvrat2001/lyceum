"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Btn, Icon } from "@/components/wf/primitives";
import { safeRedirect } from "@/lib/roles";

export function LoginForm({
  next,
  googleEnabled,
}: {
  next?: string;
  googleEnabled?: boolean;
}) {
  const t = useTranslations("LoginPage");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {googleEnabled && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() =>
              signIn("google", {
                callbackUrl: `/login${
                  next ? `?next=${encodeURIComponent(next)}` : ""
                }`,
              })
            }
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "10px 14px",
              border: "1.5px solid var(--wf-line)",
              borderRadius: 4,
              background: "white",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--wf-ink)",
              cursor: "pointer",
            }}
          >
            <GoogleG />
            {t("google")}
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11,
              color: "var(--wf-mute)",
            }}
          >
            <span
              style={{ flex: 1, height: 1, background: "var(--wf-hairline)" }}
            />
            {t("or")}
            <span
              style={{ flex: 1, height: 1, background: "var(--wf-hairline)" }}
            />
          </div>
        </div>
      )}
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
        if (res?.ok) {
          // signIn just set the session cookie. Read it back so we can
          // land the user on a page their role can actually reach —
          // defaulting everyone to /student sent teachers/admins/parents
          // into a redirect loop off the role gate in proxy.ts.
          const session = await getSession();
          setPending(false);
          router.replace(safeRedirect(session?.user?.role, next));
          router.refresh();
        } else {
          setPending(false);
          setError(t("signinError"));
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
          {t("emailLabel")}
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
            placeholder={t("emailPlaceholder")}
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
          {t("passwordLabel")}
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
        {pending ? t("submitting") : t("submit")}
      </Btn>

      <div
        style={{
          fontSize: 12,
          color: "var(--wf-mute)",
          textAlign: "center",
          marginTop: 4,
        }}
      >
        {t("newHere")}{" "}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          style={{ color: "var(--wf-ink)", fontWeight: 600 }}
        >
          {t("createAccount")}
        </Link>
      </div>
    </form>
    </>
  );
}

/** Google "G" mark (official 4-colour), sized for the sign-in button. */
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
