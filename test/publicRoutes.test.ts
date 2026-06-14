/**
 * Public-route integration coverage (REQUIREMENTS R40) for the SEO +
 * calendar surfaces shipped in R32/R34. These are request-level checks:
 * the sitemap/robots metadata routes and the .ics handler + course
 * `generateMetadata` are imported and invoked directly against the real
 * dev Postgres, so the draft-exclusion and status gates are exercised
 * end-to-end rather than asserted on the query in isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { GET as calendarGET } from "@/app/api/course/[slug]/calendar/route";
import { courseCanonicalMetadata } from "@/lib/seo";
import { cleanupTestUsers, createTestUser } from "./helpers";

const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");

let publishedSlug: string;
let draftSlug: string;
let liveSlug: string;

beforeAll(async () => {
  await cleanupTestUsers();
  const teacher = await createTestUser({ role: "TEACHER" });
  publishedSlug = `test-vitest-pub-${crypto.randomUUID()}`;
  draftSlug = `test-vitest-draft-${crypto.randomUUID()}`;
  liveSlug = `test-vitest-live-${crypto.randomUUID()}`;

  await db.course.create({
    data: {
      slug: publishedSlug,
      title: "Published Course",
      tagline: "A crawlable, indexable course.",
      description: "Long description.",
      subject: "math",
      grade: "6",
      authorId: teacher.id,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
  // A draft that *also* carries a session — proves both the sitemap
  // draft-exclusion and the .ics PUBLISHED gate independently.
  await db.course.create({
    data: {
      slug: draftSlug,
      title: "Draft Course",
      description: "Not yet public.",
      subject: "math",
      grade: "6",
      authorId: teacher.id,
      priceCents: 0,
      status: "DRAFT",
      format: "live",
      sessionStartsAt: new Date("2026-07-02T15:00:00.000Z"),
    },
  });
  await db.course.create({
    data: {
      slug: liveSlug,
      title: "Live Cohort",
      description: "A scheduled cohort.",
      subject: "math",
      grade: "6",
      authorId: teacher.id,
      priceCents: 0,
      status: "PUBLISHED",
      format: "live",
      sessionStartsAt: new Date("2026-07-01T15:00:00.000Z"),
      sessionJoinUrl: "https://meet.example.test/live",
      sessionRecurrence: "weekly",
    },
  });
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("sitemap (R40)", () => {
  it("includes published courses, excludes drafts, and leaks no app routes", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${base}/course/${publishedSlug}`);
    expect(urls).toContain(`${base}/course/${liveSlug}`);
    expect(urls).not.toContain(`${base}/course/${draftSlug}`);
    // Static marketing entries are present.
    expect(urls).toContain(`${base}/`);
    expect(urls).toContain(`${base}/browse`);
    // Authenticated app surfaces never appear.
    for (const u of urls) {
      for (const seg of ["student", "teacher", "admin", "parent"]) {
        expect(u.startsWith(`${base}/${seg}/`)).toBe(false);
      }
    }
  });
});

describe("robots (R40)", () => {
  it("disallows the api + app surfaces and points at the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.allow).toBe("/");
    const disallow = rule?.disallow as string[];
    for (const p of ["/api/", "/student/", "/teacher/", "/admin/", "/parent/"]) {
      expect(disallow).toContain(p);
    }
    expect(r.sitemap).toBe(`${base}/sitemap.xml`);
  });
});

describe(".ics calendar route (R40)", () => {
  function icsReq(slug: string) {
    return calendarGET(
      new Request(`${base}/api/course/${slug}/calendar`),
      { params: Promise.resolve({ slug }) }
    );
  }

  it("404s for an unknown slug", async () => {
    const res = await icsReq(`test-vitest-missing-${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it("404s for a published course with no scheduled session", async () => {
    const res = await icsReq(publishedSlug);
    expect(res.status).toBe(404);
  });

  it("404s for a draft course even when it has a session (status gate)", async () => {
    const res = await icsReq(draftSlug);
    expect(res.status).toBe(404);
  });

  it("serves a valid recurring VEVENT for a live course", async () => {
    const res = await icsReq(liveSlug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain(
      `${liveSlug}-session.ics`
    );
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("DTSTART:20260701T150000Z");
    expect(body).toContain("RRULE:FREQ=WEEKLY");
    expect(body).toContain("LOCATION:https://meet.example.test/live");
  });
});

describe("course canonical metadata (R40)", () => {
  it("sets the canonical URL + OpenGraph for a published course", async () => {
    const meta = await courseCanonicalMetadata(publishedSlug);
    const canonical = `${base}/course/${publishedSlug}`;
    expect(meta.alternates?.canonical).toBe(canonical);
    expect(meta.title).toBe("Published Course");
    expect(meta.openGraph?.url).toBe(canonical);
  });

  it("returns empty metadata for drafts and unknown slugs (no canonical leak)", async () => {
    expect(await courseCanonicalMetadata(draftSlug)).toEqual({});
    expect(
      await courseCanonicalMetadata(`test-vitest-missing-${crypto.randomUUID()}`)
    ).toEqual({});
  });
});
