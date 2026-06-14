/**
 * iCalendar (.ics) generation for live/cohort course sessions
 * (REQUIREMENTS R34). Pure string building — no deps — so it can run in
 * a route handler. Produces one VEVENT, with an RRULE when the session
 * recurs. Each session defaults to a 1-hour block (no end time is
 * modelled yet).
 */

/** Map our recurrence slug to an RFC-5545 RRULE, or null for one-off. */
function rruleFor(recurrence: string | null | undefined): string | null {
  switch (recurrence) {
    case "weekly":
      return "FREQ=WEEKLY";
    case "biweekly":
      return "FREQ=WEEKLY;INTERVAL=2";
    case "monthly":
      return "FREQ=MONTHLY";
    default:
      return null;
  }
}

/** Format a Date as an iCal UTC timestamp: YYYYMMDDTHHMMSSZ. */
function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape a value for an iCal text field (RFC 5545 §3.3.11). */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildCourseIcs(args: {
  courseId: string;
  title: string;
  startsAt: Date;
  /** Minutes; defaults to 60. */
  durationMin?: number;
  joinUrl?: string | null;
  recurrence?: string | null;
  courseUrl: string;
}): string {
  const end = new Date(
    args.startsAt.getTime() + (args.durationMin ?? 60) * 60_000
  );
  const rrule = rruleFor(args.recurrence);
  const desc = args.joinUrl
    ? `Join: ${args.joinUrl}\\nCourse: ${args.courseUrl}`
    : `Course: ${args.courseUrl}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lyceum//Course Session//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${args.courseId}@lyceum`,
    `DTSTAMP:${icalDate(new Date())}`,
    `DTSTART:${icalDate(args.startsAt)}`,
    `DTEND:${icalDate(end)}`,
    `SUMMARY:${esc(args.title)}`,
    `DESCRIPTION:${esc(desc)}`,
    ...(args.joinUrl ? [`LOCATION:${esc(args.joinUrl)}`] : []),
    `URL:${esc(args.courseUrl)}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // iCal requires CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}
