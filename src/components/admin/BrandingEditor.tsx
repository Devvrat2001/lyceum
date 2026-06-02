"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Eyebrow } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

const DEFAULT_ACCENT = "#ff5b1f"; // matches --wf-accent in globals.css

const PRESETS: { label: string; hex: string }[] = [
  { label: "Lyceum", hex: DEFAULT_ACCENT },
  { label: "Indigo", hex: "#4f46e5" },
  { label: "Blue", hex: "#2563eb" },
  { label: "Emerald", hex: "#059669" },
  { label: "Violet", hex: "#7c3aed" },
  { label: "Rose", hex: "#e11d48" },
  { label: "Slate", hex: "#475569" },
];

const inputStyle: CSSProperties = {
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

export function BrandingEditor() {
  const branding = trpc.admin.branding.useQuery();

  if (branding.isLoading) {
    return (
      <div style={{ padding: "24px 28px", color: "var(--wf-mute)", fontSize: 13 }}>
        Loading branding…
      </div>
    );
  }
  if (branding.isError || !branding.data) {
    return (
      <div style={{ padding: "24px 28px", color: "var(--wf-accent)", fontSize: 13 }}>
        {branding.error?.message ?? "Couldn't load branding."}
      </div>
    );
  }

  // Re-mount the form (seeding its local state from props) whenever the
  // institution or its saved values change — no sync effect needed.
  const d = branding.data;
  return (
    <BrandingForm
      key={`${d.institutionId ?? "none"}:${d.name}:${d.brandColor ?? ""}`}
      initialName={d.name}
      initialColor={d.brandColor}
    />
  );
}

function BrandingForm({
  initialName,
  initialColor,
}: {
  initialName: string;
  initialColor: string | null;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor);
  const [flag, setFlag] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );

  const update = trpc.admin.updateBranding.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: "Saved" });
      // Refresh so the admin layout re-reads brandColor and the accent
      // updates across every /admin page; re-fetch the query too.
      utils.admin.branding.invalidate();
      router.refresh();
      setTimeout(() => setFlag(null), 3000);
    },
    onError: (e) => setFlag({ kind: "err", msg: e.message }),
  });

  const dirty = name !== initialName || color !== initialColor;
  const previewAccent = color ?? DEFAULT_ACCENT;
  const hexValid = color === null || /^#[0-9a-fA-F]{6}$/.test(color);

  return (
    <>
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>Branding</span>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <Card p={20} style={{ marginBottom: 16 }}>
            <Eyebrow>Institution</Eyebrow>
            <p style={help}>
              Your institution name shows in the admin chrome and on reports.
            </p>
            <label style={{ display: "block", marginBottom: 4 }}>
              <FieldLabel>NAME</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Cedar Middle School"
                style={inputStyle}
              />
            </label>
          </Card>

          <Card p={20} style={{ marginBottom: 16 }}>
            <Eyebrow>Accent colour</Eyebrow>
            <p style={help}>
              Replaces the default Lyceum orange across your admin pages.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {PRESETS.map((p) => {
                const active =
                  (color ?? DEFAULT_ACCENT).toLowerCase() === p.hex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setColor(p.hex)}
                    title={p.label}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: p.hex,
                      border: active
                        ? "2px solid var(--wf-ink)"
                        : "2px solid transparent",
                      boxShadow: "0 0 0 1px var(--wf-hairline)",
                      cursor: "pointer",
                    }}
                    aria-label={`Use ${p.label} accent`}
                    aria-pressed={active}
                  />
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                value={previewAccent}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Pick a custom accent colour"
                style={{
                  width: 40,
                  height: 32,
                  padding: 0,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 4,
                  background: "white",
                  cursor: "pointer",
                }}
              />
              <input
                value={color ?? ""}
                onChange={(e) =>
                  setColor(e.target.value === "" ? null : e.target.value)
                }
                placeholder={DEFAULT_ACCENT}
                maxLength={7}
                style={{ ...inputStyle, marginTop: 0, width: 120, fontFamily: "var(--font-mono)" }}
              />
              <button
                type="button"
                onClick={() => setColor(null)}
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Reset to default
              </button>
            </div>
            {!hexValid && (
              <div style={{ fontSize: 11, color: "var(--wf-accent)", marginTop: 8 }}>
                Use a 6-digit hex colour like {DEFAULT_ACCENT}.
              </div>
            )}
          </Card>

          {/* Live preview — scopes --wf-accent to the chosen colour so the
              sample chrome reflects it before you save. */}
          <Card p={20} style={{ marginBottom: 16 }}>
            <Eyebrow>Preview</Eyebrow>
            <div
              style={
                {
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                  "--wf-accent": previewAccent,
                } as CSSProperties
              }
            >
              <span
                style={{
                  background: "var(--wf-accent)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 6,
                }}
              >
                Primary action
              </span>
              <span
                style={{
                  border: "1px solid var(--wf-accent)",
                  color: "var(--wf-accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 999,
                }}
              >
                Accent chip
              </span>
              <span style={{ color: "var(--wf-accent)", fontSize: 13, fontWeight: 600 }}>
                A highlighted link
              </span>
            </div>
          </Card>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Btn
              variant="primary"
              sm
              disabled={!dirty || !hexValid || update.isPending}
              onClick={() =>
                update.mutate({ name: name.trim() || undefined, brandColor: color })
              }
            >
              {update.isPending ? "Saving…" : "Save branding"}
            </Btn>
            {flag && (
              <span
                style={{
                  fontSize: 11,
                  color: flag.kind === "err" ? "var(--wf-accent)" : "var(--wf-good)",
                }}
              >
                {flag.kind === "err" ? flag.msg : `✓ ${flag.msg}`}
              </span>
            )}
          </div>

          <Card
            p={16}
            style={{
              marginTop: 16,
              background: "var(--wf-ai-soft)",
              borderColor: "var(--wf-ai)",
            }}
          >
            <div
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-ai)", letterSpacing: "0.06em", marginBottom: 4 }}
            >
              STILL ON THE ROADMAP
            </div>
            <div style={{ fontSize: 12, color: "var(--wf-body)", lineHeight: 1.5 }}>
              Logo upload, a custom sign-in background, and a vanity domain need
              asset storage + DNS — those land later. Name and accent colour are
              live now. The accent currently themes your admin pages; rolling it
              across student-facing screens is the next step.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="wf-mono"
      style={{ fontSize: 10, color: "var(--wf-mute)", letterSpacing: "0.06em" }}
    >
      {children}
    </span>
  );
}

const help: CSSProperties = {
  fontSize: 12,
  color: "var(--wf-mute)",
  margin: "6px 0 16px",
  lineHeight: 1.5,
};
