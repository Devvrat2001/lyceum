"use client";

import { useState } from "react";
import { Avatar } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/**
 * Inline per-PARENT manager: lists the parent's linked students and
 * lets admins link/unlink by student email.
 *
 * Rendered once per PARENT row on the admin people page. Query
 * `admin.parentLinks` is lazy via tRPC `enabled: open` so we only
 * fetch when the admin opens the panel — avoids N+1 on page load
 * when an institution has many parents.
 */
export function ParentLinksManager({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const links = trpc.admin.parentLinks.useQuery(
    { parentId },
    { enabled: open }
  );

  const link = trpc.admin.linkParentToChild.useMutation({
    onSuccess: () => {
      setEmail("");
      setError(null);
      utils.admin.parentLinks.invalidate({ parentId });
    },
    onError: (e) => setError(e.message),
  });

  const unlink = trpc.admin.unlinkParentFromChild.useMutation({
    onSuccess: () => {
      utils.admin.parentLinks.invalidate({ parentId });
    },
    onError: (e) => setError(e.message),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "4px 10px",
          fontSize: 10,
          border: "1px solid var(--wf-hairline)",
          borderRadius: 3,
          background: "white",
          cursor: "pointer",
          color: "var(--wf-body)",
          fontWeight: 600,
          fontFamily: "inherit",
        }}
        title="Manage which students this parent can monitor"
      >
        Manage children
      </button>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    link.mutate({ parentId, childEmail: trimmed });
  };

  return (
    <div
      style={{
        flexBasis: "100%",
        marginTop: 10,
        padding: 12,
        border: "1px solid var(--wf-hairline)",
        borderRadius: 4,
        background: "var(--wf-fillsoft)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span
          className="wf-mono"
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            letterSpacing: "0.06em",
            fontWeight: 700,
          }}
        >
          LINKED CHILDREN
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close manager"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--wf-mute)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {links.isLoading ? (
        <div
          style={{ fontSize: 11, color: "var(--wf-mute)", marginBottom: 10 }}
        >
          Loading…
        </div>
      ) : links.data && links.data.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {links.data.map((c) => (
            <div
              key={c.childId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                background: "white",
                border: "1px solid var(--wf-hairline)",
                borderRadius: 3,
              }}
            >
              <Avatar initials={initialsOf(c.name)} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--wf-mute)",
                  }}
                >
                  {c.email}
                </div>
              </div>
              <span
                className="wf-mono"
                style={{ fontSize: 10, color: "var(--wf-mute)" }}
              >
                {c.enrollmentCount} course{c.enrollmentCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Unlink ${c.name} from this parent?`)) {
                    unlink.mutate({ parentId, childId: c.childId });
                  }
                }}
                disabled={
                  unlink.isPending && unlink.variables?.childId === c.childId
                }
                aria-label={`Unlink ${c.name}`}
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  border: "1px solid var(--wf-hairline)",
                  borderRadius: 3,
                  background: "white",
                  cursor: "pointer",
                  color: "var(--wf-accent)",
                  fontWeight: 600,
                  fontFamily: "inherit",
                }}
              >
                Unlink
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: "var(--wf-mute)",
            fontStyle: "italic",
            marginBottom: 10,
          }}
        >
          No children linked yet.
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", gap: 6, alignItems: "stretch" }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@school.edu"
          required
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 11,
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            background: "white",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={link.isPending || !email.trim()}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            border: "none",
            borderRadius: 3,
            background:
              link.isPending || !email.trim()
                ? "var(--wf-fill)"
                : "var(--wf-ink)",
            color:
              link.isPending || !email.trim() ? "var(--wf-mute)" : "white",
            cursor:
              link.isPending || !email.trim() ? "default" : "pointer",
            fontWeight: 600,
            fontFamily: "inherit",
          }}
        >
          {link.isPending ? "Linking…" : "+ Link student"}
        </button>
      </form>

      {error && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--wf-accent)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
