"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Btn } from "@/components/wf/primitives";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";

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
  const navKey = navKeyFor(role);
  const nav = ROLE_NAV[navKey];

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
        <nav
          style={{
            display: "flex",
            gap: 18,
            fontSize: 13,
            color: "var(--wf-body)",
            marginLeft: 12,
          }}
        >
          {nav.map((item) => {
            // MarketChrome only ever renders on `/` and `/course/*`,
            // so "Browse" is the only link that can be the active
            // route — the rest point into role-gated trees.
            const active = item.href === "/" && isBrowse;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  color: active ? "var(--wf-ink)" : "var(--wf-body)",
                  fontWeight: active ? 600 : 500,
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <HeaderSearchCombobox />
        {navKey === "ANON" ? (
          <>
            <Link href="/login" style={{ textDecoration: "none" }}>
              <Btn variant="ghost" sm>
                Sign in
              </Btn>
            </Link>
            <Link href="/signup" style={{ textDecoration: "none" }}>
              <Btn variant="primary" sm>
                Start learning
              </Btn>
            </Link>
          </>
        ) : (
          <Link
            href={ROLE_HOME[navKey]}
            style={{ textDecoration: "none" }}
          >
            <Btn variant="primary" sm>
              Go to dashboard
            </Btn>
          </Link>
        )}
      </header>
      {children}
    </div>
  );
}
