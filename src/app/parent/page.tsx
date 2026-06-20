import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar, Card, Eyebrow, Icon, Meter } from "@/components/wf/primitives";
import { ParentHeader } from "@/components/layouts/ParentHeader";
import { LinkChildForm } from "@/components/parent/LinkChildForm";

type TFn = (key: string, values?: Record<string, string | number>) => string;

/**
 * Parent dashboard (Tier 2.3, second commit). Shows each linked
 * student's enrollments, XP total, current streak, and recent
 * activity in a per-child card.
 *
 * No chrome yet (no ParentChrome sidebar) — single page, minimal
 * header bar. When parents start needing multi-kid navigation we'll
 * add a proper chrome with a per-kid sidebar.
 *
 * Reads directly via Prisma (server component) — same pattern as
 * the student dashboard. No tRPC route because no client component
 * consumes this data; if a future widget needs it, extract.
 */
export default async function ParentDashboardPage() {
  const session = await auth();
  const me = session!.user;
  const t = await getTranslations("ParentDashboard");
  const locale = await getLocale();

  const links = await db.parentChild.findMany({
    where: { parentId: me.id },
    orderBy: { createdAt: "asc" },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          firstName: true,
          email: true,
          avatarUrl: true,
          streak: { select: { current: true, longest: true } },
          enrollments: {
            orderBy: [
              { lastActivityAt: "desc" },
              { enrolledAt: "desc" },
            ],
            select: {
              id: true,
              progressPct: true,
              completed: true,
              lastActivityAt: true,
              course: {
                select: { slug: true, title: true, subject: true, grade: true },
              },
            },
          },
          attempts: {
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              correct: true,
              createdAt: true,
              lesson: { select: { slug: true, title: true } },
            },
          },
        },
      },
    },
  });

  // Total XP per child via a single grouped aggregate (R35) — the old
  // version loaded EVERY XPEvent row for every child just to sum points.
  const childIds = links.map((l) => l.child.id);
  const xpByChild = new Map<string, number>();
  if (childIds.length > 0) {
    const sums = await db.xPEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: childIds } },
      _sum: { points: true },
    });
    for (const s of sums) xpByChild.set(s.userId, s._sum.points ?? 0);
  }

  const children = links.map((l) => {
    const c = l.child;
    const totalXp = xpByChild.get(c.id) ?? 0;
    const inProgress = c.enrollments.filter((e) => !e.completed);
    const completed = c.enrollments.filter((e) => e.completed);
    const lastActivity =
      c.attempts[0]?.createdAt ??
      c.enrollments[0]?.lastActivityAt ??
      null;
    return {
      id: c.id,
      name: c.firstName ?? c.name ?? "Student",
      email: c.email,
      avatarUrl: c.avatarUrl,
      totalXp,
      inProgress,
      completedCount: completed.length,
      streakCurrent: c.streak?.current ?? 0,
      streakLongest: c.streak?.longest ?? 0,
      recentAttempts: c.attempts,
      lastActivity,
    };
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--wf-canvas, white)",
      }}
    >
      {/* Minimal header. Parent chrome (per-kid sidebar) lands when
          multi-kid navigation needs it; ParentHeader is a client
          component so it can adapt to phone widths. */}
      <ParentHeader email={me.email} />

      <div
        style={{
          flex: 1,
          padding: "24px 28px 40px",
          maxWidth: 1200,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1
          className="wf-h1"
          style={{ fontSize: 28, margin: "6px 0 18px" }}
        >
          {children.length === 0
            ? t("h1None")
            : children.length === 1
              ? t("h1One", { name: children[0].name })
              : t("h1Many", { count: children.length })}
        </h1>

        {children.length === 0 ? (
          <Card
            p={28}
            style={{
              maxWidth: 560,
              margin: "20px auto",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <Icon
                name="user"
                size={28}
                color="var(--wf-mute)"
                style={{ marginBottom: 10 }}
              />
              <h2
                className="wf-h2"
                style={{ fontSize: 20, marginBottom: 8 }}
              >
                {t("linkFirstTitle")}
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--wf-body)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {t("linkFirstBlurb")}
              </p>
            </div>
            <LinkChildForm />
          </Card>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                // min(420px, 100%) floors each column at the container width on
                // phones, so a single card can't force horizontal scrolling.
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(min(420px, 100%), 1fr))",
                gap: 16,
              }}
            >
              {children.map((c) => (
                <ChildCard key={c.id} child={c} t={t} locale={locale} />
              ))}
            </div>
            <Card p={18} style={{ marginTop: 18, maxWidth: 480 }}>
              <LinkChildForm />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function ChildCard({
  child,
  t,
  locale,
}: {
  t: TFn;
  locale: string;
  child: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    totalXp: number;
    inProgress: Array<{
      id: string;
      progressPct: number;
      lastActivityAt: Date | null;
      course: { slug: string; title: string; subject: string; grade: string };
    }>;
    completedCount: number;
    streakCurrent: number;
    streakLongest: number;
    recentAttempts: Array<{
      id: string;
      correct: boolean;
      createdAt: Date;
      lesson: { slug: string | null; title: string } | null;
    }>;
    lastActivity: Date | null;
  };
}) {
  return (
    <Card p={18}>
      {/* Header: avatar + name + email + last-activity */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Avatar
          initials={initialsOf(child.name)}
          size={40}
          style={{ fontSize: 14 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{child.name}</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--wf-mute)",
              marginTop: 2,
            }}
          >
            {child.email}
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--wf-mute)",
            textAlign: "right",
          }}
        >
          {child.lastActivity
            ? t("activeAgo", {
                time: relativeTime(child.lastActivity, t, locale),
              })
            : t("noActivity")}
        </div>
      </div>

      {/* KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Kpi label={t("kpiXp")} value={child.totalXp.toLocaleString(locale)} />
        <Kpi
          label={t("kpiStreak")}
          value={t("streakDays", { count: child.streakCurrent })}
          sub={
            child.streakLongest > child.streakCurrent
              ? t("streakBest", { count: child.streakLongest })
              : undefined
          }
        />
        <Kpi
          label={t("kpiInProgress")}
          value={child.inProgress.length.toString()}
        />
        <Kpi
          label={t("kpiCompleted")}
          value={child.completedCount.toString()}
        />
      </div>

      {/* Course list */}
      {child.inProgress.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Eyebrow style={{ marginBottom: 8 }}>{t("currentCourses")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {child.inProgress.slice(0, 3).map((e) => (
              <div key={e.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{e.course.title}</span>
                  <span
                    className="wf-mono"
                    style={{ color: "var(--wf-mute)" }}
                  >
                    {e.progressPct}%
                  </span>
                </div>
                <Meter value={e.progressPct} variant="accent" />
              </div>
            ))}
            {child.inProgress.length > 3 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--wf-mute)",
                  textAlign: "right",
                }}
              >
                {t("moreCount", { count: child.inProgress.length - 3 })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent attempts */}
      {child.recentAttempts.length > 0 && (
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>{t("recentPractice")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {child.recentAttempts.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--wf-body)",
                }}
              >
                <span
                  style={{
                    color: a.correct
                      ? "var(--wf-good)"
                      : "var(--wf-accent)",
                    fontWeight: 700,
                    width: 12,
                  }}
                >
                  {a.correct ? "✓" : "✗"}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {a.lesson?.title ?? t("deletedLesson")}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--wf-mute)",
                    flexShrink: 0,
                  }}
                >
                  {relativeTime(a.createdAt, t, locale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--wf-fillsoft)",
        border: "1px solid var(--wf-hairline)",
        borderRadius: 3,
      }}
    >
      <div
        className="wf-mono"
        style={{
          fontSize: 9,
          color: "var(--wf-mute)",
          letterSpacing: "0.06em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div className="wf-serif" style={{ fontSize: 18, fontWeight: 700 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Coarse relative-time — minutes / hours / days, then explicit date. */
function relativeTime(d: Date | string, t: TFn, locale: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1_000);
  if (sec < 45) return t("justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("minutesAgo", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("hoursAgo", { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t("daysAgo", { count: day });
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}
