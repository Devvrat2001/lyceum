"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/wf/primitives";
import { SidebarUserMenu } from "@/components/layouts/SidebarUserMenu";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";
import { useIsMobile } from "@/lib/useMediaQuery";

const NAV = [
  { id: "overview", icon: "home" as const, label: "Overview", href: "/admin" },
  {
    id: "people",
    icon: "user" as const,
    label: "People",
    href: "/admin/people",
  },
  {
    id: "teachers",
    icon: "star" as const,
    label: "Teachers",
    href: "/admin/teachers",
  },
  {
    id: "curriculum",
    icon: "book" as const,
    label: "Curriculum",
    href: "/admin/curriculum",
  },
  {
    id: "classes",
    icon: "grid" as const,
    label: "Classes",
    href: "/admin/classes",
  },
  {
    id: "analytics",
    icon: "chart" as const,
    label: "Analytics",
    href: "/admin/analytics",
  },
  {
    id: "integrations",
    icon: "cog" as const,
    label: "Integrations",
    href: "/admin/integrations",
  },
  {
    id: "branding",
    icon: "star" as const,
    label: "Branding",
    href: "/admin/branding",
  },
  {
    id: "billing",
    icon: "bolt" as const,
    label: "Billing",
    href: "/admin/billing",
  },
  {
    id: "audit",
    icon: "chart" as const,
    label: "Audit log",
    href: "/admin/audit",
  },
];

function AdminMark() {
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
          background: "white",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--wf-ink)",
          fontFamily: "var(--font-serif-stack)",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        L
      </div>
      <div>
        <div
          style={{
            fontFamily: "var(--font-serif-stack)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Cedar Middle
        </div>
        <div
          className="wf-mono"
          style={{ fontSize: 9, opacity: 0.7, letterSpacing: "0.06em" }}
        >
          ADMIN · INSTITUTION
        </div>
      </div>
    </Link>
  );
}

const PLAN_FOOTER_STYLE: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
  fontFamily: "var(--font-mono-stack)",
};

export function AdminChrome({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const pathname = usePathname() ?? "";
  const isMobile = useIsMobile();
  const t = useTranslations("AdminNav");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const computedActive =
    active ??
    NAV.find((n) => n.href !== "/admin" && pathname.startsWith(n.href))?.id ??
    "overview";

  const navLinks = NAV.map((item) => {
    const isActive = item.id === computedActive;
    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={() => setDrawerOpen(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 4,
          fontSize: 13,
          fontWeight: isActive ? 600 : 500,
          color: isActive ? "white" : "rgba(255,255,255,0.6)",
          background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
          textDecoration: "none",
        }}
      >
        <Icon name={item.icon} size={16} color="currentColor" />
        {t(item.id)}
      </Link>
    );
  });

  // ---- Mobile: dark top bar + slide-down drawer, full-width content ----
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            background: "var(--wf-ink)",
            color: "white",
          }}
        >
          <AdminMark />
          <button
            type="button"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.06)",
              width: 34,
              height: 34,
              fontSize: 16,
              cursor: "pointer",
              color: "white",
            }}
          >
            {drawerOpen ? "✕" : "☰"}
          </button>
        </header>
        {drawerOpen && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "var(--wf-ink)",
              color: "white",
            }}
          >
            <HeaderSearchCombobox compact />
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {navLinks}
            </nav>
            <div
              style={{
                ...PLAN_FOOTER_STYLE,
                borderTop: "1px solid rgba(255,255,255,0.12)",
                paddingTop: 12,
              }}
            >
              Plan: SCHOOL · 320 seats
            </div>
            <SidebarUserMenu dark />
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
        gridTemplateColumns: "224px 1fr",
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
          gap: 14,
          background: "var(--wf-ink)",
          color: "white",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "0 6px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <AdminMark />
        </div>
        <HeaderSearchCombobox compact />
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navLinks}
        </nav>
        <div
          style={{
            ...PLAN_FOOTER_STYLE,
            marginTop: "auto",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 14,
          }}
        >
          Plan: SCHOOL · 320 seats
        </div>
        <SidebarUserMenu dark />
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
