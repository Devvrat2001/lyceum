"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/wf/primitives";
import { SidebarUserMenu } from "@/components/layouts/SidebarUserMenu";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";
import { OfflineSync } from "@/components/offline/OfflineSync";
import { useIsMobile } from "@/lib/useMediaQuery";

const NAV = [
  { id: "home", icon: "home" as const, label: "Home", href: "/student" },
  {
    id: "paths",
    icon: "branch" as const,
    label: "My Paths",
    href: "/student/skill-tree",
  },
  {
    id: "library",
    icon: "book" as const,
    label: "Library",
    href: "/student/library",
  },
  { id: "browse", icon: "search" as const, label: "Browse", href: "/" },
  {
    id: "progress",
    icon: "chart" as const,
    label: "Progress",
    href: "/student/progress",
  },
  {
    id: "community",
    icon: "chat" as const,
    label: "Community",
    href: "/student/community",
  },
];

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
          letterSpacing: "-0.01em",
        }}
      >
        Lyceum
      </span>
    </Link>
  );
}

export function StudentChrome({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const pathname = usePathname() ?? "";
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const computedActive =
    active ??
    (pathname.startsWith("/student/skill-tree")
      ? "paths"
      : pathname.startsWith("/student/lesson")
      ? "library"
      : pathname === "/" || pathname.startsWith("/course")
      ? "browse"
      : "home");

  const navLinks = NAV.map((item) => (
    <Link
      key={item.id}
      href={item.href}
      className="wf-nav-item"
      data-active={item.id === computedActive}
      onClick={() => setDrawerOpen(false)}
    >
      <Icon name={item.icon} size={16} color="currentColor" />
      {item.label}
    </Link>
  ));

  // ---- Mobile: top bar + slide-down drawer, full-width content ----
  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "var(--wf-bg)",
        }}
      >
        <OfflineSync />
        <header
          style={{
            height: 52,
            flexShrink: 0,
            borderBottom: "1px solid var(--wf-hairline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
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
              background: "var(--wf-bg)",
            }}
          >
            <HeaderSearchCombobox compact />
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {navLinks}
            </nav>
            <SidebarUserMenu />
          </div>
        )}
        <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
      </div>
    );
  }

  // ---- Desktop: fixed sidebar + content (unchanged) ----
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "212px 1fr",
        height: "100vh",
        background: "var(--wf-bg)",
      }}
    >
      <OfflineSync />
      <aside
        style={{
          borderRight: "1px solid var(--wf-hairline)",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 6px 14px" }}>
          <LyceumMark />
        </div>
        <HeaderSearchCombobox compact />
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navLinks}
        </nav>
        <div style={{ marginTop: "auto" }}>
          <SidebarUserMenu />
        </div>
      </aside>
      <main
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </div>
  );
}
