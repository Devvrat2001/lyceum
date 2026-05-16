"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Annot, Btn, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type Props = {
  courseId: string;
  courseSlug: string;
  priceCents: number;
  totalLessons: number;
  upgradeNote: string | null;
  aiHint: string | null;
};

function fmtPrice(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}`;
}

export function EnrollPanel({
  courseId,
  courseSlug,
  priceCents,
  totalLessons,
  upgradeNote,
  aiHint,
}: Props) {
  const { status } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [savedFlash, setSavedFlash] = useState(false);

  const enroll = trpc.course.enroll.useMutation({
    onSuccess: ({ firstLessonSlug }) => {
      if (firstLessonSlug) {
        router.push(`/student/lesson/${firstLessonSlug}`);
      } else {
        router.push("/student");
      }
      router.refresh();
    },
    onError: (e) => {
      setError(e.message);
    },
  });

  const checkout = trpc.payment.createCheckoutSession.useMutation({
    onSuccess: ({ url, alreadyEnrolled }) => {
      if (alreadyEnrolled) {
        router.push("/student/library");
        return;
      }
      // External URL (Stripe-hosted) or local /demo-checkout/[orderId]
      if (url.startsWith("http")) {
        window.location.href = url;
      } else {
        router.push(url);
      }
    },
    onError: (e) => setError(e.message),
  });

  const addToLibrary = trpc.course.addToLibrary.useMutation({
    onSuccess: () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2400);
    },
    onError: (e) => setError(e.message),
  });

  const isPaid = priceCents > 0;

  const handleEnroll = () => {
    if (status !== "authenticated") {
      router.push(
        `/login?next=${encodeURIComponent(`/course/${courseSlug}`)}`
      );
      return;
    }
    setError(null);
    if (isPaid) {
      checkout.mutate({ courseId });
    } else {
      enroll.mutate({ courseId });
    }
  };

  const handleAddToLibrary = () => {
    if (status !== "authenticated") {
      router.push(
        `/login?next=${encodeURIComponent(`/course/${courseSlug}`)}`
      );
      return;
    }
    setError(null);
    addToLibrary.mutate({ courseId });
  };

  const cta = isPaid ? "Buy & start" : "Enroll & start";
  const isPending = isPaid ? checkout.isPending : enroll.isPending;

  return (
    <div>
      <div
        className="wf-serif"
        style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}
      >
        {fmtPrice(priceCents)}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--wf-mute)",
          marginBottom: 14,
        }}
      >
        {upgradeNote ?? ""}
      </div>

      <Btn
        variant="primary"
        full
        onClick={handleEnroll}
        disabled={isPending}
      >
        {isPending ? (isPaid ? "Starting checkout…" : "Enrolling…") : cta}
      </Btn>

      {error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--wf-accent)",
            padding: "6px 10px",
            border: "1px solid var(--wf-accent)",
            background: "var(--wf-accent-soft)",
            borderRadius: 4,
            marginTop: 8,
          }}
        >
          {error}
        </div>
      )}

      <Btn
        variant="ghost"
        full
        style={{ marginTop: 8 }}
        onClick={handleAddToLibrary}
        disabled={addToLibrary.isPending}
      >
        {savedFlash
          ? "✓ Added to library"
          : addToLibrary.isPending
          ? "Saving…"
          : "Add to library"}
      </Btn>

      <div
        style={{
          borderTop: "1px solid var(--wf-hairline)",
          marginTop: 18,
          paddingTop: 14,
        }}
      >
        <Eyebrow style={{ marginBottom: 10 }}>This course includes</Eyebrow>
        {[
          ["play", `${totalLessons}+ lessons`],
          ["sparkles", "AI tutor · always available"],
          ["star", "Adaptive practice"],
          ["trophy", "Mini-games & XP rewards"],
          ["download", "Offline access · mobile"],
          ["check", "Progress synced to teacher"],
        ].map(([ic, t]) => (
          <div
            key={t}
            style={{
              display: "flex",
              gap: 10,
              padding: "6px 0",
              fontSize: 12,
            }}
          >
            <Icon
              name={ic as "play"}
              size={13}
              color={ic === "sparkles" ? "var(--wf-ai)" : "var(--wf-body)"}
            />
            <span>{t}</span>
          </div>
        ))}
      </div>
      {aiHint && (
        <div
          style={{
            borderTop: "1px solid var(--wf-hairline)",
            marginTop: 14,
            paddingTop: 14,
          }}
        >
          <Annot ai>{aiHint}</Annot>
        </div>
      )}
    </div>
  );
}
