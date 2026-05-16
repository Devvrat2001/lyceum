import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Eyebrow, Icon } from "@/components/wf/primitives";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Create account · Lyceum" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  if (session?.user) redirect(sp.next ?? "/student");

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

        <Eyebrow>Create account</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 32, margin: "8px 0 12px" }}>
          Start learning.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--wf-body)",
            marginBottom: 28,
            lineHeight: 1.5,
          }}
        >
          Free to sign up — no credit card. Pick Student to learn or Teacher
          to publish courses.
        </p>

        <SignupForm next={sp.next} />

        <div
          style={{
            marginTop: 28,
            fontSize: 12,
            color: "var(--wf-mute)",
          }}
        >
          Already have an account?{" "}
          <Link
            href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}
            style={{ color: "var(--wf-ink)", fontWeight: 600 }}
          >
            Sign in
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
          <Eyebrow>What you get</Eyebrow>
        </div>
        <h2 className="wf-h2" style={{ fontSize: 22, marginTop: -4 }}>
          Personal AI tutor, gamified progress.
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
            ["sparkles", "Always-available AI tutor that cites the textbook"],
            ["star", "Adaptive practice that adjusts to your level"],
            ["flame", "Daily streak + XP that unlocks new content"],
            ["branch", "A skill tree that AI re-routes nightly"],
            ["book", "1,200+ free lessons across math, ELA, science"],
          ].map(([ic, t]) => (
            <li
              key={t}
              style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
            >
              <Icon
                name={ic as "sparkles"}
                size={14}
                color={ic === "sparkles" ? "var(--wf-ai)" : "var(--wf-accent)"}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
