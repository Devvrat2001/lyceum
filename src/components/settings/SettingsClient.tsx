"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Btn, Card, Eyebrow, Icon, Toggle } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type Role = "STUDENT" | "TEACHER" | "ADMIN" | "PARENT";

export type SettingsUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  role: Role;
  headline: string | null;
  bio: string | null;
  hasPassword: boolean;
  emailOptOut: boolean;
  tutorLogOptOut: boolean;
  /** ISO string or null. */
  coppaConsentAt: string | null;
};

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

/** Small transient status word rendered next to a save control. */
function SavedFlag({
  state,
}: {
  state: { kind: "idle" | "ok" | "err"; msg?: string };
}) {
  if (state.kind === "idle") return null;
  return (
    <span
      style={{
        fontSize: 11,
        color: state.kind === "err" ? "var(--wf-accent)" : "var(--wf-good)",
      }}
    >
      {state.kind === "err" ? state.msg : `✓ ${state.msg ?? ""}`}
    </span>
  );
}

export function SettingsClient({
  user,
  homeHref,
}: {
  user: SettingsUser;
  homeHref: string;
}) {
  const t = useTranslations("Settings");
  const isTeacher = user.role === "TEACHER" || user.role === "ADMIN";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--wf-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
          background: "white",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>{t("title")}</span>
        <div style={{ flex: 1 }} />
        <Link href={homeHref} style={{ textDecoration: "none" }}>
          <Btn variant="ghost" sm icon={<Icon name="arrow" size={12} />}>
            {t("backToApp")}
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Identity strip — read-only. Email is the login key; changing it
              touches auth + Stripe and is deferred. */}
          <Card p={16} style={{ marginBottom: 16 }}>
            <Eyebrow>{t("account")}</Eyebrow>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 13, color: "var(--wf-ink)" }}>
                {user.email}
              </div>
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                }}
              >
                {user.role}
              </span>
            </div>
          </Card>

          <ProfileSection user={user} isTeacher={isTeacher} />
          {user.role === "STUDENT" && <FamilySection />}
          <PasswordSection hasPassword={user.hasPassword} />
          <EmailSection initial={user.emailOptOut} />
          <PrivacySection
            initialTutorOptOut={user.tutorLogOptOut}
            initialConsentAt={user.coppaConsentAt}
          />
          <DangerZone userId={user.id} />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Family */

/**
 * Parent self-service linking (REQUIREMENTS R26): the student
 * generates a short family code here and shares it out-of-band; the
 * parent redeems it on /parent. Single-use, 7-day expiry, regenerating
 * replaces the previous code.
 */
function FamilySection() {
  const t = useTranslations("Settings");
  const gen = trpc.student.generateParentCode.useMutation();
  const [copied, setCopied] = useState(false);

  return (
    <Card p={16} style={{ marginBottom: 16 }}>
      <Eyebrow>{t("family")}</Eyebrow>
      <div
        style={{
          fontSize: 12,
          color: "var(--wf-body)",
          margin: "8px 0 12px",
          lineHeight: 1.5,
        }}
      >
        {t("familyIntro")}
      </div>
      {gen.data ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            className="wf-mono"
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.2em",
              padding: "6px 14px",
              border: "1px dashed var(--wf-line)",
              borderRadius: 4,
              background: "var(--wf-fillsoft)",
            }}
          >
            {gen.data.code}
          </span>
          <Btn
            sm
            variant="ghost"
            onClick={() => {
              navigator.clipboard
                ?.writeText(gen.data!.code)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? t("copied") : t("copy")}
          </Btn>
          <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
            {t("expires", {
              date: new Date(gen.data.expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              }),
            })}
          </span>
          <Btn
            sm
            variant="ghost"
            disabled={gen.isPending}
            onClick={() => {
              setCopied(false);
              gen.mutate();
            }}
          >
            {t("newCode")}
          </Btn>
        </div>
      ) : (
        <Btn
          sm
          variant="primary"
          disabled={gen.isPending}
          onClick={() => gen.mutate()}
        >
          {gen.isPending ? t("generating") : t("generateCode")}
        </Btn>
      )}
      {gen.error && (
        <div
          style={{ marginTop: 8, fontSize: 11, color: "var(--wf-accent)" }}
        >
          {gen.error.message}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- Profile */

function ProfileSection({
  user,
  isTeacher,
}: {
  user: SettingsUser;
  isTeacher: boolean;
}) {
  const t = useTranslations("Settings");
  const router = useRouter();
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [name, setName] = useState(user.name ?? "");
  const [headline, setHeadline] = useState(user.headline ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const update = trpc.account.updateProfile.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: t("saved") });
      router.refresh();
      setTimeout(() => setFlag({ kind: "idle" }), 3000);
    },
    onError: (e) => setFlag({ kind: "err", msg: e.message }),
  });

  const dirty =
    firstName !== (user.firstName ?? "") ||
    name !== (user.name ?? "") ||
    (isTeacher &&
      (headline !== (user.headline ?? "") || bio !== (user.bio ?? "")));

  return (
    <Card p={20} style={{ marginBottom: 16 }}>
      <Eyebrow>{t("profile")}</Eyebrow>
      <p style={helpText}>{t("profileHelp")}</p>

      <label style={{ display: "block", marginBottom: 14 }}>
        <FieldLabel>{t("firstName")}</FieldLabel>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder={t("firstNamePlaceholder")}
          maxLength={80}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block", marginBottom: isTeacher ? 14 : 16 }}>
        <FieldLabel>{t("displayName")}</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("displayNamePlaceholder")}
          maxLength={120}
          style={inputStyle}
        />
      </label>

      {isTeacher && (
        <>
          <label style={{ display: "block", marginBottom: 14 }}>
            <FieldLabel>{t("headline")}</FieldLabel>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={t("headlinePlaceholder")}
              maxLength={120}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block", marginBottom: 16 }}>
            <FieldLabel>{t("bio")}</FieldLabel>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t("bioPlaceholder")}
              rows={5}
              maxLength={2000}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>
          <p style={{ ...helpText, marginTop: -6 }}>
            {t("profileStorefrontNote")}
          </p>
        </>
      )}

      <div style={saveRow}>
        <Btn
          variant="primary"
          sm
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate(
              isTeacher
                ? { firstName, name, headline, bio }
                : { firstName, name }
            )
          }
        >
          {update.isPending ? t("saving") : t("saveProfile")}
        </Btn>
        <SavedFlag state={flag} />
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- Password */

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("Settings");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const change = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: t("pwUpdated") });
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => setFlag({ kind: "idle" }), 3000);
    },
    onError: (e) => setFlag({ kind: "err", msg: e.message }),
  });

  if (!hasPassword) {
    return (
      <Card p={20} style={{ marginBottom: 16 }}>
        <Eyebrow>{t("password")}</Eyebrow>
        <p style={{ ...helpText, marginBottom: 0 }}>{t("noPassword")}</p>
      </Card>
    );
  }

  const localError =
    next.length > 0 && next.length < 8
      ? t("pwTooShort")
      : confirm.length > 0 && next !== confirm
        ? t("pwMismatch")
        : null;

  const canSubmit =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    !change.isPending;

  return (
    <Card p={20} style={{ marginBottom: 16 }}>
      <Eyebrow>{t("password")}</Eyebrow>
      <p style={helpText}>{t("passwordHelp")}</p>

      <label style={{ display: "block", marginBottom: 14 }}>
        <FieldLabel>{t("currentPassword")}</FieldLabel>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "block", marginBottom: 14 }}>
        <FieldLabel>{t("newPassword")}</FieldLabel>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "block", marginBottom: 16 }}>
        <FieldLabel>{t("confirmNewPassword")}</FieldLabel>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
        />
      </label>

      <div style={saveRow}>
        <Btn
          variant="primary"
          sm
          disabled={!canSubmit}
          onClick={() =>
            change.mutate({ currentPassword: current, newPassword: next })
          }
        >
          {change.isPending ? t("updating") : t("updatePassword")}
        </Btn>
        {localError ? (
          <span style={{ fontSize: 11, color: "var(--wf-accent)" }}>
            {localError}
          </span>
        ) : (
          <SavedFlag state={flag} />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Email */

function EmailSection({ initial }: { initial: boolean }) {
  const t = useTranslations("Settings");
  // Store the *opt-out* but render the friendlier *opt-in* ("emails on").
  const [optOut, setOptOut] = useState(initial);
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const update = trpc.account.updatePreferences.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: t("saved") });
      setTimeout(() => setFlag({ kind: "idle" }), 2500);
    },
    onError: (e) => {
      setOptOut((v) => !v); // revert optimistic flip
      setFlag({ kind: "err", msg: e.message });
    },
  });

  const toggle = (emailsOn: boolean) => {
    const nextOptOut = !emailsOn;
    setOptOut(nextOptOut);
    update.mutate({ emailOptOut: nextOptOut });
  };

  return (
    <Card p={20} style={{ marginBottom: 16 }}>
      <Eyebrow>{t("email")}</Eyebrow>
      <ToggleRow
        label={t("emailToggle")}
        hint={t("emailHint")}
        on={!optOut}
        disabled={update.isPending}
        onChange={toggle}
      />
      <div style={{ ...saveRow, marginTop: 4 }}>
        <SavedFlag state={flag} />
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Privacy */

function PrivacySection({
  initialTutorOptOut,
  initialConsentAt,
}: {
  initialTutorOptOut: boolean;
  initialConsentAt: string | null;
}) {
  const t = useTranslations("Settings");
  const [tutorOptOut, setTutorOptOut] = useState(initialTutorOptOut);
  const [consentAt, setConsentAt] = useState<string | null>(initialConsentAt);
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const update = trpc.account.updatePreferences.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: t("saved") });
      setTimeout(() => setFlag({ kind: "idle" }), 2500);
    },
    onError: (e) => setFlag({ kind: "err", msg: e.message }),
  });

  const toggleTutor = (storeOn: boolean) => {
    const nextOptOut = !storeOn;
    setTutorOptOut(nextOptOut);
    update.mutate(
      { tutorLogOptOut: nextOptOut },
      { onError: () => setTutorOptOut((v) => !v) }
    );
  };

  const toggleConsent = (on: boolean) => {
    const prev = consentAt;
    const nextAt = on ? new Date().toISOString() : null;
    setConsentAt(nextAt);
    update.mutate(
      { coppaConsent: on },
      { onError: () => setConsentAt(prev) }
    );
  };

  return (
    <Card p={20} style={{ marginBottom: 16 }}>
      <Eyebrow>{t("privacy")}</Eyebrow>

      <ToggleRow
        label={t("tutorToggle")}
        hint={t("tutorHint")}
        on={!tutorOptOut}
        disabled={update.isPending}
        onChange={toggleTutor}
      />

      <div style={{ height: 1, background: "var(--wf-hairline)", margin: "14px 0" }} />

      <ToggleRow
        label={t("consentToggle")}
        hint={
          consentAt
            ? t("consentRecorded", {
                date: new Date(consentAt).toLocaleDateString(),
              })
            : t("consentHint")
        }
        on={!!consentAt}
        disabled={update.isPending}
        onChange={toggleConsent}
      />

      <div style={{ ...saveRow, marginTop: 8 }}>
        <SavedFlag state={flag} />
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- Danger */

/**
 * Data portability + account erasure (R43, DPDP/COPPA). "Download my
 * data" fetches the export bundle on demand and saves it as JSON;
 * "Delete account" requires typing DELETE, anonymises the account
 * server-side, then signs out. Teachers with content/sales are refused
 * server-side — the error surfaces inline.
 */
function DangerZone({ userId }: { userId: string }) {
  const t = useTranslations("Settings");
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);

  const del = trpc.account.deleteAccount.useMutation({
    onSuccess: () => signOut({ callbackUrl: "/" }),
    onError: (e) => setDelErr(e.message),
  });

  async function download() {
    setExporting(true);
    setExportErr(null);
    try {
      const data = await utils.account.exportData.fetch();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lyceum-data-${userId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card
      p={20}
      style={{ marginBottom: 16, borderColor: "var(--wf-accent)" }}
    >
      <Eyebrow>{t("yourData")}</Eyebrow>
      <p style={helpText}>{t("dataHelp")}</p>

      <div style={{ ...saveRow, marginBottom: 16 }}>
        <Btn sm variant="ghost" disabled={exporting} onClick={download}>
          {exporting ? t("preparing") : t("downloadData")}
        </Btn>
        {exportErr && (
          <span style={{ fontSize: 11, color: "var(--wf-accent)" }}>
            {exportErr}
          </span>
        )}
      </div>

      <div
        style={{ height: 1, background: "var(--wf-hairline)", margin: "4px 0 16px" }}
      />

      <FieldLabel>{t("deleteAccount")}</FieldLabel>
      <p style={{ ...helpText, marginTop: 6 }}>
        {t.rich("typeDelete", { strong: (c) => <strong>{c}</strong> })}
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("deletePlaceholder")}
          aria-label={t("deleteAria")}
          style={{ ...inputStyle, marginTop: 0, maxWidth: 160 }}
        />
        <Btn
          sm
          variant="accent"
          disabled={confirm !== "DELETE" || del.isPending}
          onClick={() => {
            setDelErr(null);
            del.mutate({ confirm: "DELETE" });
          }}
        >
          {del.isPending ? t("deleting") : t("deleteMyAccount")}
        </Btn>
      </div>
      {delErr && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--wf-accent)", lineHeight: 1.5 }}>
          {delErr}
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------- shared bits */

function ToggleRow({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "var(--wf-ink)", fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--wf-mute)", lineHeight: 1.5, marginTop: 3 }}>
          {hint}
        </div>
      </div>
      <div
        style={{
          opacity: disabled ? 0.6 : 1,
          pointerEvents: disabled ? "none" : "auto",
          paddingTop: 2,
        }}
      >
        <Toggle on={on} onChange={onChange} label={label} />
      </div>
    </div>
  );
}

const helpText: React.CSSProperties = {
  fontSize: 12,
  color: "var(--wf-mute)",
  margin: "6px 0 16px",
  lineHeight: 1.5,
};

const saveRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};
