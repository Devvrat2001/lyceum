import Link from "next/link";
import { StudentChrome } from "@/components/layouts/StudentChrome";
import {
  Annot,
  Avatar,
  Card,
  Eyebrow,
  Icon,
  StreakChip,
  XPChip,
} from "@/components/wf/primitives";
import { getServerCaller } from "@/lib/trpc/server";
import { TodaysPlan } from "@/components/student/TodaysPlan";
import { TutorMiniCard } from "@/components/student/TutorMiniCard";
import { ContinueLearningCard } from "@/components/student/ContinueLearningCard";
import { NotificationBell } from "@/components/layouts/NotificationBell";

const BADGE_ICON_FOR_SLUG: Record<string, string> = {
  "hot-streak": "flame",
  "first-quiz-ace": "star",
  "five-books": "book",
};

export default async function StudentDashboard() {
  const trpc = await getServerCaller();
  const dashboard = await trpc.student.dashboard();

  if (!dashboard) {
    return (
      <StudentChrome active="home">
        <div style={{ padding: 32 }}>
          <Eyebrow>Heads up</Eyebrow>
          <h1 className="wf-h1" style={{ fontSize: 22, marginTop: 4 }}>
            Couldn&apos;t load your dashboard.
          </h1>
          <p style={{ fontSize: 13, color: "var(--wf-body)", maxWidth: 560 }}>
            Your session may have expired. Try signing out and back in.
          </p>
        </div>
      </StudentChrome>
    );
  }

  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <StudentChrome active="home">
      <header
        style={{
          height: 56,
          padding: "0 28px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        {/* Search lives in the StudentChrome sidebar/header (the real
            HeaderSearchCombobox) — this header used to render a dead
            look-alike search box here with no input behind it. */}
        <div style={{ flex: 1 }} />
        <StreakChip days={dashboard.stats.streak} />
        <XPChip value={dashboard.stats.xp} />
        <NotificationBell />
        <Avatar initials={dashboard.me.avatarInitials || "ME"} />
      </header>

      <div
        className="wf-two-col"
        style={{
          padding: "24px 28px 28px",
          overflow: "auto",
          alignContent: "start",
        }}
      >
        {/* LEFT */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            minWidth: 0,
          }}
        >
          <div>
            <Eyebrow>{dateLabel}</Eyebrow>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 14,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <h1 className="wf-h1" style={{ fontSize: 30 }}>
                Welcome back, {dashboard.me.firstName}.
              </h1>
            </div>
          </div>

          {/* Continue learning */}
          <section>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <h2 className="wf-h2" style={{ fontSize: 16 }}>
                Continue learning
              </h2>
            </div>
            {dashboard.continueLearning.length === 0 ? (
              <Card p={28} style={{ textAlign: "center" }}>
                <Eyebrow>Nothing in progress yet</Eyebrow>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: "var(--wf-body)",
                  }}
                >
                  Browse the marketplace to enroll in a course.
                </div>
              </Card>
            ) : (
              <div className="wf-grid-cards-3">
                {dashboard.continueLearning.map((c) => (
                  <ContinueLearningCard key={c.slug} c={c} />
                ))}
              </div>
            )}
          </section>

          {dashboard.todaysPlan.length === 0 ? (
            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <h2 className="wf-h2" style={{ fontSize: 16 }}>
                  Today&apos;s plan
                </h2>
                <Annot ai>AI-curated</Annot>
              </div>
              <Card p={20} style={{ textAlign: "center" }}>
                <Eyebrow>Nothing scheduled yet</Eyebrow>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: "var(--wf-body)",
                  }}
                >
                  Enroll in a course and your AI-curated plan will appear here.
                </div>
              </Card>
            </section>
          ) : (
            <TodaysPlan initialPlan={dashboard.todaysPlan} />
          )}

          {/* Skills + assignments */}
          <section className="wf-grid-cards-2">
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    margin: 0,
                    fontWeight: 600,
                  }}
                >
                  Skill mastery this week
                </h3>
              </div>
              {dashboard.skills.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--wf-mute)",
                    padding: "10px 0",
                    lineHeight: 1.5,
                  }}
                >
                  Complete a few lessons and your skill mastery will track
                  here per strand.
                </div>
              ) : (
                dashboard.skills.map((s) => (
                  <div key={s.name} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        marginBottom: 3,
                      }}
                    >
                      <span>{s.name}</span>
                      <span
                        className="wf-mono"
                        style={{ color: "var(--wf-mute)" }}
                      >
                        {s.v}%
                      </span>
                    </div>
                    <div
                      className={`wf-meter ${s.v < 50 ? "wf-meter--accent" : ""}`}
                    >
                      <i style={{ width: `${s.v}%` }} />
                    </div>
                  </div>
                ))
              )}
            </Card>
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    margin: 0,
                    fontWeight: 600,
                  }}
                >
                  Due this week
                </h3>
                <Annot>From teacher</Annot>
              </div>
              {dashboard.assignments.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--wf-mute)",
                    padding: "10px 0",
                    lineHeight: 1.5,
                  }}
                >
                  No assignments due. Teachers can post weekly work here.
                </div>
              ) : (
                dashboard.assignments.map((a, i) => (
                  <Link
                    key={`${a.t}-${i}`}
                    href={
                      a.lessonSlug ? `/student/lesson/${a.lessonSlug}` : "#"
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 0",
                      borderBottom:
                        i < dashboard.assignments.length - 1
                          ? "1px solid var(--wf-hairline)"
                          : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      className="wf-mono"
                      style={{
                        width: 36,
                        textAlign: "center",
                        fontSize: 10,
                        color: "var(--wf-mute)",
                      }}
                    >
                      {a.d}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {a.t}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: a.done
                            ? "var(--wf-good)"
                            : "var(--wf-mute)",
                          marginTop: 2,
                        }}
                      >
                        {a.done ? "Done ✓" : a.due} · +{a.xp} XP
                      </div>
                    </div>
                    <Icon
                      name={a.done ? "check" : "arrow"}
                      size={14}
                      color={a.done ? "var(--wf-good)" : "var(--wf-mute)"}
                    />
                  </Link>
                ))
              )}
            </Card>
          </section>
        </div>

        {/* RIGHT */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Streak card */}
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                Your week
              </h3>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
                const todayIdx = (today.getDay() + 6) % 7; // Mon=0..Sun=6
                // Real activity only (attempts / lesson completions in
                // the dashboard payload) — this used to fill every day
                // up to "today", fabricating a perfect week.
                const filled = dashboard.weekActivity[i] ?? false;
                return (
                  <div key={i} style={{ width: 30, textAlign: "center" }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        margin: "0 auto 4px",
                        borderRadius: "50%",
                        background: filled
                          ? "var(--wf-accent)"
                          : "var(--wf-fill)",
                        border:
                          i === todayIdx
                            ? "2px solid var(--wf-ink)"
                            : "1px solid var(--wf-hairline)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: filled ? "white" : "var(--wf-mute)",
                        fontSize: 10,
                      }}
                    >
                      {filled && <Icon name="flame" size={12} color="white" />}
                    </div>
                    <span
                      className="wf-mono"
                      style={{ fontSize: 9, color: "var(--wf-mute)" }}
                    >
                      {d}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                borderTop: "1px solid var(--wf-hairline)",
                paddingTop: 12,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  className="wf-serif"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--wf-accent)",
                  }}
                >
                  {dashboard.stats.streak}
                </div>
                <div
                  className="wf-mono"
                  style={{ fontSize: 10, color: "var(--wf-mute)" }}
                >
                  DAY STREAK
                </div>
              </div>
              <div>
                <div
                  className="wf-serif"
                  style={{ fontSize: 22, fontWeight: 700 }}
                >
                  {dashboard.stats.xp.toLocaleString()}
                </div>
                <div
                  className="wf-mono"
                  style={{ fontSize: 10, color: "var(--wf-mute)" }}
                >
                  TOTAL XP
                </div>
              </div>
              <div>
                <div
                  className="wf-serif"
                  style={{ fontSize: 22, fontWeight: 700 }}
                >
                  L{dashboard.stats.level}
                </div>
                <div
                  className="wf-mono"
                  style={{ fontSize: 10, color: "var(--wf-mute)" }}
                >
                  LEVEL
                </div>
              </div>
            </div>
          </Card>

          <TutorMiniCard />

          {/* Leaderboard */}
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                Class leaderboard
              </h3>
              <span
                className="wf-mono"
                style={{ fontSize: 9, color: "var(--wf-mute)" }}
              >
                THIS WEEK
              </span>
            </div>
            {dashboard.leaderboard.map((u, i) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom:
                    i < dashboard.leaderboard.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                  fontWeight: u.me ? 700 : 500,
                }}
              >
                <span
                  className="wf-mono"
                  style={{
                    width: 18,
                    fontSize: 11,
                    color: u.r <= 3 ? "var(--wf-accent)" : "var(--wf-mute)",
                  }}
                >
                  {u.r}
                </span>
                <Avatar
                  initials={u.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")
                    .slice(0, 2)}
                  size={22}
                />
                <span style={{ flex: 1, fontSize: 12 }}>{u.name}</span>
                <span
                  className="wf-mono"
                  style={{ fontSize: 11, color: "var(--wf-body)" }}
                >
                  {u.xp.toLocaleString()} XP
                </span>
              </div>
            ))}
          </Card>

          {/* Badges */}
          {dashboard.badges.length > 0 && (
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                  Recent badges
                </h3>
                <span style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                  {dashboard.badgeCounts.earned} of {dashboard.badgeCounts.total}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                }}
              >
                {dashboard.badges.slice(0, 3).map((b) => (
                  <div
                    key={b.slug}
                    style={{
                      textAlign: "center",
                      padding: "8px 4px",
                      border: "1px solid var(--wf-hairline)",
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        margin: "0 auto 6px",
                        borderRadius: "50%",
                        background: "var(--wf-accent-soft)",
                        border: "1px solid var(--wf-accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon
                        name={
                          (BADGE_ICON_FOR_SLUG[b.slug] ?? b.icon) as "flame"
                        }
                        size={16}
                        color="var(--wf-accent)"
                      />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 500 }}>
                      {b.name}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </StudentChrome>
  );
}
