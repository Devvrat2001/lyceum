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

const RECURRENCE_LABEL: Record<string, string> = {
  weekly: "Repeats weekly",
  biweekly: "Repeats every 2 weeks",
  monthly: "Repeats monthly",
};

export function LiveScheduleCard({
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

  const label = format === "live" ? "Live class" : "Cohort";
  const recurrenceLabel = recurrence
    ? (RECURRENCE_LABEL[recurrence] ?? null)
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
            {label} · {whenText ? "Scheduled" : "Schedule"}
          </Eyebrow>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {whenText ?? "Schedule to be announced"}
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
            {format === "live"
              ? "Taught live — join at the scheduled time."
              : "A guided cohort that moves together from this start date."}
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
              + Add to calendar
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
              Join session →
            </a>
          ) : (
            <span
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-mute)" }}
            >
              ENROLL TO GET THE LINK
            </span>
          )
        ) : null}
      </div>
    </Card>
  );
}
