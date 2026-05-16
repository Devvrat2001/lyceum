import Link from "next/link";
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
import { MarketplaceHeroSearch } from "@/components/marketplace/MarketplaceHeroSearch";
import { PathEnrollButton } from "@/components/marketplace/PathEnrollButton";
import { FollowButton } from "@/components/marketplace/FollowButton";
import { Suspense } from "react";

const TOPICS = [
  "STEM",
  "Reading",
  "Coding for kids",
  "Science fair",
  "Test prep",
  "Spanish",
  "Art",
  "Music",
];

const FILTER_LABELS = [
  "Grade 6 ▾",
  "Subject ▾",
  "Format ▾",
  "Price ▾",
  "Length ▾",
  "Rating ▾",
];

function fmtPrice(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}`;
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 1 : 1)}k`;
  return n.toString();
}

export default async function MarketplacePage() {
  const trpc = await getServerCaller();
  const [featured, paths, teachers, recommended] = await Promise.all([
    trpc.marketplace.featured({ subject: "math", grade: "6", limit: 4 }),
    trpc.marketplace.paths(),
    trpc.marketplace.teachers({ limit: 4 }),
    trpc.marketplace.recommendedFor(),
  ]);

  return (
    <MarketChrome>
      <div
        style={{
          padding: "24px 28px 40px",
          maxWidth: 1600,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Hero */}
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
              {TOPICS.map((t) => (
                <Link
                  key={t}
                  href={`/?topic=${encodeURIComponent(t.toLowerCase())}`}
                  className="wf-chip"
                  style={{ textDecoration: "none" }}
                >
                  {t}
                </Link>
              ))}
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
              <Eyebrow>Recommended for Jordan</Eyebrow>
              <Annot ai>Adaptive recs</Annot>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                marginBottom: 14,
              }}
            >
              Based on your last 5 quizzes, we picked a 2-week mini-path:
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
          {FILTER_LABELS.map((f) => (
            <span key={f} className="wf-chip">
              {f}
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <span
            className="wf-mono"
            style={{ fontSize: 11, color: "var(--wf-mute)" }}
          >
            {featured.total.toLocaleString()} courses · sort · POPULAR ▾
          </span>
        </div>

        {/* Featured */}
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
              Top picks for Grade 6 · Math
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
                Try clearing the filters or seeding the database.
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
              {featured.courses.map((c) => (
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
                          color: "var(--wf-accent)",
                          letterSpacing: "0.06em",
                          marginBottom: 4,
                        }}
                      >
                        {c.tag ?? ""}
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
                      </div>
                    </div>
                  </Card>
                </Link>
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
            <Annot>Bundle = monetization driver</Annot>
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
              const filledSlots = Math.min(totalSlots, p.courses.length || 4);
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
                    <PathEnrollButton pathId={p.id} pathSlug={p.slug} />
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
            <Annot>Creator economy · revenue share</Annot>
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
                <Avatar
                  initials={t.name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)}
                  size={48}
                  style={{ margin: "0 auto 10px", fontSize: 16 }}
                />
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
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
                  {t.courseCount} {t.courseCount === 1 ? "course" : "courses"}
                </div>
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
            <Link href="/admin" style={{ textDecoration: "none" }}>
              <Btn variant="primary">Talk to us</Btn>
            </Link>
          </div>
        </Card>
      </div>
    </MarketChrome>
  );
}
