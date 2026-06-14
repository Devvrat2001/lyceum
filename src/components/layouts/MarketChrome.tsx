"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Btn } from "@/components/wf/primitives";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";
import { NotificationBell } from "@/components/layouts/NotificationBell";
import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { useIsMobile } from "@/lib/useMediaQuery";

/**
 * Marketplace top-bar nav, scoped per viewer role.
 *
 * `/` and `/course/*` are public — every role (and anonymous
 * visitors) lands here — so the bar must only offer links the viewer
 * can actually open. Otherwise clicking e.g. "My Library" as a
 * TEACHER bounces through proxy.ts to /login?error=ForbiddenForRole,
 * which reads as a broken app.
 *
 * Route → role gating (mirrors src/proxy.ts):
 *   /            → public          ("Browse" — shown to everyone)
 *   /student/*   → STUDENT | ADMIN
 *   /teacher/*   → TEACHER | ADMIN
 *   /admin/*     → ADMIN
 *   /parent/*    → PARENT  | ADMIN
 *
 * ADMIN is allowed on every tree, but its bar links to the admin
 * console only — keeping the menu role-coherent beats dumping all
 * four areas onto it.
 *
 * Responsive: desktop is the single sticky bar (below); on phones the
 * nav links + search + auth collapse behind a ☰ toggle into a drawer,
 * matching the role chromes (this app has no CSS breakpoint layer —
 * responsiveness is JS-driven via `useIsMobile`).
 */
type NavLink = { label: string; href: string };

type NavKey = "ANON" | "STUDENT" | "TEACHER" | "ADMIN" | "PARENT";

/** The one link every viewer shares — the public course catalog. */
const BROWSE: NavLink = { label: "Browse", href: "/" };

const ROLE_NAV: Record<NavKey, NavLink[]> = {
  ANON: [BROWSE],
  STUDENT: [
    BROWSE,
    { label: "My Library", href: "/student" },
    { label: "Paths", href: "/student/skill-tree" },
  ],
  TEACHER: [BROWSE, { label: "Teach", href: "/teacher" }],
  ADMIN: [BROWSE, { label: "Admin", href: "/admin" }],
  PARENT: [BROWSE, { label: "Parent", href: "/parent" }],
};

/** Primary-CTA destination ("Go to dashboard") for a signed-in role. */
const ROLE_HOME: Record<Exclude<NavKey, "ANON">, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  ADMIN: "/admin",
  PARENT: "/parent",
};

/** Narrow the loosely-typed session role down to a known nav bucket. */
function navKeyFor(role: string | null | undefined): NavKey {
  return role === "STUDENT" ||
    role === "TEACHER" ||
    role === "ADMIN" ||
    role === "PARENT"
    ? role
    : "ANON";
}

function LyceumMark() {
  return (
    <Link
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          background: "var(--wf-ink)",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--wf-bg)",
          fontFamily: "var(--font-serif-stack)",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        L
      </div>
      <span
        style={{
          fontFamily: "var(--font-serif-stack)",
          fontSize: 17,
          fontWeight: 600,
        }}
      >
        Lyceum
      </span>
    </Link>
  );
}

/** Auth CTA(s) for the bar (desktop) or drawer (`full` → stacked, full-width). */
function AuthArea({
  navKey,
  full = false,
  onNavigate,
}: {
  navKey: NavKey;
  full?: boolean;
  onNavigate?: () => void;
}) {
  const wrap: React.CSSProperties = full
    ? { textDecoration: "none", display: "block" }
    : { textDecoration: "none" };
  if (navKey === "ANON") {
    return (
      <>
        <Link href="/login" style={wrap} onClick={onNavigate}>
          <Btn variant="ghost" sm full={full}>
            Sign in
          </Btn>
        </Link>
        <Link href="/signup" style={wrap} onClick={onNavigate}>
          <Btn variant="primary" sm full={full}>
            Start learning
          </Btn>
        </Link>
      </>
    );
  }
  return (
    <Link href={ROLE_HOME[navKey]} style={wrap} onClick={onNavigate}>
      <Btn variant="primary" sm full={full}>
        Go to dashboard
      </Btn>
    </Link>
  );
}

export function MarketChrome({
  children,
  role = null,
}: {
  children: React.ReactNode;
  /** Viewer's role from the server session; null = anonymous. */
  role?: string | null;
}) {
  const pathname = usePathname() ?? "";
  const isBrowse = pathname === "/" || pathname.startsWith("/course");
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navKey = navKeyFor(role);
  const nav = ROLE_NAV[navKey];

  const navLinks = nav.map((item) => {
    // MarketChrome only ever renders on `/` and `/course/*`, so
    // "Browse" is the only link that can be the active route — the
    // rest point into role-gated trees.
    const active = item.href === "/" && isBrowse;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setDrawerOpen(false)}
        style={{
          color: active ? "var(--wf-ink)" : "var(--wf-body)",
          fontWeight: active ? 600 : 500,
          textDecoration: "none",
        }}
      >
        {item.label}
      </Link>
    );
  });

  // ---- Mobile: sticky logo bar + ☰ → slide-down drawer ----
  if (isMobile) {
    return (
      <div
        style={{
          background: "var(--wf-bg)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            height: 56,
            padding: "0 14px",
            borderBottom: "1px solid var(--wf-hairline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            background: "white",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <LyceumMark />
          <button
            type="button"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
            style={{
              border: "1px solid var(--wf-hairline)",
              borderRadius: 6,
              background: "white",
              width: 34,
              height: 34,
              fontSize: 16,
              cursor: "pointer",
              color: "var(--wf-ink)",
            }}
          >
            {drawerOpen ? "✕" : "☰"}
          </button>
        </header>
        {drawerOpen && (
          <div
            style={{
              flexShrink: 0,
              borderBottom: "1px solid var(--wf-hairline)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "white",
            }}
          >
            <HeaderSearchCombobox compact />
            <nav
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontSize: 14,
              }}
            >
              {navLinks}
            </nav>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <AuthArea
                navKey={navKey}
                full
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        )}
        {children}
      </div>
    );
  }

  // ---- Desktop: single sticky app bar (unchanged) ----
  return (
    <div
      style={{
        background: "var(--wf-bg)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* App bar */}
      <header
        style={{
          height: 56,
          padding: "0 28px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexShrink: 0,
          background: "white",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <LyceumMark />
        <nav
          style={{
            display: "flex",
            gap: 18,
            fontSize: 13,
            color: "var(--wf-body)",
            marginLeft: 12,
          }}
        >
          {navLinks}
        </nav>
        <HeaderSearchCombobox />
        {/* Language switcher works for anonymous visitors too (cookie-
            based, no auth) — marketing pages are localizable (R37). */}
        <LocaleToggle />
        {/* Bell for signed-in viewers only — the marketplace is public,
            and notification.list is a protected query (R36). */}
        {role && <NotificationBell />}
        <AuthArea navKey={navKey} />
      </header>
      {children}
    </div>
  );
}
