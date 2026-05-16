"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Btn } from "@/components/wf/primitives";
import { HeaderSearchCombobox } from "@/components/marketplace/HeaderSearchCombobox";

export function MarketChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isBrowse = pathname === "/" || pathname.startsWith("/course");
  const isLibrary = pathname.startsWith("/student");
  const isTeach = pathname.startsWith("/teacher");

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
          <Link
            href="/"
            style={{
              color: isBrowse ? "var(--wf-ink)" : "var(--wf-body)",
              fontWeight: isBrowse ? 600 : 500,
              textDecoration: "none",
            }}
          >
            Browse
          </Link>
          <Link
            href="/student"
            style={{
              color: isLibrary ? "var(--wf-ink)" : "var(--wf-body)",
              fontWeight: isLibrary ? 600 : 500,
              textDecoration: "none",
            }}
          >
            My Library
          </Link>
          <Link
            href="/student/skill-tree"
            style={{ color: "var(--wf-body)", textDecoration: "none" }}
          >
            Paths
          </Link>
          <Link
            href="/teacher/courses/algebra-foundations/edit"
            style={{
              color: isTeach ? "var(--wf-ink)" : "var(--wf-body)",
              fontWeight: isTeach ? 600 : 500,
              textDecoration: "none",
            }}
          >
            Teach
          </Link>
        </nav>
        <HeaderSearchCombobox />
        <Link href="/student" style={{ textDecoration: "none" }}>
          <Btn variant="ghost" sm>
            Sign in
          </Btn>
        </Link>
        <Link href="/student" style={{ textDecoration: "none" }}>
          <Btn variant="primary" sm>
            Start learning
          </Btn>
        </Link>
      </header>
      {children}
    </div>
  );
}
