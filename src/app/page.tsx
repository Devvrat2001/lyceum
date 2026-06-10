import Link from "next/link";
import { formatPrice as fmtPrice } from "@/lib/currency";
import { MarketChrome } from "@/components/layouts/MarketChrome";
import {
  Annot,
  Avatar,
  Btn,
  Card,
  Eyebrow,
  Icon,
  ImageBox,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { auth } from "@/lib/auth";
import { MarketplaceHeroSearch } from "@/components/marketplace/MarketplaceHeroSearch";
import { PathEnrollButton } from "@/components/marketplace/PathEnrollButton";
import { FollowButton } from "@/components/marketplace/FollowButton";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { MarketplaceSort } from "@/components/marketplace/MarketplaceSort";
import {
  MARKETPLACE_GRADES,
  MARKETPLACE_PRICE_BUCKETS,
  MARKETPLACE_SUBJECTS,
  MARKETPLACE_TOPICS,
  findTopic,
  labelFor,
} from "@/lib/marketplace";
import { Suspense } from "react";

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 1 : 1)}k`;
  return n.toString();
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{
    topic?: string;
    grade?: string;
    subject?: string;
    price?: string;
    length?: string;
    rating?: string;
    format?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeTopic = findTopic(sp.topic);
  // Filter defaults: when the user hasn't picked anything, fall back
  // to "Grade 6 · Math" so the page lands on a populated grid.
  const grade = sp.grade ?? "6";
  // Subject is overridden by an active topic on the server side, so
  // only pass it when no topic is set; defaulting to "math" matches
  // the prior page behaviour.
  const subject = sp.subject ?? (activeTopic ? undefined : "math");
  const price = sp.price;
  const length = sp.length;
  const rating = sp.rating;
  const format = sp.format;
  const sort = sp.sort;

  const trpc = await getServerCaller();
  const [featured, paths, teachers, recommended, enrolledIdList, session] =
    await Promise.all([
      trpc.marketplace.featured({
        ...(activeTopic ? { topic: activeTopic.slug } : {}),
        ...(subject ? { subject } : {}),
        grade,
        ...(price ? { price } : {}),
        ...(length ? { length } : {}),
        ...(rating ? { rating } : {}),
        ...(format ? { format } : {}),
        ...(sort ? { sort } : {}),
        limit: 4,
      }),
      trpc.marketplace.paths(),
      trpc.marketplace.teachers({ limit: 4 }),
      trpc.marketplace.recommendedFor(),
      trpc.course.myEnrolledIds(),
      auth(),
    ]);
  // O(1) lookups while rendering cards. Empty Set for anon visitors.
  const enrolledIds = new Set(enrolledIdList);

  // Viewer identity for the role-centric hero. Anonymous visitors and
  // students both fall through to the default course-discovery hero;
  // only TEACHER / ADMIN / PARENT get a dashboard-oriented variant.
  const role = session?.user?.role ?? null;
  const displayName = friendlyName(session?.user?.name ?? null);

  // Section header reflects the most specific dimension the user has
  // selected. Topic wins (it's the highest-level), then subject,
  // then a plain grade label as fallback.
  const gradeLabel = labelFor(MARKETPLACE_GRADES, sp.grade) ?? "Grade 6";
  const subjectLabel = labelFor(MARKETPLACE_SUBJECTS, sp.subject);
  const priceLabel = labelFor(MARKETPLACE_PRICE_BUCKETS, sp.price);
  const featuredHeader = `Top picks for ${gradeLabel} · ${
    activeTopic?.label ?? subjectLabel ?? "Math"
  }${priceLabel ? ` · ${priceLabel}` : ""}`;

  return (
    <MarketChrome role={role}>
      <div
        style={{
          padding: "24px 28px 40px",
          maxWidth: 1600,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Hero — role-centric: signed-in TEACHER / ADMIN / PARENT get
            a dashboard-oriented welcome; students and anonymous
            visitors fall through to the default discovery hero. */}
        {role === "TEACHER" || role === "ADMIN" || role === "PARENT" ? (
          <RoleHero role={role} displayName={displayName} />
        ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 24,
            padding: "20px 0 28px",
            borderBottom: "1px solid var(--wf-hairline)",
            marginBottom: 28,
          }}
        >
          <div>
            <Eyebrow>For Grade 6 · Personalized</Eyebrow>
            <h1
              className="wf-h1"
              style={{ fontSize: 42, margin: "8px 0 14px", maxWidth: 540 }}
            >
              What do you want to{" "}
              <span className="wf-serif" style={{ fontStyle: "italic" }}>
                learn
              </span>{" "}
              this week?
            </h1>

            <Suspense fallback={null}>
              <MarketplaceHeroSearch />
            </Suspense>

            <Annot ai>
              Conversational · returns curated learning path, not just course
              list
            </Annot>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {MARKETPLACE_TOPICS.map((t) => {
                const isActive = activeTopic?.slug === t.slug;
                return (
                  <Link
                    key={t.slug}
                    // Clicking the active chip again clears the filter
                    // (toggle UX matches what users expect from chip groups).
                    href={isActive ? "/" : `/?topic=${t.slug}`}
                    className={`wf-chip${isActive ? " wf-chip--accent" : ""}`}
                    style={{ textDecoration: "none" }}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <Card p={18}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Eyebrow>Recommended for {displayName ?? "you"}</Eyebrow>
              <Annot>Top-rated</Annot>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                marginBottom: 14,
              }}
            >
              {/* Used to read "Based on your last 5 quizzes, we picked
                  a 2-week mini-path" — implied personalization that
                  doesn't exist yet (the resolver returns top-rated
                  courses, not quiz-based recs). Honest copy until
                  adaptive recs ship. */}
              Highest-rated courses across the marketplace right now:
            </div>
            {recommended.map((p, i) => (
              <div
                key={p.title}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom:
                    i < recommended.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "1px solid var(--wf-ai)",
                    color: "var(--wf-ai)",
                    fontFamily: "var(--font-mono-stack)",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                    {p.meta}
                  </div>
                </div>
              </div>
            ))}
            <Link
              href="/student"
              style={{
                display: "block",
                marginTop: 12,
                textDecoration: "none",
              }}
            >
              <Btn
                variant="ai"
                full
                icon={<Icon name="sparkles" size={12} color="var(--wf-ai)" />}
              >
                Add to my path
              </Btn>
            </Link>
          </Card>
        </section>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 18,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Eyebrow style={{ marginRight: 8 }}>Filter</Eyebrow>
          <MarketplaceFilters />
          <div style={{ flex: 1 }} />
          <span
            className="wf-mono"
            style={{ fontSize: 11, color: "var(--wf-mute)" }}
          >
            {featured.total.toLocaleString()} courses
          </span>
          <MarketplaceSort />
        </div>

        {/* Featured */}
        <section style={{ marginBottom: 32 }}>
          {activeTopic && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span
                className="wf-mono"
                style={{
                  fontSize: 9,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.08em",
                }}
              >
                FILTER:
              </span>
              <Link
                href="/"
                className="wf-chip wf-chip--accent"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                aria-label={`Clear ${activeTopic.label} filter`}
              >
                {activeTopic.label}
                <span aria-hidden style={{ marginLeft: 2 }}>
                  ×
                </span>
              </Link>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
            }}
          >
            <h2 className="wf-h2" style={{ fontSize: 18 }}>
              {featuredHeader}
            </h2>
            <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>
              See all {featured.total} →
            </span>
          </div>
          {featured.courses.length === 0 ? (
            <Card p={28} style={{ textAlign: "center" }}>
              <Eyebrow>No courses found</Eyebrow>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: "var(--wf-body)",
                }}
              >
                {activeTopic ? (
                  <>
                    No published courses match{" "}
                    <b>{activeTopic.label}</b> yet.{" "}
                    <Link
                      href="/"
                      style={{ color: "var(--wf-accent)", fontWeight: 600 }}
                    >
                      Clear filter
                    </Link>{" "}
                    to see everything.
                  </>
                ) : (
                  "Try clearing the filters or seeding the database."
                )}
              </div>
            </Card>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
              }}
            >
              {featured.courses.map((c) => {
                const owned = enrolledIds.has(c.id);
                return (
                  <Link
                    key={c.slug}
                    href={`/course/${c.slug}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <Card p={0}>
                      <ImageBox h={130} kind="image" />
                      <div style={{ padding: 12 }}>
                        <div
                          className="wf-mono"
                          style={{
                            fontSize: 9,
                            // When the student already owns the course we
                            // surface that here, replacing the marketing
                            // tag (BESTSELLER / NEW / ...). It's the most
                            // useful signal to render at-a-glance.
                            color: owned
                              ? "var(--wf-good)"
                              : "var(--wf-accent)",
                            letterSpacing: "0.06em",
                            marginBottom: 4,
                          }}
                        >
                          {owned ? "✓ IN LIBRARY" : c.tag ?? ""}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 4,
                            lineHeight: 1.25,
                          }}
                        >
                          {c.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--wf-mute)",
                            marginBottom: 8,
                          }}
                        >
                          {c.authorLabel}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{ fontSize: 11, color: "var(--wf-body)" }}
                          >
                            ★ {c.ratingAvg.toFixed(1)}{" "}
                            <span style={{ color: "var(--wf-mute)" }}>
                              ({fmtCount(c.ratingCount)})
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
                                  c.priceCents === 0
                                    ? "var(--wf-good)"
                                    : "var(--wf-ink)",
                              }}
                            >
                              {fmtPrice(c.priceCents)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Multi-course paths */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
            }}
          >
            <div>
              <h2 className="wf-h2" style={{ fontSize: 18 }}>
                Multi-course paths
              </h2>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  marginTop: 4,
                }}
              >
                End-to-end curricula · save vs. buying separately
              </div>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {paths.map((p) => {
              const totalSlots = 12;
              const totalCourses = p.courses.length;
              // How many of the path's courses the viewer already
              // owns. Drives the enroll button's "N / M owned" hint
              // and the progress strip below — 0 for signed-out or
              // non-enrolled visitors.
              const ownedInPath = p.courses.filter((pc) =>
                enrolledIds.has(pc.course.id)
              ).length;
              // The strip fills to the viewer's owned share of the
              // path (0..totalSlots). Previously it filled by course
              // COUNT — viewer-independent — so every visitor, signed
              // out included, saw a partly-orange bar that reads as
              // course progress they don't have. It now renders only
              // when ownedInPath > 0 (see below).
              const filledSlots =
                totalCourses > 0
                  ? Math.round((ownedInPath / totalCourses) * totalSlots)
                  : 0;
              return (
                <Card key={p.id} p={16}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <Icon name="branch" size={14} color="var(--wf-accent)" />
                    <Eyebrow>Curriculum path</Eyebrow>
                    <span
                      className="wf-mono"
                      style={{
                        marginLeft: "auto",
                        fontSize: 9,
                        color: "var(--wf-good)",
                      }}
                    >
                      {p.saveLabel ?? ""}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginBottom: 12,
                    }}
                  >
                    {p.subtitle}
                  </div>
                  {ownedInPath > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        marginBottom: 12,
                      }}
                    >
                      {Array.from({ length: totalSlots }).map((_, j) => (
                        <div
                          key={j}
                          style={{
                            flex: 1,
                            height: 6,
                            background:
                              j < filledSlots
                                ? "var(--wf-accent)"
                                : "var(--wf-fill)",
                            borderRadius: 1,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700 }}>
                      {fmtPrice(p.priceCents)}
                    </span>
                    <PathEnrollButton
                      pathId={p.id}
                      pathSlug={p.slug}
                      priceCents={p.priceCents}
                      ownedCount={ownedInPath}
                      totalCount={p.courses.length}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Teachers */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
            }}
          >
            <h2 className="wf-h2" style={{ fontSize: 18 }}>
              Teachers to follow
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
            }}
          >
            {teachers.map((t) => (
              <Card key={t.id} p={14} style={{ textAlign: "center" }}>
                <Link
                  href={`/t/${t.id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <Avatar
                    initials={t.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                    size={48}
                    style={{ margin: "0 auto 10px", fontSize: 16 }}
                  />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 2,
                    }}
                  >
                    {t.subjectsLabel} · {fmtCount(t.studentsCount)} students
                  </div>
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--wf-mute)",
                      marginTop: 8,
                    }}
                  >
                    {t.courseCount}{" "}
                    {t.courseCount === 1 ? "course" : "courses"}
                  </div>
                </Link>
                <FollowButton teacherId={t.id} />
              </Card>
            ))}
          </div>
        </section>

        {/* For schools */}
        <Card
          p={28}
          style={{
            background: "var(--wf-fillsoft)",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div>
            <Eyebrow>For institutions</Eyebrow>
            <h2 className="wf-h2" style={{ fontSize: 22, margin: "6px 0" }}>
              Run Lyceum across your school
            </h2>
            <div
              style={{
                fontSize: 13,
                maxWidth: 560,
                color: "var(--wf-body)",
              }}
            >
              Manage rosters, build curricula across grades, see live cohort
              analytics, and integrate with your LMS / SIS. Bulk pricing,
              branding, and SSO included.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost">See plans</Btn>
            <Link href="/signup" style={{ textDecoration: "none" }}>
              <Btn variant="primary">Talk to us</Btn>
            </Link>
          </div>
        </Card>
      </div>
    </MarketChrome>
  );
}

/**
 * Greeting-friendly form of a user's name. Plain names collapse to the
 * first token ("Jordan Riley" → "Jordan"); a name that leads with an
 * honorific keeps the honorific + the next word ("Mr. Adeyemi" → "Mr.
 * Adeyemi"), since the bare first token would just be the title.
 */
function friendlyName(full: string | null | undefined): string | null {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const HONORIFICS = new Set([
    "mr",
    "mrs",
    "ms",
    "mx",
    "dr",
    "sr",
    "sra",
    "prof",
  ]);
  const head = parts[0].replace(/\.$/, "").toLowerCase();
  if (HONORIFICS.has(head) && parts.length > 1) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
}

/**
 * Role-specific homepage hero for signed-in TEACHER / ADMIN / PARENT
 * viewers. Students and anonymous visitors get the default
 * course-discovery hero rendered inline in MarketplacePage above.
 *
 * Every CTA points only at a route the role can open (see
 * src/proxy.ts) — so the hero can never trip a ForbiddenForRole
 * redirect the way the old one-size-fits-all "/student" / "/admin"
 * links did.
 */
function RoleHero({
  role,
  displayName,
}: {
  role: "TEACHER" | "ADMIN" | "PARENT";
  displayName: string | null;
}) {
  const config = {
    TEACHER: {
      eyebrow: "Teacher",
      lead: "your teaching workspace",
      blurb:
        "Jump back into your courses, see how students are doing, or spin up a new course with AI.",
      actions: [
        {
          label: "Go to your courses",
          href: "/teacher",
          variant: "primary" as const,
          ai: false,
        },
        {
          label: "Build a course with AI",
          href: "/teacher/courses/new",
          variant: "ai" as const,
          ai: true,
        },
      ],
    },
    ADMIN: {
      eyebrow: "Administrator",
      lead: "your institution console",
      blurb:
        "Manage people and curriculum, organize classes, and track cohort analytics across your school.",
      actions: [
        {
          label: "Open admin console",
          href: "/admin",
          variant: "primary" as const,
          ai: false,
        },
      ],
    },
    PARENT: {
      eyebrow: "Parent",
      lead: "your family dashboard",
      blurb:
        "See each kid's courses, streaks, and recent practice — all in one place.",
      actions: [
        {
          label: "See your kids' progress",
          href: "/parent",
          variant: "primary" as const,
          ai: false,
        },
      ],
    },
  }[role];

  return (
    <section
      style={{
        padding: "20px 0 28px",
        borderBottom: "1px solid var(--wf-hairline)",
        marginBottom: 28,
      }}
    >
      <Eyebrow>{config.eyebrow}</Eyebrow>
      <h1
        className="wf-h1"
        style={{ fontSize: 42, margin: "8px 0 14px", maxWidth: 620 }}
      >
        Welcome back{displayName ? `, ${displayName}` : ""} — here&apos;s{" "}
        <span className="wf-serif" style={{ fontStyle: "italic" }}>
          {config.lead}
        </span>
      </h1>
      <div
        style={{
          fontSize: 14,
          color: "var(--wf-body)",
          maxWidth: 560,
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        {config.blurb}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {config.actions.map((a) => (
          <Link key={a.href} href={a.href} style={{ textDecoration: "none" }}>
            <Btn
              variant={a.variant}
              icon={
                a.ai ? (
                  <Icon name="sparkles" size={14} color="var(--wf-ai)" />
                ) : undefined
              }
            >
              {a.label}
            </Btn>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--wf-mute)" }}>
        Or browse the full course marketplace below.
      </div>
    </section>
  );
}
