import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatPrice as fmtPrice } from "@/lib/currency";
import { MarketChrome } from "@/components/layouts/MarketChrome";
import {
  Annot,
  Avatar,
  Btn,
  Card,
  Eyebrow,
  Icon,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { auth } from "@/lib/auth";
import { MarketplaceHeroSearch } from "@/components/marketplace/MarketplaceHeroSearch";
import { PathEnrollButton } from "@/components/marketplace/PathEnrollButton";
import { FollowButton } from "@/components/marketplace/FollowButton";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { MarketplaceSort } from "@/components/marketplace/MarketplaceSort";
import { CourseCard } from "@/components/marketplace/CourseCard";
import { fmtCount } from "@/lib/format";
import {
  MARKETPLACE_GRADES,
  MARKETPLACE_PRICE_BUCKETS,
  MARKETPLACE_SUBJECTS,
  MARKETPLACE_TOPICS,
  findTopic,
  labelFor,
} from "@/lib/marketplace";
import { Suspense } from "react";


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
    board?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("Marketplace");
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
  const board = sp.board;
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
        ...(board ? { board } : {}),
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
  // then a plain grade label as fallback. The grade/subject labels are
  // catalog data (@/lib/marketplace) — localized with the block-type
  // labels, not here.
  const gradeLabel = labelFor(MARKETPLACE_GRADES, sp.grade) ?? "Grade 6";
  const subjectLabel = labelFor(MARKETPLACE_SUBJECTS, sp.subject);
  const priceLabel = labelFor(MARKETPLACE_PRICE_BUCKETS, sp.price);
  const featuredDetail =
    (activeTopic?.label ?? subjectLabel ?? "Math") +
    (priceLabel ? ` · ${priceLabel}` : "");
  const featuredHeader = t("featuredHeader", {
    grade: gradeLabel,
    detail: featuredDetail,
  });

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
          className="wf-hero-split"
          style={{
            padding: "20px 0 28px",
            borderBottom: "1px solid var(--wf-hairline)",
            marginBottom: 28,
          }}
        >
          <div>
            <Eyebrow>{t("heroEyebrow")}</Eyebrow>
            <h1
              className="wf-h1"
              style={{ fontSize: 42, margin: "8px 0 14px", maxWidth: 540 }}
            >
              {t.rich("heroTitle", {
                i: (c) => (
                  <span className="wf-serif" style={{ fontStyle: "italic" }}>
                    {c}
                  </span>
                ),
              })}
            </h1>

            <Suspense fallback={null}>
              <MarketplaceHeroSearch />
            </Suspense>

            <Annot ai>{t("heroAiNote")}</Annot>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {MARKETPLACE_TOPICS.map((topic) => {
                const isActive = activeTopic?.slug === topic.slug;
                return (
                  <Link
                    key={topic.slug}
                    // Clicking the active chip again clears the filter
                    // (toggle UX matches what users expect from chip groups).
                    href={isActive ? "/" : `/?topic=${topic.slug}`}
                    className={`wf-chip${isActive ? " wf-chip--accent" : ""}`}
                    style={{ textDecoration: "none" }}
                  >
                    {topic.label}
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
              <Eyebrow>
                {t("recommendedFor", { name: displayName ?? t("you") })}
              </Eyebrow>
              <Annot>
                {recommended.personalized ? t("forYou") : t("topRated")}
              </Annot>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                marginBottom: 14,
              }}
            >
              {/* Copy follows the resolver's `personalized` flag so we
                  never imply personalization that didn't happen. */}
              {recommended.personalized
                ? t("recPersonalized")
                : t("recTopRated")}
            </div>
            {recommended.items.map((p, i) => (
              <div
                key={p.title}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom:
                    i < recommended.items.length - 1
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
                {t("addToPath")}
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
          <Eyebrow style={{ marginRight: 8 }}>{t("filter")}</Eyebrow>
          <MarketplaceFilters />
          <div style={{ flex: 1 }} />
          <span
            className="wf-mono"
            style={{ fontSize: 11, color: "var(--wf-mute)" }}
          >
            {t("coursesCount", { count: featured.total.toLocaleString() })}
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
                {t("filterPrefix")}
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
            <Link
              href="/browse"
              style={{
                fontSize: 12,
                color: "var(--wf-accent)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t("seeAll", { count: featured.total })}
            </Link>
          </div>
          {featured.courses.length === 0 ? (
            <Card p={28} style={{ textAlign: "center" }}>
              <Eyebrow>{t("noCourses")}</Eyebrow>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: "var(--wf-body)",
                }}
              >
                {activeTopic ? (
                  t.rich("noCoursesTopic", {
                    topic: activeTopic.label,
                    b: (c) => <b>{c}</b>,
                    link: (c) => (
                      <Link
                        href="/"
                        style={{ color: "var(--wf-accent)", fontWeight: 600 }}
                      >
                        {c}
                      </Link>
                    ),
                  })
                ) : (
                  t("noCoursesGeneric")
                )}
              </div>
            </Card>
          ) : (
            <div className="wf-grid-cards-4">
              {featured.courses.map((c) => (
                <CourseCard
                  key={c.slug}
                  course={c}
                  owned={enrolledIds.has(c.id)}
                />
              ))}
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
                {t("pathsTitle")}
              </h2>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  marginTop: 4,
                }}
              >
                {t("pathsSubtitle")}
              </div>
            </div>
          </div>
          <div className="wf-grid-cards-3">
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
                    <Eyebrow>{t("curriculumPath")}</Eyebrow>
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
              {t("teachersTitle")}
            </h2>
          </div>
          <div className="wf-grid-cards-4">
            {teachers.map((teacher) => (
              <Card key={teacher.id} p={14} style={{ textAlign: "center" }}>
                <Link
                  href={`/t/${teacher.id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <Avatar
                    initials={teacher.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                    size={48}
                    style={{ margin: "0 auto 10px", fontSize: 16 }}
                  />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {teacher.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 2,
                    }}
                  >
                    {teacher.subjectsLabel} ·{" "}
                    {t("studentsCount", {
                      count: fmtCount(teacher.studentsCount),
                    })}
                  </div>
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--wf-mute)",
                      marginTop: 8,
                    }}
                  >
                    {t("courseCount", { count: teacher.courseCount })}
                  </div>
                </Link>
                <FollowButton teacherId={teacher.id} />
              </Card>
            ))}
          </div>
        </section>

        {/* For schools */}
        <Card
          p={28}
          className="wf-cta-split"
          style={{ background: "var(--wf-fillsoft)" }}
        >
          <div>
            <Eyebrow>{t("schoolsEyebrow")}</Eyebrow>
            <h2 className="wf-h2" style={{ fontSize: 22, margin: "6px 0" }}>
              {t("schoolsTitle")}
            </h2>
            <div
              style={{
                fontSize: 13,
                maxWidth: 560,
                color: "var(--wf-body)",
              }}
            >
              {t("schoolsBlurb")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost">{t("seePlans")}</Btn>
            <Link href="/signup" style={{ textDecoration: "none" }}>
              <Btn variant="primary">{t("talkToUs")}</Btn>
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
async function RoleHero({
  role,
  displayName,
}: {
  role: "TEACHER" | "ADMIN" | "PARENT";
  displayName: string | null;
}) {
  const t = await getTranslations("Marketplace");
  const config = {
    TEACHER: {
      eyebrow: t("roleTeacher"),
      lead: t("teacherLead"),
      blurb: t("teacherBlurb"),
      actions: [
        {
          label: t("teacherAction1"),
          href: "/teacher",
          variant: "primary" as const,
          ai: false,
        },
        {
          label: t("teacherAction2"),
          href: "/teacher/courses/new",
          variant: "ai" as const,
          ai: true,
        },
      ],
    },
    ADMIN: {
      eyebrow: t("roleAdmin"),
      lead: t("adminLead"),
      blurb: t("adminBlurb"),
      actions: [
        {
          label: t("adminAction1"),
          href: "/admin",
          variant: "primary" as const,
          ai: false,
        },
      ],
    },
    PARENT: {
      eyebrow: t("roleParent"),
      lead: t("parentLead"),
      blurb: t("parentBlurb"),
      actions: [
        {
          label: t("parentAction1"),
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
        {t.rich("welcomeBack", {
          name: displayName ? `, ${displayName}` : "",
          lead: config.lead,
          i: (c) => (
            <span className="wf-serif" style={{ fontStyle: "italic" }}>
              {c}
            </span>
          ),
        })}
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
        {t("orBrowse")}
      </div>
    </section>
  );
}
