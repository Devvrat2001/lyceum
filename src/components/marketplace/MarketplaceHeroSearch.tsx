"use client";

import { useState } from "react";
import Link from "next/link";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

export function MarketplaceHeroSearch() {
  const [q, setQ] = useState("Help me prep for next week's fractions test");
  const aiSearch = trpc.marketplace.aiSearch.useMutation();
  const result = aiSearch.data?.result;

  return (
    <div style={{ marginBottom: 18 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length < 3) return;
          aiSearch.mutate({ query: q });
        }}
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: 480,
            display: "flex",
            gap: 8,
            padding: "12px 16px",
            border: "1.5px solid var(--wf-line)",
            borderRadius: 4,
            alignItems: "center",
            background: "white",
          }}
        >
          <Icon name="sparkles" size={16} color="var(--wf-ai)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={aiSearch.isPending}
            placeholder="What do you want to learn?"
            style={{
              flex: 1,
              fontSize: 14,
              border: "none",
              outline: "none",
              background: "transparent",
            }}
          />
        </div>
        <Btn
          type="submit"
          variant="primary"
          disabled={aiSearch.isPending || q.trim().length < 3}
        >
          {aiSearch.isPending ? "Thinking…" : "Ask AI →"}
        </Btn>
        {(result || aiSearch.isPending) && (
          <Btn
            type="button"
            variant="ghost"
            sm
            onClick={() => aiSearch.reset()}
          >
            ← Back
          </Btn>
        )}
      </form>

      {result && (
        <div
          style={{
            marginTop: 6,
            border: "1px solid var(--wf-ai)",
            background: "var(--wf-ai-soft)",
            borderRadius: 6,
            padding: 16,
            maxWidth: 720,
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
              AI · CURATED PATH
            </span>
            <span style={{ flex: 1 }} />
            <span
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-mute)" }}
            >
              ● {(aiSearch.data!.elapsedMs / 1000).toFixed(2)}s ·{" "}
              {result.estTimeLabel}
            </span>
          </div>

          <div
            style={{
              fontSize: 14,
              color: "var(--wf-body)",
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            {result.summary}
          </div>

          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {result.items.map((it, i) => {
              const href =
                it.kind === "course" && it.slug
                  ? `/course/${it.slug}`
                  : it.kind === "lesson" && it.slug
                  ? `/student/lesson/${it.slug}`
                  : null;
              const inner = (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    background: "white",
                    border: "1px solid var(--wf-hairline)",
                    borderRadius: 4,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "1px solid var(--wf-ai)",
                      color: "var(--wf-ai)",
                      fontFamily: "var(--font-mono-stack)",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--wf-ink)",
                        }}
                      >
                        {it.title}
                      </span>
                      <span
                        className="wf-mono"
                        style={{
                          fontSize: 9,
                          color:
                            it.kind === "tip"
                              ? "var(--wf-mute)"
                              : "var(--wf-ai)",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        {it.kind}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--wf-body)",
                        marginTop: 4,
                      }}
                    >
                      {it.why}
                    </div>
                  </div>
                  {href && (
                    <Icon
                      name="arrow"
                      size={14}
                      color="var(--wf-body)"
                      style={{ marginTop: 4, flexShrink: 0 }}
                    />
                  )}
                </div>
              );
              return (
                <li key={i}>
                  {href ? (
                    <Link
                      href={href}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {aiSearch.isError && !result && (
        <div
          style={{
            marginTop: 6,
            padding: 12,
            fontSize: 12,
            color: "var(--wf-accent)",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 4,
          }}
        >
          Couldn&apos;t reach the AI search ({aiSearch.error.message}). Try
          again in a moment.
        </div>
      )}
    </div>
  );
}
