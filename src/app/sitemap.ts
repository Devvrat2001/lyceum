import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Dynamic sitemap (REQUIREMENTS R32). Lists the public, crawlable
 * surfaces — static marketing/catalog pages plus every PUBLISHED course
 * and every teacher storefront — so the marketplace is discoverable.
 * Authenticated app routes (/student, /teacher, /admin, /parent) are
 * deliberately excluded; they're behind auth and carry no SEO value.
 *
 * Next revalidates this route per the segment default; the DB queries
 * select only what the sitemap needs (slug/handle + updatedAt) so it
 * stays cheap even as the catalog grows.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/signup`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Best-effort: a DB hiccup must not 500 the sitemap (crawlers then
  // drop the whole site). Fall back to the static entries.
  try {
    const [courses, teachers] = await Promise.all([
      db.course.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      db.user.findMany({
        where: {
          role: "TEACHER",
          hiddenFromMarketplace: false,
          authoredCourses: { some: { status: "PUBLISHED" } },
        },
        select: { id: true, updatedAt: true },
        take: 5000,
      }),
    ]);

    const courseEntries: MetadataRoute.Sitemap = courses.map((c) => ({
      url: `${base}/course/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    const teacherEntries: MetadataRoute.Sitemap = teachers.map((t) => ({
      url: `${base}/t/${t.id}`,
      lastModified: t.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    return [...staticEntries, ...courseEntries, ...teacherEntries];
  } catch (err) {
    console.error("[sitemap] DB query failed, serving static only", err);
    return staticEntries;
  }
}
