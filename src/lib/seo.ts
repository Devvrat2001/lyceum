import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Per-course SEO metadata (R32). Extracted from the course page so it
 * can be unit-tested without pulling the page's server-only graph
 * (auth / tRPC server caller) into the test runner (R40).
 *
 * A direct, minimal DB read — Next dedupes RSC data within a request,
 * but a tRPC caller isn't auto-deduped, so a lean query here is cheaper
 * than re-running `course.bySlug`. Returns empty metadata (so the page
 * falls back to the root defaults, and no canonical leaks) when the
 * course doesn't exist or isn't published.
 */
export async function courseCanonicalMetadata(
  slug: string
): Promise<Metadata> {
  const course = await db.course.findUnique({
    where: { slug },
    select: {
      title: true,
      tagline: true,
      description: true,
      thumbnailUrl: true,
      subject: true,
      grade: true,
      status: true,
    },
  });
  if (!course || course.status !== "PUBLISHED") return {};
  const desc = (course.tagline ?? course.description).slice(0, 200);
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/course/${slug}`;
  return {
    title: course.title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: course.title,
      description: desc,
      ...(course.thumbnailUrl ? { images: [course.thumbnailUrl] } : {}),
    },
  };
}
