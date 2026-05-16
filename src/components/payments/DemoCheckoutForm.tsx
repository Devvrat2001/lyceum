"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

export function DemoCheckoutForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const confirm = trpc.payment.demoConfirm.useMutation({
    onSuccess: (r) => {
      router.push(`/checkout/success?courseSlug=${r.courseSlug}`);
    },
    onError: (e) => setError(e.message),
  });

  return (
    <>
      <Btn
        variant="primary"
        full
        disabled={confirm.isPending}
        onClick={() => {
          setError(null);
          confirm.mutate({ orderId });
        }}
      >
        {confirm.isPending ? "Processing…" : "Pay (demo) →"}
      </Btn>
      {error && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            fontSize: 11,
            color: "var(--wf-accent)",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
