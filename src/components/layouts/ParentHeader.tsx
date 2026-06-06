"use client";

import Link from "next/link";
import { Btn } from "@/components/wf/primitives";
import { useIsMobile } from "@/lib/useMediaQuery";

/**
 * Header bar for the (chrome-less) parent dashboard. A client component
 * purely so it can drop the email and tighten padding on phones via
 * `useIsMobile` — the same JS-driven responsive approach the role
 * chromes use (this app has no CSS breakpoint layer). When parents need
 * multi-kid navigation, this is where a proper ParentChrome sidebar grows.
 */
export function ParentHeader({ email }: { email?: string | null }) {
  const isMobile = useIsMobile();
  return (
    <header
      style={{
        height: 56,
        padding: isMobile ? "0 14px" : "0 24px",
        borderBottom: "1px solid var(--wf-hairline)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexShrink: 0,
      }}
    >
      <Link
        href="/parent"
        style={{
          fontSize: 16,
          fontWeight: 700,
          textDecoration: "none",
          color: "var(--wf-ink)",
        }}
      >
        Lyceum · Parent
      </Link>
      <span style={{ flex: 1 }} />
      {!isMobile && email && (
        <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>{email}</span>
      )}
      <Link href="/api/auth/signout" style={{ textDecoration: "none" }}>
        <Btn variant="ghost" sm>
          Sign out
        </Btn>
      </Link>
    </header>
  );
}
