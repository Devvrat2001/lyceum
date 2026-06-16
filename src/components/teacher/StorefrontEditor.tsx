"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  border: "1px solid var(--wf-line)",
  borderRadius: 4,
  padding: "8px 10px",
  background: "white",
  outline: "none",
  marginTop: 4,
  color: "var(--wf-ink)",
};

/**
 * Teacher-facing storefront editor — edits the headline + bio shown on
 * the public /t/[teacherId] profile. Replaces the old ComingSoon
 * placeholder. Saves via teacher.updateProfile; router.refresh() re-seeds
 * the form props so the Save button settles back to disabled.
 */
export function StorefrontEditor({
  teacherId,
  name,
  headline: initialHeadline,
  bio: initialBio,
}: {
  teacherId: string;
  name: string;
  headline: string | null;
  bio: string | null;
}) {
  const t = useTranslations("TeacherStorefront");
  const router = useRouter();
  const [headline, setHeadline] = useState(initialHeadline ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const update = trpc.teacher.updateProfile.useMutation({
    onSuccess: () => {
      setSavedMsg(t("saved"));
      router.refresh();
      setTimeout(() => setSavedMsg(null), 3000);
    },
    onError: (e) => setSavedMsg(e.message),
  });

  const dirty =
    headline !== (initialHeadline ?? "") || bio !== (initialBio ?? "");

  return (
    <>
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>{t("title")}</span>
        <div style={{ flex: 1 }} />
        <Link
          href={`/t/${teacherId}`}
          target="_blank"
          style={{ textDecoration: "none" }}
        >
          <Btn variant="ghost" sm icon={<Icon name="arrow" size={12} />}>
            {t("viewPublic")}
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <Card p={20} style={{ marginBottom: 16 }}>
            <Eyebrow>{t("profileEyebrow")}</Eyebrow>
            <p
              style={{
                fontSize: 12,
                color: "var(--wf-mute)",
                margin: "6px 0 16px",
                lineHeight: 1.5,
              }}
            >
              {t("intro", { name })}
            </p>

            <label style={{ display: "block", marginBottom: 14 }}>
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                }}
              >
                {t("headlineLabel")}
              </span>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={t("headlinePlaceholder")}
                maxLength={120}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "block", marginBottom: 16 }}>
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                }}
              >
                {t("bioLabel")}
              </span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("bioPlaceholder")}
                rows={6}
                maxLength={2000}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  fontFamily: "var(--font-sans-stack)",
                  lineHeight: 1.5,
                }}
              />
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Btn
                variant="primary"
                sm
                disabled={!dirty || update.isPending}
                onClick={() => update.mutate({ headline, bio })}
              >
                {update.isPending ? t("saving") : t("saveProfile")}
              </Btn>
              {savedMsg && (
                <span
                  style={{
                    fontSize: 11,
                    color: update.isError
                      ? "var(--wf-accent)"
                      : "var(--wf-good)",
                  }}
                >
                  {update.isError ? savedMsg : `✓ ${savedMsg}`}
                </span>
              )}
            </div>
          </Card>

          <Card
            p={16}
            style={{
              background: "var(--wf-ai-soft)",
              borderColor: "var(--wf-ai)",
            }}
          >
            <div
              className="wf-mono"
              style={{
                fontSize: 10,
                color: "var(--wf-ai)",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              {t("roadmapEyebrow")}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--wf-body)",
                lineHeight: 1.5,
              }}
            >
              {t("roadmapBody")}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
