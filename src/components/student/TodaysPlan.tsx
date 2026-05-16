"use client";

import { useState } from "react";
import { Annot, Btn, Card, Icon } from "@/components/wf/primitives";

type IconName = "play" | "sparkles" | "book" | "mic" | "check" | "arrow";
type PlanState = "done" | "now" | "next";
type PlanItem = {
  ico: IconName;
  tag: string;
  title: string;
  meta: string;
  state: PlanState;
};

export function TodaysPlan({ initialPlan }: { initialPlan: PlanItem[] }) {
  const [plan, setPlan] = useState<PlanItem[]>(initialPlan);

  const advance = (idx: number) => {
    setPlan((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], state: "done" };
      const upcoming = next.findIndex((p, i) => i > idx && p.state === "next");
      if (upcoming !== -1)
        next[upcoming] = { ...next[upcoming], state: "now" };
      return next;
    });
  };

  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h2 className="wf-h2" style={{ fontSize: 16 }}>
          Today&apos;s plan
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Annot ai>AI-curated · 35 min</Annot>
          <Btn sm variant="ghost">
            Customize
          </Btn>
        </div>
      </div>
      <Card p={0}>
        {plan.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 16px",
              borderBottom:
                i < plan.length - 1
                  ? "1px solid var(--wf-hairline)"
                  : "none",
              opacity: row.state === "done" ? 0.55 : 1,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                border: "1px solid var(--wf-hairline)",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  row.state === "now" ? "var(--wf-ai-soft)" : "white",
              }}
            >
              <Icon
                name={row.ico}
                size={14}
                color={
                  row.state === "now" ? "var(--wf-ai)" : "var(--wf-body)"
                }
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 3,
                  flexWrap: "wrap",
                }}
              >
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: ".08em",
                    color: "var(--wf-mute)",
                  }}
                >
                  {row.tag}
                </span>
                {row.state === "now" && (
                  <span className="wf-ai-pill">Now</span>
                )}
                {row.tag === "PRACTICE" && <Annot ai>Adapts difficulty</Annot>}
                {row.tag === "SPEAK" && <Annot ai>AI conversation partner</Annot>}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: row.state === "done" ? 400 : 600,
                  textDecoration:
                    row.state === "done" ? "line-through" : "none",
                }}
              >
                {row.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  marginTop: 2,
                }}
              >
                {row.meta}
              </div>
            </div>
            {row.state === "done" ? (
              <Icon name="check" size={16} color="var(--wf-good)" />
            ) : row.state === "now" ? (
              <Btn sm variant="primary" onClick={() => advance(i)}>
                Start
              </Btn>
            ) : (
              <Icon name="arrow" size={16} color="var(--wf-mute)" />
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}
