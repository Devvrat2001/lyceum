import Link from "next/link";
import { Card, Eyebrow, ImageBox } from "@/components/wf/primitives";

type C = {
  slug: string;
  title: string;
  sub: string;
  pct: number;
  mins: string;
  firstLessonSlug: string | null;
};

export function ContinueLearningCard({ c }: { c: C }) {
  const href = c.firstLessonSlug
    ? `/student/lesson/${c.firstLessonSlug}`
    : `/course/${c.slug}`;
  return (
    <Link
      href={href}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card p={0} className="st-card">
        <ImageBox h={88} kind="video" />
        <div style={{ padding: 14 }}>
          <Eyebrow style={{ marginBottom: 4 }}>{c.sub}</Eyebrow>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            {c.title}
          </div>
          <div className="wf-meter wf-meter--accent">
            <i style={{ width: `${c.pct}%` }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <span
              className="wf-mono"
              style={{ fontSize: 11, color: "var(--wf-mute)" }}
            >
              {c.pct}%
            </span>
            <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
              {c.mins}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
