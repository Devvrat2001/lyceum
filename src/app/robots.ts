import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * robots.txt (REQUIREMENTS R32). Allow crawling of the public catalog,
 * disallow the authenticated app + API surfaces (no SEO value, and we
 * don't want crawlers hammering tRPC), and point at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/student/",
        "/teacher/",
        "/admin/",
        "/parent/",
        "/settings",
        "/checkout/",
        "/demo-checkout/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
