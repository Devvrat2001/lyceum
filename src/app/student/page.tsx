import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
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

const BADGE_ICON_FOR_SLUG: Record<string, string> = {
  "hot-streak": "flame",
  "first-quiz-ace": "star",
  "five-books": "book",
};

export default async function StudentDashboard() {
  const trpc = await getServerCaller();
  // Locale + catalogs resolve alongside the data — the dashboard is the
  // i18n pilot surface (REQUIREMENTS R20), so every static string below
  // comes from messages/<locale>.json.
  const [dashboard, locale, t, tPlan] = await Promise.all([
    trpc.student.dashboard(),
    getLocale(),
    getTranslations("StudentDashboard"),
    getTranslations("TodaysPlan"),
  ]);

  if (!dashboard) {
    return (
      <StudentChrome active="home">
        <div className="p-8">
          <Eyebrow>{t("headsUp")}</Eyebrow>
          <h1 className="wf-h1 mt-1 text-[22px]">{t("loadFailedTitle")}</h1>
          <p className="max-w-[560px] text-[13px] text-body">
            {t("loadFailedBody")}
          </p>
        </div>
      </StudentChrome>
    );
  }

  const today = new Date();
  const dateLabel = today.toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const weekLetters = t.raw("weekLetters") as string[];

  return (
    <StudentChrome active="home">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline px-7">
        {/* Search lives in the StudentChrome sidebar/header (the real
            HeaderSearchCombobox) — this header used to render a dead
            look-alike search box here with no input behind it. */}
        <div className="flex-1" />
        {/* Language switcher lives in the shared sidebar menu now (R37),
            on every page — removed the dashboard-only duplicate. */}
        <StreakChip days={dashboard.stats.streak} />
        <XPChip value={dashboard.stats.xp} />
        {/* Notifications bell now lives in the StudentChrome sidebar
            (SidebarUserMenu), so it's on every page — removed the
            dashboard-only duplicate here (R36). */}
        <Avatar initials={dashboard.me.avatarInitials || "ME"} />
      </header>

      <div className="wf-two-col content-start overflow-auto px-7 pb-7 pt-6">
        {/* LEFT */}
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <Eyebrow>{dateLabel}</Eyebrow>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-3.5">
              <h1 className="wf-h1 text-[32px]">
                {t("welcome", { name: dashboard.me.firstName })}
              </h1>
            </div>
          </div>

          {/* Continue learning */}
          <section>
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="wf-h2 text-base">{t("continueLearning")}</h2>
            </div>
            {dashboard.continueLearning.length === 0 ? (
              <Card p={28} className="text-center">
                <Eyebrow>{t("nothingInProgress")}</Eyebrow>
                <div className="mt-1.5 text-[13px] text-body">
                  {t("browseToEnroll")}
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
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="wf-h2 text-base">{tPlan("title")}</h2>
                <Annot>{tPlan("planned")}</Annot>
              </div>
              <Card p={20} className="text-center">
                <Eyebrow>{t("nothingScheduled")}</Eyebrow>
                <div className="mt-1.5 text-[13px] text-body">
                  {t("enrollForPlan")}
                </div>
              </Card>
            </section>
          ) : (
            <TodaysPlan initialPlan={dashboard.todaysPlan} />
          )}

          {/* Skills + assignments */}
          <section className="wf-grid-cards-2">
            <Card className="st-card">
              <div className="mb-3 flex justify-between">
                <h3 className="m-0 text-sm font-semibold">
                  {t("skillMastery")}
                </h3>
              </div>
              {dashboard.skills.length === 0 ? (
                <div className="py-2.5 text-xs leading-normal text-mute">
                  {t("skillEmpty")}
                </div>
              ) : (
                dashboard.skills.map((s) => (
                  <div key={s.name} className="mb-2.5">
                    <div className="mb-[3px] flex justify-between text-[11px]">
                      <span>{s.name}</span>
                      <span className="font-mono text-mute">{s.v}%</span>
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
            <Card className="st-card">
              <div className="mb-3 flex justify-between">
                <h3 className="m-0 text-sm font-semibold">
                  {t("dueThisWeek")}
                </h3>
                <Annot>{t("fromTeacher")}</Annot>
              </div>
              {dashboard.assignments.length === 0 ? (
                <div className="py-2.5 text-xs leading-normal text-mute">
                  {t("assignmentsEmpty")}
                </div>
              ) : (
                dashboard.assignments.map((a, i) => (
                  <Link
                    key={`${a.t}-${i}`}
                    href={
                      a.lessonSlug ? `/student/lesson/${a.lessonSlug}` : "#"
                    }
                    className="flex items-center gap-2.5 border-b border-hairline py-2.5 text-inherit no-underline last:border-b-0"
                  >
                    <div className="w-9 text-center font-mono text-[10px] text-mute">
                      {a.d}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">{a.t}</div>
                      <div
                        className={`mt-0.5 text-[10px] ${
                          a.done ? "text-good" : "text-mute"
                        }`}
                      >
                        {a.done ? t("doneCheck") : a.due} · +{a.xp} XP
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
        <aside className="flex flex-col gap-4">
          {/* Streak card — the daily ritual (R19): big tactile circles,
              today pulses until the first activity lands. */}
          <Card className="st-card">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="m-0 text-sm font-semibold">{t("yourWeek")}</h3>
            </div>
            <div className="mb-3.5 flex justify-between">
              {weekLetters.map((d, i) => {
                const todayIdx = (today.getDay() + 6) % 7; // Mon=0..Sun=6
                // Real activity only (attempts / lesson completions in
                // the dashboard payload) — this used to fill every day
                // up to "today", fabricating a perfect week.
                const filled = dashboard.weekActivity[i] ?? false;
                return (
                  <div key={i} className="w-[38px] text-center">
                    <div
                      className={`mx-auto mb-1 flex h-[34px] w-[34px] items-center justify-center rounded-full text-[10px] ${
                        filled ? "bg-accent text-white" : "bg-fill text-mute"
                      } ${
                        i === todayIdx
                          ? "border-2 border-ink"
                          : "border border-hairline"
                      } ${i === todayIdx && !filled ? "st-pulse-today" : ""}`}
                    >
                      {filled && <Icon name="flame" size={16} color="white" />}
                    </div>
                    <span className="font-mono text-[9px] text-mute">{d}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between border-t border-hairline pt-3">
              <div>
                <div className="font-serif text-[28px] font-bold text-accent">
                  {dashboard.stats.streak}
                </div>
                <div className="font-mono text-[10px] text-mute">
                  {t("dayStreak")}
                </div>
              </div>
              <div>
                <div className="font-serif text-[22px] font-bold">
                  {dashboard.stats.xp.toLocaleString()}
                </div>
                <div className="font-mono text-[10px] text-mute">
                  {t("totalXp")}
                </div>
              </div>
              <div>
                <div className="font-serif text-[22px] font-bold">
                  L{dashboard.stats.level}
                </div>
                <div className="font-mono text-[10px] text-mute">
                  {t("level")}
                </div>
              </div>
            </div>
            {/* Level-progress ritual — honest math: levelInto/levelSpan
                come from the same 350-XP constant the router levels by. */}
            <div className="mt-3">
              <div className="mb-1 flex justify-between">
                <span className="font-mono text-[9px] text-mute">
                  L{dashboard.stats.level}
                </span>
                <span className="font-mono text-[9px] text-mute">
                  {t("xpToNext", {
                    xp: dashboard.stats.levelSpan - dashboard.stats.levelInto,
                    level: dashboard.stats.level + 1,
                  })}
                </span>
              </div>
              <div className="wf-meter wf-meter--accent">
                <i
                  style={{
                    width: `${Math.round(
                      (dashboard.stats.levelInto / dashboard.stats.levelSpan) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </Card>

          <TutorMiniCard />

          {/* Leaderboard */}
          <Card className="st-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 text-sm font-semibold">{t("leaderboard")}</h3>
              <span className="font-mono text-[9px] text-mute">
                {t("thisWeek")}
              </span>
            </div>
            {dashboard.leaderboard.map((u) => (
              <div
                key={u.id}
                className={`flex items-center gap-2.5 border-b border-hairline py-2 last:border-b-0 ${
                  u.me ? "font-bold" : "font-medium"
                }`}
              >
                <span
                  className={`w-[18px] font-mono text-[11px] ${
                    u.r <= 3 ? "text-accent" : "text-mute"
                  }`}
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
                <span className="flex-1 text-xs">{u.name}</span>
                <span className="font-mono text-[11px] text-body">
                  {u.xp.toLocaleString()} XP
                </span>
              </div>
            ))}
          </Card>

          {/* Badges */}
          {dashboard.badges.length > 0 && (
            <Card className="st-card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="m-0 text-sm font-semibold">
                  {t("recentBadges")}
                </h3>
                <span className="text-[11px] text-mute">
                  {t("badgeCount", {
                    earned: dashboard.badgeCounts.earned,
                    total: dashboard.badgeCounts.total,
                  })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {dashboard.badges.slice(0, 3).map((b) => (
                  <div
                    key={b.slug}
                    className="rounded border border-hairline px-1 py-2 text-center"
                  >
                    <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-accent bg-accent-soft">
                      <Icon
                        name={
                          (BADGE_ICON_FOR_SLUG[b.slug] ?? b.icon) as "flame"
                        }
                        size={16}
                        color="var(--wf-accent)"
                      />
                    </div>
                    <div className="text-[10px] font-medium">{b.name}</div>
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
