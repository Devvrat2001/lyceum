"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
      {state.kind === "err" ? state.msg : `✓ ${state.msg ?? "Saved"}`}
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
        <span style={{ fontSize: 16, fontWeight: 600 }}>Settings</span>
        <div style={{ flex: 1 }} />
        <Link href={homeHref} style={{ textDecoration: "none" }}>
          <Btn variant="ghost" sm icon={<Icon name="arrow" size={12} />}>
            Back to app
          </Btn>
        </Link>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Identity strip — read-only. Email is the login key; changing it
              touches auth + Stripe and is deferred. */}
          <Card p={16} style={{ marginBottom: 16 }}>
            <Eyebrow>Account</Eyebrow>
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
  const gen = trpc.student.generateParentCode.useMutation();
  const [copied, setCopied] = useState(false);

  return (
    <Card p={16} style={{ marginBottom: 16 }}>
      <Eyebrow>Family</Eyebrow>
      <div
        style={{
          fontSize: 12,
          color: "var(--wf-body)",
          margin: "8px 0 12px",
          lineHeight: 1.5,
        }}
      >
        Link a parent or guardian: generate a code, share it with them
        (WhatsApp works fine), and they enter it on their Lyceum parent
        dashboard. Each code works once and expires in 7 days —
        generating a new one replaces the old.
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
            {copied ? "✓ Copied" : "Copy"}
          </Btn>
          <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
            expires{" "}
            {new Date(gen.data.expiresAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
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
            New code
          </Btn>
        </div>
      ) : (
        <Btn
          sm
          variant="primary"
          disabled={gen.isPending}
          onClick={() => gen.mutate()}
        >
          {gen.isPending ? "Generating…" : "Generate family code"}
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
      setFlag({ kind: "ok", msg: "Saved" });
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
      <Eyebrow>Profile</Eyebrow>
      <p style={helpText}>
        Your first name is used in greetings across the app. Display name shows
        in menus and on your activity.
      </p>

      <label style={{ display: "block", marginBottom: 14 }}>
        <FieldLabel>FIRST NAME</FieldLabel>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="e.g. Jordan"
          maxLength={80}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block", marginBottom: isTeacher ? 14 : 16 }}>
        <FieldLabel>DISPLAY NAME</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jordan Riley"
          maxLength={120}
          style={inputStyle}
        />
      </label>

      {isTeacher && (
        <>
          <label style={{ display: "block", marginBottom: 14 }}>
            <FieldLabel>HEADLINE</FieldLabel>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Middle-school math, made visual"
              maxLength={120}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block", marginBottom: 16 }}>
            <FieldLabel>BIO</FieldLabel>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell learners about your teaching background and approach."
              rows={5}
              maxLength={2000}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>
          <p style={{ ...helpText, marginTop: -6 }}>
            Headline and bio appear on your public storefront.
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
          {update.isPending ? "Saving…" : "Save profile"}
        </Btn>
        <SavedFlag state={flag} />
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- Password */

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const change = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: "Password updated" });
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
        <Eyebrow>Password</Eyebrow>
        <p style={{ ...helpText, marginBottom: 0 }}>
          Your account signs in without a password (single sign-on / demo
          login), so there&apos;s no password to change here.
        </p>
      </Card>
    );
  }

  const localError =
    next.length > 0 && next.length < 8
      ? "New password must be at least 8 characters."
      : confirm.length > 0 && next !== confirm
        ? "New password and confirmation don't match."
        : null;

  const canSubmit =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    !change.isPending;

  return (
    <Card p={20} style={{ marginBottom: 16 }}>
      <Eyebrow>Password</Eyebrow>
      <p style={helpText}>Use at least 8 characters.</p>

      <label style={{ display: "block", marginBottom: 14 }}>
        <FieldLabel>CURRENT PASSWORD</FieldLabel>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "block", marginBottom: 14 }}>
        <FieldLabel>NEW PASSWORD</FieldLabel>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "block", marginBottom: 16 }}>
        <FieldLabel>CONFIRM NEW PASSWORD</FieldLabel>
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
          {change.isPending ? "Updating…" : "Update password"}
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
  // Store the *opt-out* but render the friendlier *opt-in* ("emails on").
  const [optOut, setOptOut] = useState(initial);
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const update = trpc.account.updatePreferences.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: "Saved" });
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
      <Eyebrow>Email</Eyebrow>
      <ToggleRow
        label="Product & progress emails"
        hint="Weekly progress digest and re-engagement nudges. Purchase receipts and other transactional email always send."
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
  const [tutorOptOut, setTutorOptOut] = useState(initialTutorOptOut);
  const [consentAt, setConsentAt] = useState<string | null>(initialConsentAt);
  const [flag, setFlag] = useState<{
    kind: "idle" | "ok" | "err";
    msg?: string;
  }>({ kind: "idle" });

  const update = trpc.account.updatePreferences.useMutation({
    onSuccess: () => {
      setFlag({ kind: "ok", msg: "Saved" });
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
      <Eyebrow>Privacy &amp; data</Eyebrow>

      <ToggleRow
        label="Store my AI tutor conversations"
        hint="When off, your tutor chats aren't saved — the tutor still works live, but nothing is kept after the session. (COPPA/FERPA.)"
        on={!tutorOptOut}
        disabled={update.isPending}
        onChange={toggleTutor}
      />

      <div style={{ height: 1, background: "var(--wf-hairline)", margin: "14px 0" }} />

      <ToggleRow
        label="I consent to data & AI processing"
        hint={
          consentAt
            ? `Consent recorded ${new Date(consentAt).toLocaleDateString()}.`
            : "Acknowledge that lesson activity and AI tutor usage are processed to personalize learning."
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
        <Toggle on={on} onChange={onChange} />
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
