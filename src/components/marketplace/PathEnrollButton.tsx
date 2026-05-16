"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Btn } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

export function PathEnrollButton({
  pathId,
  pathSlug,
}: {
  pathId: string;
  pathSlug: string;
}) {
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
      // All paid → just feedback
      setFeedback(
        saved > 0 ? `Saved ${saved} course${saved === 1 ? "" : "s"} for later` : "Already enrolled"
      );
    },
    onError: (e) => setFeedback(e.message),
  });

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

  return (
    <Btn
      variant="primary"
      sm
      disabled={enroll.isPending}
      onClick={() => {
        if (status !== "authenticated") {
          router.push(`/login?next=${encodeURIComponent(`/?path=${pathSlug}`)}`);
          return;
        }
        enroll.mutate({ pathId });
      }}
    >
      {enroll.isPending ? "Enrolling…" : "Enroll →"}
    </Btn>
  );
}
