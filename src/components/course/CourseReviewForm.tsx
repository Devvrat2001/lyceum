"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/react";
import { Btn, Card } from "@/components/wf/primitives";

/**
 * "Rate this course" form for enrolled students on the course detail page.
 * Submits via `course.submitReview` (which recomputes the course's
 * ratingAvg/ratingCount in a transaction), then refreshes the server
 * component so the new review + rating render. Pre-fills with the student's
 * existing review.
 *
 * Split wrapper/inner so the editable state can lazy-init from the loaded
 * review — no set-state-in-effect, no lint disable.
 */
export function CourseReviewForm({ courseId }: { courseId: string }) {
  const existing = trpc.course.myReview.useQuery({ courseId });
  if (existing.isLoading) return null;
  return (
    <ReviewFormInner
      courseId={courseId}
      initialRating={existing.data?.rating ?? 0}
      initialBody={existing.data?.body ?? ""}
      hadReview={!!existing.data}
    />
  );
}

function ReviewFormInner({
  courseId,
  initialRating,
  initialBody,
  hadReview,
}: {
  courseId: string;
  initialRating: number;
  initialBody: string;
  hadReview: boolean;
}) {
  const t = useTranslations("CourseReview");
  const router = useRouter();
  const [rating, setRating] = useState(initialRating);
  const [body, setBody] = useState(initialBody);
  const submit = trpc.course.submitReview.useMutation({
    onSuccess: () => router.refresh(),
  });

  const canSubmit = rating >= 1 && body.trim().length > 0 && !submit.isPending;

  return (
    <Card p={16} style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {hadReview ? t("yourReview") : t("rateTitle")}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={t("starsAria", { count: n })}
            aria-pressed={n <= rating}
            onClick={() => setRating(n)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
              padding: 0,
              color: n <= rating ? "var(--wf-accent)" : "var(--wf-hairline)",
            }}
          >
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("placeholder")}
        maxLength={2000}
        rows={3}
        style={{
          width: "100%",
          resize: "vertical",
          fontSize: 13,
          padding: 8,
          border: "1px solid var(--wf-hairline)",
          borderRadius: 4,
          fontFamily: "inherit",
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Btn
          variant="primary"
          sm
          disabled={!canSubmit}
          onClick={() => submit.mutate({ courseId, rating, body: body.trim() })}
        >
          {submit.isPending
            ? t("saving")
            : hadReview
              ? t("update")
              : t("submit")}
        </Btn>
        {submit.isSuccess && !submit.isPending && (
          <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>
            {t("thanks")}
          </span>
        )}
        {submit.isError && (
          <span style={{ fontSize: 12, color: "var(--wf-accent)" }}>
            {submit.error.message}
          </span>
        )}
      </div>
    </Card>
  );
}
