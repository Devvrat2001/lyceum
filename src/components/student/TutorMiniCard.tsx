"use client";

import { useState } from "react";
import { Card, Icon } from "@/components/wf/primitives";

export function TutorMiniCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card
      style={{
        background: "var(--wf-ai-soft)",
        borderColor: "var(--wf-ai)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Icon name="sparkles" size={16} color="var(--wf-ai)" />
        <h3
          className="wf-mono"
          style={{
            fontSize: 13,
            margin: 0,
            fontWeight: 700,
            color: "var(--wf-ai)",
            letterSpacing: "0.02em",
          }}
        >
          AI TUTOR
        </h3>
        <span
          className="wf-mono"
          style={{
            fontSize: 9,
            color: "var(--wf-ai)",
            marginLeft: "auto",
          }}
        >
          ● ONLINE
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--wf-body)",
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        &ldquo;Stuck on a problem? Ask me anything — I&apos;ll explain step by
        step, no judgment.&rdquo;
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "white",
          border: "1px solid var(--wf-ai)",
          borderRadius: 4,
          padding: "8px 10px",
          fontSize: 11,
          color: "var(--wf-mute)",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Icon name="mic" size={12} color="var(--wf-ai)" />
        {open ? "Listening…" : "Type or speak your question…"}
      </button>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        {["Explain that quiz Q", "Quiz me on this", "Easier example?"].map(
          (s) => (
            <span
              key={s}
              style={{
                fontSize: 10,
                padding: "3px 7px",
                background: "white",
                border: "1px solid var(--wf-ai)",
                color: "var(--wf-ai)",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {s}
            </span>
          )
        )}
      </div>
    </Card>
  );
}
