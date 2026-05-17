"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Btn } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

type Props = {
  pathId: string;
  pathSlug: string;
  /**
   * How many of the path's courses the viewer already owns. Defaults
   * to 0 (treats viewer as anon / no enrollments) so callers without
   * the data still get the original "Enroll →" behavior.
   */
  ownedCount?: number;
  /** Total courses in the path — fully owned when ownedCount === totalCount. */
  totalCount?: number;
};

export function PathEnrollButton({
  pathId,
  pathSlug,
  ownedCount = 0,
  totalCount = 0,
}: Props) {
  const { status } = useSession();
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);

  const enroll = trpc.path.enroll.useMutation({
    onSuccess: ({ enrolled, saved, firstLessonSlug }) => {
      if (firstLessonSlug) {
        router.push(`/student/lesson/${firstLessonSlug}`);
        return;
      }
      if (enrolled > 0) {
        router.push("/student/library");
        return;
      }
      setFeedback(
        saved > 0
          ? `Saved ${saved} course${saved === 1 ? "" : "s"} for later`
          : "Already enrolled"
      );
    },
    onError: (e) => setFeedback(e.message),
  });

  // Fully-owned state: don't render the enroll mutation at all. The
  // student already has every course in the path in their library —
  // surface that and link them straight there.
  const fullyOwned = totalCount > 0 && ownedCount >= totalCount;
  if (fullyOwned) {
    return (
      <Link
        href="/student/library"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--wf-good)",
          textDecoration: "none",
        }}
      >
        ✓ In your library
      </Link>
    );
  }

  if (feedback) {
    return (
      <span
        className="wf-mono"
        style={{ fontSize: 10, color: "var(--wf-good)" }}
      >
        ✓ {feedback}
      </span>
    );
  }

  // Partial-ownership hint: a small "N of M owned" subtext above the
  // button so the student knows the click won't double-purchase.
  const partial = ownedCount > 0 && ownedCount < totalCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {partial && (
        <span
          className="wf-mono"
          style={{ fontSize: 9, color: "var(--wf-mute)", letterSpacing: "0.06em" }}
        >
          {ownedCount} / {totalCount} OWNED
        </span>
      )}
      <Btn
        variant="primary"
        sm
        disabled={enroll.isPending}
        onClick={() => {
          if (status !== "authenticated") {
            router.push(
              `/login?next=${encodeURIComponent(`/?path=${pathSlug}`)}`
            );
            return;
          }
          enroll.mutate({ pathId });
        }}
      >
        {enroll.isPending ? "Enrolling…" : "Enroll →"}
      </Btn>
    </div>
  );
}
