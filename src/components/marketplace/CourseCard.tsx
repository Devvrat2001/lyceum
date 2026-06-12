import Link from "next/link";
import { Card } from "@/components/wf/primitives";
import { formatPrice } from "@/lib/currency";
import { fmtCount } from "@/lib/format";
import { boardLabel } from "@/lib/marketplace";
import { courseGradient, subjectGlyph } from "@/lib/thumbnail";

export type CourseCardData = {
  id: string;
  slug: string;
  title: string;
  authorLabel: string | null;
  ratingAvg: number;
  ratingCount: number;
  priceCents: number;
  tag: string | null;
  thumbnailUrl: string | null;
  /** Drives the fallback art's subject glyph; optional so older callers
   *  keep compiling (they just get the generic book mark). */
  subject?: string | null;
  /** Curriculum board slug ("cbse" | …); optional for older callers. */
  board?: string | null;
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
        {course.thumbnailUrl ? (
          // Teacher-pasted thumbnails live on arbitrary hosts, so
          // next/image would need a wildcard remotePatterns proxy —
          // a plain lazy <img> is the deliberate choice here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnailUrl}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: 130,
              objectFit: "cover",
              display: "block",
              borderBottom: "1px solid var(--wf-hairline)",
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              height: 130,
              background: courseGradient(course.slug),
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 44, opacity: 0.4 }}>
              {subjectGlyph(course.subject)}
            </span>
          </div>
        )}
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
            {/* Marketing tag + board tag share the mono line ("BESTSELLER
                · CBSE"); ownership replaces both — "in library" beats any
                shopping signal. */}
            {owned
              ? "✓ IN LIBRARY"
              : [course.tag, boardLabel(course.board)]
                  .filter(Boolean)
                  .join(" · ")}
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
            {course.ratingCount > 0 ? (
              <span style={{ fontSize: 11, color: "var(--wf-body)" }}>
                ★ {course.ratingAvg.toFixed(1)}{" "}
                <span style={{ color: "var(--wf-mute)" }}>
                  ({fmtCount(course.ratingCount)})
                </span>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                Not yet rated
              </span>
            )}
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
