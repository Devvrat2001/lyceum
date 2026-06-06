"use client";

import { useEffect, useRef } from "react";
import { Btn } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

export function AdminInsights() {
  const cached = trpc.insight.forAdmin.useQuery({ forceRefresh: false });
  const utils = trpc.useUtils();
  const regen = trpc.insight.regenerateAdmin.useMutation({
    onSuccess: () => utils.insight.forAdmin.invalidate(),
  });

  // Auto-generate on first load if nothing cached. `firedRef` latches the
  // one-shot so the effect can carry its real deps (`regen` is a fresh
  // object every render) without a lint disable and without re-firing.
  const firedRef = useRef(false);
  const needsFirstGen = !regen.isPending && !cached.isLoading && !cached.data;
  useEffect(() => {
    if (firedRef.current || !needsFirstGen) return;
    firedRef.current = true;
    regen.mutate({});
  }, [needsFirstGen, regen]);

  const insights = regen.data?.insights ?? cached.data?.insights ?? null;
  const generatedAt =
    regen.data?.generatedAt ?? cached.data?.generatedAt ?? null;
  const mode = regen.data?.mode;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span
          className="wf-mono"
          style={{
            fontSize: 9,
            color: "var(--wf-mute)",
            letterSpacing: "0.06em",
          }}
        >
          {generatedAt
            ? `GENERATED ${timeAgo(new Date(generatedAt))} AGO${mode ? ` · ${mode.toUpperCase()}` : ""}`
            : "NOT YET GENERATED"}
        </span>
        <span style={{ flex: 1 }} />
        <Btn
          sm
          variant="ghost"
          disabled={regen.isPending}
          onClick={() => regen.mutate({})}
        >
          {regen.isPending ? "Refreshing…" : "↻ Refresh"}
        </Btn>
      </div>
      {regen.isError && (
        <div
          style={{
            marginBottom: 8,
            padding: 8,
            fontSize: 11,
            color: "var(--wf-accent)",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 3,
          }}
        >
          {regen.error.message}
        </div>
      )}
      {!insights ? (
        <div
          className="wf-pulse"
          style={{
            padding: 14,
            fontSize: 12,
            color: "var(--wf-mute)",
            textAlign: "center",
          }}
        >
          Generating insights from real institution data…
        </div>
      ) : (
        insights.map((i, idx) => (
          <div
            key={idx}
            style={{
              background: "white",
              border: "1px solid var(--wf-ai)",
              borderRadius: 4,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div
              className="wf-mono"
              style={{
                fontSize: 9,
                color: "var(--wf-ai)",
                letterSpacing: ".06em",
                marginBottom: 6,
              }}
            >
              {i.kind.replace(/_/g, " ")}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--wf-body)",
                lineHeight: 1.5,
              }}
            >
              {i.body}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}
