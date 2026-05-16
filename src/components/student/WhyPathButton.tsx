"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Card, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

export function WhyPathButton() {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const ask = trpc.skill.whyThisPath.useMutation();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={popoverRef} style={{ position: "relative" }}>
      <Btn
        variant="ai"
        icon={<Icon name="sparkles" size={12} color="var(--wf-ai)" />}
        onClick={() => {
          setOpen(true);
          if (!ask.data && !ask.isPending) ask.mutate({});
        }}
      >
        Why this path?
      </Btn>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 30,
            width: 360,
          }}
        >
          <Card
            p={16}
            style={{
              borderColor: "var(--wf-ai)",
              background: "white",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <Icon name="sparkles" size={14} color="var(--wf-ai)" />
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-ai)",
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                }}
              >
                AI · WHY THIS PATH
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "var(--wf-mute)",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
            {ask.isPending ? (
              <div
                className="wf-pulse"
                style={{ fontSize: 12, color: "var(--wf-mute)" }}
              >
                Reading your progress…
              </div>
            ) : ask.isError ? (
              <div style={{ fontSize: 12, color: "var(--wf-accent)" }}>
                Couldn&apos;t get an answer: {ask.error.message}
              </div>
            ) : ask.data ? (
              <>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--wf-body)",
                    lineHeight: 1.6,
                  }}
                >
                  {ask.data.explanation}
                </div>
                <div
                  className="wf-mono"
                  style={{
                    fontSize: 9,
                    color: "var(--wf-mute)",
                    marginTop: 10,
                    letterSpacing: "0.04em",
                  }}
                >
                  Logged for FERPA · {(ask.data.elapsedMs / 1000).toFixed(2)}s
                </div>
              </>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
