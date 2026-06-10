import Link from "next/link";
import { Card, ImageBox } from "@/components/wf/primitives";
import { formatPrice } from "@/lib/currency";
import { fmtCount } from "@/lib/format";

export type CourseCardData = {
  id: string;
  slug: string;
  title: string;
  authorLabel: string | null;
  ratingAvg: number;
  ratingCount: number;
  priceCents: number;
  tag: string | null;
};

/**
 * One marketplace course card — shared by the homepage "Top picks" strip
 * and the /browse catalog so the two can't drift. Server- and
 * client-renderable (no hooks).
 *
 * `owned` replaces the marketing tag (BESTSELLER / NEW / …) with
 * "✓ IN LIBRARY" — the most useful at-a-glance signal for a course the
 * student already has — and swaps the price for "Continue →".
 */
export function CourseCard({
  course,
  owned,
}: {
  course: CourseCardData;
  owned: boolean;
}) {
  return (
    <Link
      href={`/course/${course.slug}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card p={0}>
        <ImageBox h={130} kind="image" />
        <div style={{ padding: 12 }}>
          <div
            className="wf-mono"
            style={{
              fontSize: 9,
              color: owned ? "var(--wf-good)" : "var(--wf-accent)",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            {owned ? "✓ IN LIBRARY" : course.tag ?? ""}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 4,
              lineHeight: 1.25,
            }}
          >
            {course.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              marginBottom: 8,
            }}
          >
            {course.authorLabel}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--wf-body)" }}>
              ★ {course.ratingAvg.toFixed(1)}{" "}
              <span style={{ color: "var(--wf-mute)" }}>
                ({fmtCount(course.ratingCount)})
              </span>
            </span>
            {owned ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--wf-good)",
                }}
              >
                Continue →
              </span>
            ) : (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color:
                    course.priceCents === 0
                      ? "var(--wf-good)"
                      : "var(--wf-ink)",
                }}
              >
                {formatPrice(course.priceCents)}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
