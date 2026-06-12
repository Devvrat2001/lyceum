"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Eyebrow } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/**
 * Parent-side half of self-service linking (REQUIREMENTS R26): enter
 * the family code the child generated in Settings → Family. On success
 * the page refreshes so the new child card renders server-side.
 */
export function LinkChildForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [linkedName, setLinkedName] = useState<string | null>(null);

  const link = trpc.parent.linkWithCode.useMutation({
    onSuccess: (r) => {
      setLinkedName(r.childName);
      setCode("");
      router.refresh();
    },
  });

  return (
    <div style={{ textAlign: "left" }}>
      <Eyebrow style={{ marginBottom: 8 }}>Link a child</Eyebrow>
      <div
        style={{
          fontSize: 12,
          color: "var(--wf-body)",
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        Ask your kid to open Settings → Family on their Lyceum account
        and tap &quot;Generate family code&quot;, then enter the code
        here. Your school can also link you from their side.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 4 && !link.isPending) {
            setLinkedName(null);
            link.mutate({ code });
          }
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7MX2P"
          maxLength={16}
          aria-label="Family code"
          className="wf-mono"
          style={{
            flex: 1,
            minWidth: 160,
            fontSize: 14,
            letterSpacing: "0.15em",
            padding: "8px 10px",
            border: "1px solid var(--wf-line)",
            borderRadius: 4,
            background: "white",
            outline: "none",
            textTransform: "uppercase",
          }}
        />
        <Btn
          sm
          variant="primary"
          type="submit"
          disabled={link.isPending || code.trim().length < 4}
        >
          {link.isPending ? "Linking…" : "Link"}
        </Btn>
      </form>
      {link.error && (
        <div
          style={{ marginTop: 8, fontSize: 11, color: "var(--wf-accent)" }}
        >
          {link.error.message}
        </div>
      )}
      {linkedName && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--wf-good)" }}>
          ✓ Linked {linkedName} — their progress will appear above.
        </div>
      )}
    </div>
  );
}
