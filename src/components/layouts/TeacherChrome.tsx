"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Btn, Card } from "@/components/wf/primitives";
import { SidebarUserMenu } from "@/components/layouts/SidebarUserMenu";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";
import { useIsMobile } from "@/lib/useMediaQuery";

const NAV = [
  {
    id: "courses",
    icon: "book" as const,
    label: "My courses",
    // /teacher is the courses overview — it lists every course the
    // teacher owns. Never hard-link a specific demo course here: it
    // 404s for any teacher who doesn't own that slug.
    href: "/teacher",
  },
  {
    id: "students",
    icon: "user" as const,
    label: "Students",
    href: "/teacher/students",
  },
  {
    id: "assignments",
    icon: "check" as const,
    label: "Assignments",
    href: "/teacher/assignments",
  },
  {
    id: "analytics",
    icon: "chart" as const,
    label: "Analytics",
    href: "/teacher/analytics",
  },
  {
    id: "storefront",
    icon: "star" as const,
    label: "Storefront",
    href: "/teacher/storefront",
  },
  {
    id: "paths",
    icon: "branch" as const,
    label: "Bundles",
    href: "/teacher/paths",
  },
  {
    id: "earnings",
    icon: "bolt" as const,
    label: "Earnings",
    href: "/teacher/earnings",
  },
  {
    id: "community",
    icon: "chat" as const,
    label: "Discussions",
    href: "/teacher/discussions",
  },
];

function TeacherMark() {
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
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        Lyceum
      </span>
      <span
        className="wf-mono"
        style={{ fontSize: 9, color: "var(--wf-mute)", marginLeft: "auto" }}
      >
        TEACH
      </span>
    </Link>
  );
}

function AiAssistCard() {
  return (
    <Card
      p={10}
      style={{ background: "var(--wf-ai-soft)", borderColor: "var(--wf-ai)" }}
    >
      <div
        className="wf-mono"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--wf-ai)",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        AI ASSIST
      </div>
      <div style={{ fontSize: 11, color: "var(--wf-body)", marginBottom: 8 }}>
        Generate a unit, quiz, or rubric in seconds.
      </div>
      <Link href="/teacher/courses/new" style={{ display: "block" }}>
        <Btn sm variant="ai" full>
          Open AI builder
        </Btn>
      </Link>
    </Card>
  );
}

export function TeacherChrome({
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
    (pathname.startsWith("/teacher/analytics")
      ? "analytics"
      : pathname.startsWith("/teacher/courses")
      ? "courses"
      : pathname.startsWith("/teacher/students")
      ? "students"
      : pathname.startsWith("/teacher/storefront")
      ? "storefront"
      : pathname.startsWith("/teacher/earnings")
      ? "earnings"
      : pathname.startsWith("/teacher/discussions")
      ? "community"
      : "courses");

  const navLinks = NAV.map((item) => (
    <Link
      key={item.id}
      href={item.href}
      className="wf-nav-item"
      data-active={item.id === computedActive}
      onClick={() => setDrawerOpen(false)}
      style={
        item.id === computedActive
          ? { background: "white", border: "1px solid var(--wf-hairline)" }
          : undefined
      }
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
        <header
          style={{
            height: 52,
            flexShrink: 0,
            borderBottom: "1px solid var(--wf-hairline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            background: "var(--wf-fillsoft)",
          }}
        >
          <TeacherMark />
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
              background: "var(--wf-fillsoft)",
            }}
          >
            <HeaderSearchCombobox compact />
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {navLinks}
            </nav>
            <AiAssistCard />
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
      <aside
        style={{
          borderRight: "1px solid var(--wf-hairline)",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          background: "var(--wf-fillsoft)",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 6px 14px" }}>
          <TeacherMark />
        </div>
        <HeaderSearchCombobox compact />
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navLinks}
        </nav>
        <div
          style={{
            marginTop: "auto",
            borderTop: "1px solid var(--wf-hairline)",
            paddingTop: 14,
          }}
        >
          <AiAssistCard />
        </div>
        <SidebarUserMenu />
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
