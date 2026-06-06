"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type ServerInsight = { kind: string; body: string; cta: string | null };

export function AnalyticsInsights() {
  const cached = trpc.insight.forTeacher.useQuery({ forceRefresh: false });
  const utils = trpc.useUtils();
  const regen = trpc.insight.regenerateTeacher.useMutation({
    onSuccess: () => utils.insight.forTeacher.invalidate(),
  });

  // Auto-generate on first load if nothing cached. `firedRef` latches the
  // one-shot so the effect can carry its real deps (`regen` is a fresh
  // object every render) without a lint disable and without re-firing.
  const firedRef = useRef(false);
  const needsFirstGen = !regen.isPending && !cached.isLoading && !cached.data;
  useEffect(() => {
    if (firedRef.current || !needsFirstGen) return;
    firedRef.current = true;
    regen.mutate({ rangeDays: 30 });
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
          onClick={() => regen.mutate({ rangeDays: 30 })}
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
          Generating insights from your real data…
        </div>
      ) : (
        insights.map((i, idx) => <InsightCard key={idx} insight={i} />)
      )}
    </>
  );
}

function InsightCard({ insight }: { insight: ServerInsight }) {
  const [expanded, setExpanded] = useState<
    | { type: "fix"; suggestions: string[] }
    | { type: "nudge"; subject: string; body: string; count: number }
    | { type: "note"; note: string }
    | null
  >(null);

  const suggestFix = trpc.teacher.suggestFix.useMutation({
    onSuccess: (r) =>
      setExpanded({ type: "fix", suggestions: r.suggestions }),
  });
  const sendNudge = trpc.teacher.sendNudge.useMutation({
    onSuccess: (r) =>
      setExpanded({
        type: "nudge",
        subject: r.subject,
        body: r.body,
        count: r.recipientCount,
      }),
  });

  const isPending = suggestFix.isPending || sendNudge.isPending;

  const handleClick = () => {
    if (insight.kind === "PATTERN") {
      suggestFix.mutate({ stuckLabel: insight.body, dropPct: 20 });
    } else if (insight.kind === "AT_RISK") {
      sendNudge.mutate({ atRiskCount: 0, daysSilent: 7 });
    } else {
      setExpanded({
        type: "note",
        note: "Add a paid follow-on course at the end of the free unit. (Wires into Stripe checkout in Phase 3.)",
      });
    }
  };

  const tagLabel = insight.kind.replace(/_/g, " ");

  return (
    <div
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
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {tagLabel}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--wf-body)",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {insight.body}
      </div>

      {!expanded && insight.cta ? (
        <Btn sm variant="ai" disabled={isPending} onClick={handleClick}>
          {isPending ? "Thinking…" : insight.cta}
        </Btn>
      ) : null}

      {expanded?.type === "fix" && (
        <div
          style={{
            marginTop: 4,
            paddingTop: 10,
            borderTop: "1px dashed var(--wf-ai)",
          }}
        >
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-ai)",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            AI · SUGGESTED FIXES
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12,
              color: "var(--wf-body)",
              lineHeight: 1.5,
            }}
          >
            {expanded.suggestions.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ul>
          <Btn
            sm
            variant="ghost"
            style={{ marginTop: 8 }}
            onClick={() => setExpanded(null)}
          >
            Close
          </Btn>
        </div>
      )}
      {expanded?.type === "nudge" && (
        <div
          style={{
            marginTop: 4,
            paddingTop: 10,
            borderTop: "1px dashed var(--wf-ai)",
          }}
        >
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: "var(--wf-ai)",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            DRAFT EMAIL · TO {expanded.count} STUDENTS
          </div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            <b>Subject:</b> {expanded.subject}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--wf-body)",
              lineHeight: 1.5,
              background: "var(--wf-fillsoft)",
              padding: 8,
              borderRadius: 3,
              whiteSpace: "pre-wrap",
            }}
          >
            {expanded.body}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Btn sm variant="primary" disabled>
              Send (Phase 4)
            </Btn>
            <Btn sm variant="ghost" onClick={() => setExpanded(null)}>
              Discard
            </Btn>
          </div>
        </div>
      )}
      {expanded?.type === "note" && (
        <div
          style={{
            marginTop: 4,
            paddingTop: 10,
            borderTop: "1px dashed var(--wf-ai)",
            fontSize: 12,
            color: "var(--wf-body)",
            lineHeight: 1.5,
          }}
        >
          <Icon name="sparkles" size={12} color="var(--wf-ai)" />{" "}
          {expanded.note}
          <div style={{ marginTop: 8 }}>
            <Btn sm variant="ghost" onClick={() => setExpanded(null)}>
              Close
            </Btn>
          </div>
        </div>
      )}
      {(suggestFix.isError || sendNudge.isError) && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "var(--wf-accent)",
          }}
        >
          {suggestFix.error?.message ?? sendNudge.error?.message}
        </div>
      )}
    </div>
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
