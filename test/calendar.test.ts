/**
 * Course-session .ics generation (REQUIREMENTS R34). Pure builder — no
 * DB — so these are fast unit checks on the iCalendar output: UTC
 * DTSTART, an RRULE only when recurring, escaping, and CRLF endings.
 */
import { describe, expect, it } from "vitest";
import { buildCourseIcs } from "@/lib/calendar";

describe("buildCourseIcs", () => {
  const base = {
    courseId: "course_123",
    title: "Olympiad Cohort",
    startsAt: new Date("2026-06-21T14:00:00.000Z"),
    courseUrl: "https://lyceum.app/course/olympiad",
  };

  it("emits a valid one-off VEVENT with UTC times and CRLF endings", () => {
    const ics = buildCourseIcs(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260621T140000Z");
    // Default 1-hour block.
    expect(ics).toContain("DTEND:20260621T150000Z");
    expect(ics).toContain("SUMMARY:Olympiad Cohort");
    expect(ics).toContain("UID:course_123@lyceum");
    expect(ics).not.toContain("RRULE");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\n").every((l) => l === "" || l.endsWith("\r"))).toBe(
      true
    );
  });

  it("adds the right RRULE per recurrence", () => {
    expect(buildCourseIcs({ ...base, recurrence: "weekly" })).toContain(
      "RRULE:FREQ=WEEKLY"
    );
    expect(buildCourseIcs({ ...base, recurrence: "biweekly" })).toContain(
      "RRULE:FREQ=WEEKLY;INTERVAL=2"
    );
    expect(buildCourseIcs({ ...base, recurrence: "monthly" })).toContain(
      "RRULE:FREQ=MONTHLY"
    );
    // Unknown recurrence is treated as one-off.
    expect(buildCourseIcs({ ...base, recurrence: "yearly" })).not.toContain(
      "RRULE"
    );
  });

  it("includes the join link as LOCATION and escapes commas/semicolons", () => {
    const ics = buildCourseIcs({
      ...base,
      title: "Math; Science, & More",
      joinUrl: "https://meet.example/abc",
    });
    expect(ics).toContain("LOCATION:https://meet.example/abc");
    expect(ics).toContain("SUMMARY:Math\\; Science\\, & More");
  });
});
