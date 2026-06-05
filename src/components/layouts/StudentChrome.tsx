"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type WF as _WF } from "@/components/wf/primitives";
import { SidebarUserMenu } from "@/components/layouts/SidebarUserMenu";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";
import { OfflineSync } from "@/components/offline/OfflineSync";

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

export function StudentChrome({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const pathname = usePathname() ?? "";
  const computedActive =
    active ??
    (pathname.startsWith("/student/skill-tree")
      ? "paths"
      : pathname.startsWith("/student/lesson")
      ? "library"
      : pathname === "/" || pathname.startsWith("/course")
      ? "browse"
      : "home");

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
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 6px 14px",
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
        <HeaderSearchCombobox compact />
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="wf-nav-item"
              data-active={item.id === computedActive}
            >
              <Icon name={item.icon} size={16} color="currentColor" />
              {item.label}
            </Link>
          ))}
        </nav>
        {/* The hardcoded "Class · Mrs. Reyes · 6B" widget that used to
            sit here showed the same fake teacher to every student. We
            don't have a clean way to thread real `class` info into a
            client component without prop-drilling through every page
            that uses StudentChrome, so the widget is gone for now —
            the dashboard's greeting already names the user's class
            and teacher when they exist. */}
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
