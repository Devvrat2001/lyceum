"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type CourseOption = { slug: string; title: string };
type ClassOption = { id: string; name: string };

/**
 * Header toolbar for /teacher/students. Replaces the previously
 * decorative `<span className="wf-chip">All courses ▾</span>` chips
 * with real `<select>`s that drive URL search params (`?courseSlug=…`
 * and `?classId=…`). The parent server component re-runs its DB query
 * against those params on navigation, so the filter feels natural —
 * no client-side data fetch, no flash of unfiltered content.
 *
 * Also owns the "Invite student" modal: a tiny controlled dialog that
 * calls `teacher.inviteStudent`. v1 has no email send (Resend
 * blocker), so for un-registered emails it returns a copyable
 * /signup link instead of mailing one.
 */
export function StudentsToolbar({
  courses,
  classes,
  initialCourseSlug,
  initialClassId,
}: {
  courses: CourseOption[];
  classes: ClassOption[];
  initialCourseSlug?: string;
  initialClassId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);

  /**
   * Push a single search-param change. Empty string clears the param.
   * Uses startTransition so the React tree paints the filter chips'
   * new value immediately while the server-component re-render is in
   * flight (avoids a "stuck on old value" feel).
   */
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/teacher/students?${qs}` : "/teacher/students");
    });
  }

  return (
    <>
      <FilterSelect
        label="All courses"
        value={initialCourseSlug ?? ""}
        onChange={(v) => setParam("courseSlug", v)}
        options={courses.map((c) => ({ value: c.slug, label: c.title }))}
        disabled={pending}
      />
      <FilterSelect
        label="All classes"
        value={initialClassId ?? ""}
        onChange={(v) => setParam("classId", v)}
        options={classes.map((c) => ({ value: c.id, label: c.name }))}
        disabled={pending}
      />
      <div style={{ flex: 1 }} />
      <Btn variant="ghost" sm icon={<Icon name="download" size={12} />}>
        Export
      </Btn>
      <Btn
        variant="primary"
        sm
        icon={<Icon name="plus" size={12} color="white" />}
        onClick={() => setInviteOpen(true)}
      >
        Invite student
      </Btn>

      {inviteOpen ? (
        <InviteStudentModal
          courses={courses}
          defaultCourseSlug={initialCourseSlug}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Native `<select>` styled to look like a `wf-chip`. Keeps a11y +
 * keyboard support for free; the custom appearance is just a chrome
 * tweak. The label baked into the option list (`All <thing>`) is what
 * shows when value is empty.
 */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="wf-chip"
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        background: "var(--wf-bg)",
        backgroundImage:
          "linear-gradient(45deg, transparent 50%, var(--wf-mute) 50%), " +
          "linear-gradient(135deg, var(--wf-mute) 50%, transparent 50%)",
        backgroundPosition:
          "calc(100% - 10px) calc(50% - 2px), calc(100% - 6px) calc(50% - 2px)",
        backgroundSize: "4px 4px, 4px 4px",
        backgroundRepeat: "no-repeat",
        paddingRight: 18,
        cursor: disabled ? "wait" : "pointer",
        color: value ? "var(--wf-ink)" : "var(--wf-body)",
        fontFamily: "inherit",
      }}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Modal dialog for inviting a student to a course.
 *
 * Submit calls `teacher.inviteStudent`. Two success outcomes:
 *   - `enrolled` / `already_enrolled` — show a "✓ {message}" line.
 *     router.refresh() bumps the parent server query so the new
 *     student appears in the table immediately (only relevant for
 *     the `enrolled` branch, but the refresh is cheap).
 *   - `signup_link` — the student doesn't have an account yet.
 *     Display the returned `/signup?email=…&next=…` URL with a
 *     "Copy link" button so the teacher can share it manually
 *     (Resend isn't wired yet — once it is, the server will mail
 *     this same link instead of returning it).
 */
function InviteStudentModal({
  courses,
  defaultCourseSlug,
  onClose,
}: {
  courses: CourseOption[];
  defaultCourseSlug?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const emailId = useId();
  const courseId = useId();
  const [email, setEmail] = useState("");
  // Map the slug-only filter context into the course-id picker — the
  // server lookup is by id so we resolve here.
  const initialCourseId =
    courses.find((c) => c.slug === defaultCourseSlug)?.slug ?? "";
  const [selectedSlug, setSelectedSlug] = useState(initialCourseId);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset the "Copied!" badge 2s after it flips on. useEffect (not
  // Date.now() in render) keeps the component pure — react-hooks/purity
  // flags any direct clock read at render time.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  // Looking up the course id from the slug. We avoid loading another
  // tRPC query just to translate; the parent already gave us the list.
  const trpcUtils = trpc.useUtils();
  const myCourses = trpc.teacher.myCourses.useQuery(undefined, {
    initialData: undefined,
    enabled: false,
  });

  const invite = trpc.teacher.inviteStudent.useMutation({
    onSuccess: (data) => {
      if (data.outcome === "signup_link") {
        // Convert the relative URL the server returned into an
        // absolute one so "copy link" yields something pasteable.
        const absolute =
          typeof window !== "undefined"
            ? new URL(data.inviteUrl, window.location.origin).toString()
            : data.inviteUrl;
        setInviteUrl(absolute);
      } else {
        setInviteUrl(null);
        // Refresh server data so the new student appears in the table.
        router.refresh();
        // Brief pause so the teacher reads the "✓ enrolled" message,
        // then auto-close.
        setTimeout(() => onClose(), 1200);
      }
    },
  });

  // Close on ESC. Backdrop click also closes (see backdrop onClick
  // below). Keep this scoped to the dialog mount lifecycle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Resolve the picked slug → courseId via a one-shot myCourses fetch
  // (cached after first call) so the parent doesn't have to plumb ids.
  async function submit() {
    if (!email.trim() || !selectedSlug) return;
    const list =
      myCourses.data ?? (await trpcUtils.teacher.myCourses.fetch());
    const found = list.find((c) => c.slug === selectedSlug);
    if (!found) return;
    invite.mutate({ email: email.trim(), courseId: found.id });
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 20, 20, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "white",
          border: "1px solid var(--wf-line)",
          borderRadius: 6,
          padding: 22,
          boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h2
            id="invite-title"
            className="wf-serif"
            style={{ fontSize: 18, fontWeight: 700, margin: 0 }}
          >
            Invite student
          </h2>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "var(--wf-mute)",
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <label htmlFor={emailId} style={{ display: "block", marginBottom: 14 }}>
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-mute)",
              letterSpacing: "0.06em",
            }}
          >
            STUDENT EMAIL
          </span>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@school.edu"
            autoFocus
            disabled={invite.isPending}
            style={{
              width: "100%",
              fontSize: 13,
              border: "1px solid var(--wf-line)",
              borderRadius: 4,
              padding: "8px 10px",
              marginTop: 4,
              outline: "none",
              color: "var(--wf-ink)",
            }}
          />
        </label>

        <label htmlFor={courseId} style={{ display: "block", marginBottom: 16 }}>
          <span
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-mute)",
              letterSpacing: "0.06em",
            }}
          >
            ENROLL IN
          </span>
          <select
            id={courseId}
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            disabled={invite.isPending || courses.length === 0}
            style={{
              width: "100%",
              fontSize: 13,
              border: "1px solid var(--wf-line)",
              borderRadius: 4,
              padding: "8px 10px",
              marginTop: 4,
              outline: "none",
              background: "white",
              color: "var(--wf-ink)",
              fontFamily: "inherit",
            }}
          >
            <option value="">Pick a course…</option>
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </label>

        {invite.isError ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--wf-accent)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            {invite.error?.message ?? "Couldn't send invite."}
          </div>
        ) : null}

        {invite.data && invite.data.outcome !== "signup_link" ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--wf-good)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            ✓ {invite.data.message}
          </div>
        ) : null}

        {inviteUrl ? (
          <div
            style={{
              padding: 12,
              background: "var(--wf-fillsoft)",
              border: "1px solid var(--wf-hairline)",
              borderRadius: 4,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--wf-body)",
                marginBottom: 6,
                lineHeight: 1.5,
              }}
            >
              {invite.data?.outcome === "signup_link" ? invite.data.message : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: "var(--font-mono-stack)",
                  border: "1px solid var(--wf-line)",
                  borderRadius: 3,
                  padding: "6px 8px",
                  background: "white",
                  color: "var(--wf-ink)",
                  minWidth: 0,
                }}
              />
              <Btn
                sm
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                  } catch {
                    // Clipboard API blocked (insecure context / perms);
                    // user can still copy by hand from the focused
                    // input. No-op rather than surfacing a scary error.
                  }
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </Btn>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" sm onClick={onClose}>
            Close
          </Btn>
          <Btn
            variant="primary"
            sm
            onClick={submit}
            disabled={!email.trim() || !selectedSlug || invite.isPending}
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
