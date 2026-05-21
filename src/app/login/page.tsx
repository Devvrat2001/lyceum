import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { LoginForm } from "@/components/auth/LoginForm";
import { QuickLoginButton } from "@/components/auth/QuickLoginButton";
import { homeForRole } from "@/lib/roles";

export const metadata = { title: "Sign in · Lyceum" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  // Role-aware default: a teacher/admin/parent sent to /student would be
  // bounced straight back here by proxy.ts, looping forever.
  if (session?.user)
    redirect(sp.next ?? homeForRole(session.user.role));

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

        <Eyebrow>Sign in</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 32, margin: "8px 0 12px" }}>
          Welcome back.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--wf-body)",
            marginBottom: 28,
            lineHeight: 1.5,
          }}
        >
          Sign in with your email and password.
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
              ? "Couldn't sign you in. Check your email and password, or create an account below."
              : sp.error === "ForbiddenForRole"
              ? "Your role doesn't have access to that page."
              : `Sign-in failed: ${sp.error}`}
          </div>
        )}

        <LoginForm next={sp.next} />
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
          <Eyebrow>New to Lyceum?</Eyebrow>
          <h2 className="wf-h2" style={{ fontSize: 22, marginTop: -4 }}>
            Browse without an account.
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--wf-body)",
              lineHeight: 1.55,
              marginBottom: 4,
            }}
          >
            Explore the course marketplace, see what students learn, and check
            out our teacher tools. Create a free account to track progress and
            earn XP.
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
