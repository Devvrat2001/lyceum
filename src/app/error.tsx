"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <Card p={32} style={{ maxWidth: 480, width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Icon name="bolt" size={16} color="var(--wf-accent)" />
          <Eyebrow>Something went wrong</Eyebrow>
        </div>
        <h1 className="wf-h1" style={{ fontSize: 22, marginBottom: 10 }}>
          Hit a snag.
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--wf-body)",
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          The page hit an unexpected error. Try reloading; if it keeps
          happening, let us know.
        </p>
        {error.digest && (
          <div
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-mute)",
              marginBottom: 16,
              padding: "6px 8px",
              background: "var(--wf-fillsoft)",
              borderRadius: 3,
              wordBreak: "break-all",
            }}
          >
            digest: {error.digest}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="primary" onClick={reset}>
            Try again
          </Btn>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Btn variant="ghost">Back to home</Btn>
          </Link>
        </div>
      </Card>
    </div>
  );
}
