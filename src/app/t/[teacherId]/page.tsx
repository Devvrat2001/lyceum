import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice as fmtPrice } from "@/lib/currency";
import { TRPCError } from "@trpc/server";
import { MarketChrome } from "@/components/layouts/MarketChrome";
import { Avatar, Card, Eyebrow } from "@/components/wf/primitives";
import { FollowButton } from "@/components/marketplace/FollowButton";
import { getServerCaller } from "@/lib/trpc/server";
import { auth } from "@/lib/auth";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((x) => x[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Public teacher storefront — `/t/[teacherId]`. A teacher's profile
 * (headline, bio, follower count) plus their published course catalog.
 * Anonymous-visible; rendered inside the public MarketChrome.
 */
export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const trpc = await getServerCaller();

  let profile;
  try {
    profile = await trpc.marketplace.teacherProfile({ teacherId });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const session = await auth();

  return (
    <MarketChrome role={session?.user?.role ?? null}>
      <div
        style={{
          padding: "24px 28px 48px",
          maxWidth: 1100,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{ fontSize: 11, color: "var(--wf-mute)", marginBottom: 16 }}
        >
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            Browse
          </Link>{" "}
          · Teachers ·{" "}
          <span style={{ color: "var(--wf-ink)" }}>{profile.name}</span>
        </div>

        <Card p={24} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
            <Avatar
              initials={initialsOf(profile.name)}
              size={64}
              style={{ fontSize: 22, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="wf-h1" style={{ fontSize: 26, marginBottom: 4 }}>
                {profile.name}
              </h1>
              {profile.headline && (
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--wf-body)",
                    marginBottom: 8,
                  }}
                >
                  {profile.headline}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 12,
                  color: "var(--wf-mute)",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {profile.courses.length} course
                  {profile.courses.length === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  {profile.studentsCount.toLocaleString("en-US")} students
                </span>
                <span>·</span>
                <span>
                  {profile.followerCount.toLocaleString("en-US")} follower
                  {profile.followerCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <FollowButton teacherId={profile.id} />
          </div>
          {profile.bio && (
            <p
              style={{
                fontSize: 13,
                color: "var(--wf-body)",
                lineHeight: 1.6,
                margin: "16px 0 0",
                whiteSpace: "pre-wrap",
              }}
            >
              {profile.bio}
            </p>
          )}
        </Card>

        <Eyebrow style={{ marginBottom: 10 }}>
          Courses by {profile.name}
        </Eyebrow>
        {profile.courses.length === 0 ? (
          <Card
            p={28}
            style={{
              textAlign: "center",
              fontSize: 13,
              color: "var(--wf-mute)",
            }}
          >
            No published courses yet.
          </Card>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {profile.courses.map((c) => (
              <Link
                key={c.id}
                href={`/course/${c.slug}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card p={16} style={{ height: "100%" }}>
                  <div
                    className="wf-mono"
                    style={{
                      fontSize: 9,
                      color: "var(--wf-mute)",
                      letterSpacing: "0.06em",
                      marginBottom: 6,
                    }}
                  >
                    {c.subject.toUpperCase()} · GRADE {c.grade}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {c.title}
                  </div>
                  {c.tagline && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--wf-mute)",
                        lineHeight: 1.45,
                      }}
                    >
                      {c.tagline}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 10,
                    }}
                  >
                    {c.ratingCount > 0 && (
                      <span>
                        ★ {c.ratingAvg.toFixed(1)} ({c.ratingCount})
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontWeight: 600,
                        color: "var(--wf-ink)",
                      }}
                    >
                      {fmtPrice(c.priceCents)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MarketChrome>
  );
}
