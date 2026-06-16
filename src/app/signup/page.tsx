import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Eyebrow, Icon } from "@/components/wf/primitives";
import { SignupForm } from "@/components/auth/SignupForm";
import { safeRedirect } from "@/lib/roles";

export const metadata = { title: "Create account · Lyceum" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  // Already signed in — send them somewhere their role can reach. A
  // hardcoded /student looped non-students (teacher → /student → proxy
  // rejects → /login?next=/student → … ).
  if (session?.user) redirect(safeRedirect(session.user.role, sp.next));

  const t = await getTranslations("SignupPage");

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
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 32,
            textDecoration: "none",
            color: "inherit",
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
        </Link>

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

        <SignupForm next={sp.next} />

        <div
          style={{
            marginTop: 28,
            fontSize: 12,
            color: "var(--wf-mute)",
          }}
        >
          {t("alreadyHave")}{" "}
          <Link
            href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}
            style={{ color: "var(--wf-ink)", fontWeight: 600 }}
          >
            {t("signIn")}
          </Link>
        </div>
      </div>

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="sparkles" size={16} color="var(--wf-ai)" />
          <Eyebrow>{t("getEyebrow")}</Eyebrow>
        </div>
        <h2 className="wf-h2" style={{ fontSize: 22, marginTop: -4 }}>
          {t("getHeading")}
        </h2>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.5,
          }}
        >
          {[
            ["sparkles", "feat1"],
            ["star", "feat2"],
            ["flame", "feat3"],
            ["branch", "feat4"],
            ["book", "feat5"],
          ].map(([ic, featKey]) => (
            <li
              key={featKey}
              style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
            >
              <Icon
                name={ic as "sparkles"}
                size={14}
                color={ic === "sparkles" ? "var(--wf-ai)" : "var(--wf-accent)"}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <span>{t(featKey)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
