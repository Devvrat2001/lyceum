import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, isGoogleAuthEnabled } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isEmailEnabled } from "@/lib/email";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { LoginForm } from "@/components/auth/LoginForm";
import { QuickLoginButton } from "@/components/auth/QuickLoginButton";
import { homeForRole, safeRedirect } from "@/lib/roles";

export const metadata = { title: "Sign in · Lyceum" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  // Honor `next` only if the role can reach it — a role-forbidden `next`
  // (or none) falls back to the role's own dashboard. Blindly redirecting
  // to `next` bounced non-students back here via proxy.ts forever.
  if (session?.user)
    redirect(safeRedirect(session.user.role, sp.next));

  const t = await getTranslations("LoginPage");

  // Dev-only demo accounts panel. Production builds never see this.
  const isDev = env.NODE_ENV === "development";
  const seededUsers = isDev
    ? await db.user.findMany({
        where: { passwordHash: null }, // only demo seeds
        orderBy: [{ role: "asc" }, { email: "asc" }],
        select: { email: true, name: true, firstName: true, role: true },
      })
    : [];

  const grouped = {
    STUDENT: seededUsers.filter((u) => u.role === "STUDENT"),
    TEACHER: seededUsers.filter((u) => u.role === "TEACHER"),
    ADMIN: seededUsers.filter((u) => u.role === "ADMIN"),
    PARENT: seededUsers.filter((u) => u.role === "PARENT"),
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr",
        background: "var(--wf-bg)",
      }}
    >
      <div
        style={{
          padding: "48px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 560,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "var(--wf-ink)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--wf-bg)",
              fontFamily: "var(--font-serif-stack)",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            L
          </div>
          <span
            style={{
              fontFamily: "var(--font-serif-stack)",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Lyceum
          </span>
        </div>

        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 32, margin: "8px 0 12px" }}>
          {t("heading")}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--wf-body)",
            marginBottom: 28,
            lineHeight: 1.5,
          }}
        >
          {t("intro")}
        </p>

        {sp.error && (
          <div
            style={{
              marginBottom: 20,
              padding: 12,
              border: "1px solid var(--wf-accent)",
              background: "var(--wf-accent-soft)",
              fontSize: 12,
              color: "var(--wf-accent)",
              borderRadius: 4,
            }}
          >
            {sp.error === "CredentialsSignin"
              ? t("errorCredentials")
              : sp.error === "ForbiddenForRole"
              ? t("errorForbidden")
              : t("errorGeneric", { error: sp.error })}
          </div>
        )}

        <LoginForm next={sp.next} googleEnabled={isGoogleAuthEnabled()} />
        {/* Reset links travel by email, so the entry point only shows
            once email is configured (same gating as Google sign-in). */}
        {isEmailEnabled() && (
          <div style={{ marginTop: 14, fontSize: 12 }}>
            <Link
              href="/forgot-password"
              style={{
                color: "var(--wf-accent)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t("forgotPassword")}
            </Link>
          </div>
        )}
      </div>

      {/* Right: dev-only demo accounts panel — hidden entirely in production */}
      {!isDev || seededUsers.length === 0 ? (
        <div
          style={{
            background: "var(--wf-fillsoft)",
            padding: "48px 56px",
            borderLeft: "1px solid var(--wf-hairline)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <Eyebrow>{t("newEyebrow")}</Eyebrow>
          <h2 className="wf-h2" style={{ fontSize: 22, marginTop: -4 }}>
            {t("newHeading")}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--wf-body)",
              lineHeight: 1.55,
              marginBottom: 4,
            }}
          >
            {t("newBody")}
          </p>
        </div>
      ) : (
      <div
        style={{
          background: "var(--wf-fillsoft)",
          padding: "48px 56px",
          borderLeft: "1px solid var(--wf-hairline)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="sparkles" size={16} color="var(--wf-ai)" />
          <Eyebrow>Demo accounts</Eyebrow>
        </div>
        <h2
          className="wf-h2"
          style={{ fontSize: 18, marginTop: -8, marginBottom: 4 }}
        >
          One-click sign in
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--wf-mute)",
            marginTop: 0,
            marginBottom: 8,
          }}
        >
          Pick any seeded user to explore that role&apos;s view. Hidden in
          production — only available because <code className="wf-mono">NODE_ENV=development</code>.
        </p>

        {(["STUDENT", "TEACHER", "ADMIN"] as const).map((roleKey) => {
          const users = grouped[roleKey];
          if (users.length === 0) return null;
          return (
            <Card key={roleKey} p={14}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.08em",
                  marginBottom: 10,
                }}
              >
                {roleKey}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {users.map((u) => (
                  <QuickLoginButton
                    key={u.email}
                    email={u.email}
                    label={u.name ?? u.firstName ?? u.email}
                    next={homeForRole(roleKey)}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
