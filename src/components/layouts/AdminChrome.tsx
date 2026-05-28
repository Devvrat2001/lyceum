"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/wf/primitives";
import { SidebarUserMenu } from "@/components/layouts/SidebarUserMenu";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";

const NAV = [
  { id: "overview", icon: "home" as const, label: "Overview", href: "/admin" },
  {
    id: "people",
    icon: "user" as const,
    label: "People",
    href: "/admin/people",
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

export function AdminChrome({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const pathname = usePathname() ?? "";
  const computedActive =
    active ??
    NAV.find((n) => n.href !== "/admin" && pathname.startsWith(n.href))?.id ??
    "overview";

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
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 6px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
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
              style={{
                fontSize: 9,
                opacity: 0.7,
                letterSpacing: "0.06em",
              }}
            >
              ADMIN · INSTITUTION
            </div>
          </div>
        </Link>
        <HeaderSearchCombobox compact />
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => {
            const isActive = item.id === computedActive;
            return (
              <Link
                key={item.id}
                href={item.href}
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
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div
          style={{
            marginTop: "auto",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 14,
            fontSize: 10,
            opacity: 0.6,
            fontFamily: "var(--font-mono-stack)",
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
