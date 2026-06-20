"use client";

import { formatPrice as fmtPrice } from "@/lib/currency";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Annot, Btn, Eyebrow, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type Props = {
  courseId: string;
  courseSlug: string;
  priceCents: number;
  totalLessons: number;
  upgradeNote: string | null;
  aiHint: string | null;
  /**
   * Whether the current viewer is already enrolled in this course.
   * When true, the panel flips from "Buy / Enroll / Add to library"
   * to a single "Continue learning" CTA so we never invite a paying
   * student to re-purchase a course they already own.
   * Undefined (e.g. for anon visitors) treated as false.
   */
  isEnrolled?: boolean;
  /**
   * Slug of the first lesson in the course — used by the
   * "Continue learning" deep-link. Null if the course has no
   * lessons yet (very early draft state).
   */
  firstLessonSlug?: string | null;
};

export function EnrollPanel({
  courseId,
  courseSlug,
  priceCents,
  totalLessons,
  upgradeNote,
  aiHint,
  isEnrolled = false,
  firstLessonSlug = null,
}: Props) {
  const { status } = useSession();
  const t = useTranslations("EnrollPanel");
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

  const cta = isPaid ? t("buyStart") : t("enrollStart");
  const isPending = isPaid ? checkout.isPending : enroll.isPending;

  const continueHref = firstLessonSlug
    ? `/student/lesson/${firstLessonSlug}`
    : "/student/library";

  return (
    <div>
      {isEnrolled ? (
        // Already-owned header: no price (the student doesn't need to
        // see what they paid), no upgrade note. Just a clean "in your
        // library" eyebrow + headline so the panel reads as a
        // continue-learning surface, not a buy surface.
        <div style={{ marginBottom: 14 }}>
          <div
            className="wf-mono"
            style={{
              fontSize: 10,
              color: "var(--wf-good)",
              letterSpacing: "0.08em",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {t("inYourLibrary")}
          </div>
          <div
            className="wf-serif"
            style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}
          >
            {t("pickUp")}
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      {isEnrolled ? (
        <>
          <Link
            href={continueHref}
            style={{ textDecoration: "none", display: "block" }}
          >
            <Btn variant="primary" full>
              {t("continueLearning")}
            </Btn>
          </Link>
          <Link
            href="/student/library"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 8,
              fontSize: 12,
              color: "var(--wf-mute)",
              textDecoration: "none",
            }}
          >
            {t("openLibrary")}
          </Link>
        </>
      ) : (
        <>
          <Btn
            variant="primary"
            full
            onClick={handleEnroll}
            disabled={isPending}
          >
            {isPending
              ? isPaid
                ? t("startingCheckout")
                : t("enrolling")
              : cta}
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
              ? t("addedToLibrary")
              : addToLibrary.isPending
              ? t("saving")
              : t("addToLibrary")}
          </Btn>
        </>
      )}

      <div
        style={{
          borderTop: "1px solid var(--wf-hairline)",
          marginTop: 18,
          paddingTop: 14,
        }}
      >
        <Eyebrow style={{ marginBottom: 10 }}>{t("includes")}</Eyebrow>
        {[
          ["play", t("featLessons", { count: totalLessons })],
          ["sparkles", t("featTutor")],
          ["star", t("featAdaptive")],
          ["trophy", t("featGames")],
          ["download", t("featOffline")],
          ["check", t("featSynced")],
        ].map(([ic, label]) => (
          <div
            key={label}
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
            <span>{label}</span>
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
