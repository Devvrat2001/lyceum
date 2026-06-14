"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Icon } from "@/components/wf/primitives";
import { NotificationBell } from "@/components/layouts/NotificationBell";

/**
 * Bottom-of-sidebar identity strip:
 *  - Avatar + email
 *  - Sign out link
 *
 * Replaces the "Switch role ↗" demo links from Phase-0.
 */
export function SidebarUserMenu({ dark = false }: { dark?: boolean }) {
  const { data: session, status } = useSession();
  if (status !== "authenticated") return null;

  const u = session.user;
  const initials =
    (u.name?.split(" ").map((s) => s[0]).join("").slice(0, 2) ||
      u.email?.[0] ||
      "U").toUpperCase();

  const subtle = dark ? "rgba(255,255,255,0.55)" : "var(--wf-mute)";
  const strong = dark ? "white" : "var(--wf-ink)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingTop: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 6px",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: dark ? "rgba(255,255,255,0.12)" : "var(--wf-fill)",
            border: `1px solid ${dark ? "rgba(255,255,255,0.16)" : "var(--wf-hairline)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
            color: strong,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: strong,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {u.name ?? u.email}
          </div>
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: subtle,
              letterSpacing: "0.06em",
            }}
          >
            {u.role}
          </div>
        </div>
        {/* Notifications bell (R36) — lives in the shared sidebar identity
            strip so it's on EVERY page of the Student/Teacher/Admin
            chromes, not just the dashboard. Opens upward (sidebar bottom). */}
        <NotificationBell dropUp dark={dark} />
      </div>
      <Link
        href="/settings"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 6px",
          fontSize: 11,
          color: subtle,
          textDecoration: "none",
        }}
      >
        <Icon name="cog" size={12} color="currentColor" />
        Settings
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 6px",
          fontSize: 11,
          color: subtle,
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <Icon name="arrow" size={12} color="currentColor" />
        Sign out
      </button>
    </div>
  );
}
