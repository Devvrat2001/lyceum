/**
 * Live / cohort schedule card (REQUIREMENTS R25). Rendered on the course
 * detail page when `format` is "live" or "cohort". Pure presentational —
 * the parent (a Server Component) formats the start time in a fixed,
 * unambiguous timezone (IST, the launch market) so there's no
 * non-deterministic Date formatting in a client render and no hydration
 * mismatch. The meeting link is revealed only to enrolled students;
 * everyone else sees an "enroll to get the link" nudge.
 */
import { Card, Eyebrow } from "@/components/wf/primitives";
import { getTranslations } from "next-intl/server";

export async function LiveScheduleCard({
  format,
  whenText,
  joinUrl,
  isEnrolled,
  recurrence,
  icsHref,
}: {
  format: string;
  /** Pre-formatted start (e.g. "Sat, 21 Jun, 2:00 pm IST"), or null. */
  whenText: string | null;
  joinUrl: string | null;
  isEnrolled: boolean;
  /** Recurrence slug ("weekly" | …) or null for a one-off. */
  recurrence: string | null;
  /** Download URL for the session .ics (only used when there's a start). */
  icsHref: string;
}) {
  if (format !== "live" && format !== "cohort") return null;

  const t = await getTranslations("LiveSchedule");
  const label = format === "live" ? t("liveClass") : t("cohort");
  const recurrenceLabel =
    recurrence && ["weekly", "biweekly", "monthly"].includes(recurrence)
      ? t(`recurrence.${recurrence}`)
      : null;

  return (
    <Card
      p={18}
      style={{
        marginBottom: 20,
        borderLeft: "3px solid var(--wf-accent)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Eyebrow style={{ marginBottom: 4 }}>
            {label} · {whenText ? t("scheduled") : t("schedule")}
          </Eyebrow>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {whenText ?? t("tba")}
            {recurrenceLabel && (
              <span
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  marginLeft: 8,
                  fontWeight: 400,
                }}
              >
                {recurrenceLabel}
              </span>
            )}
          </div>
          <div
            style={{ fontSize: 12, color: "var(--wf-mute)", marginTop: 2 }}
          >
            {format === "live" ? t("liveDesc") : t("cohortDesc")}
          </div>
          {whenText && (
            <a
              href={icsHref}
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 11,
                color: "var(--wf-accent)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t("addToCalendar")}
            </a>
          )}
        </div>
        {joinUrl ? (
          isEnrolled ? (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="wf-btn wf-btn--accent"
              style={{ textDecoration: "none" }}
            >
              {t("joinSession")}
            </a>
          ) : (
            <span
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-mute)" }}
            >
              {t("enrollForLink")}
            </span>
          )
        ) : null}
      </div>
    </Card>
  );
}
