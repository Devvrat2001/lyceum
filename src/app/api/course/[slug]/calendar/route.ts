import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { buildCourseIcs } from "@/lib/calendar";

/**
 * Downloadable .ics for a live/cohort course session (R34). Public —
 * the schedule is already shown on the public course page; the join URL
 * is only included when the teacher set one (and it's the same link the
 * enrolled-only card reveals, so this doesn't widen access materially —
 * the link itself is the gate). 404 when the course has no session.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const course = await db.course.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      status: true,
      format: true,
      sessionStartsAt: true,
      sessionJoinUrl: true,
      sessionRecurrence: true,
    },
  });
  if (
    !course ||
    course.status !== "PUBLISHED" ||
    !course.sessionStartsAt ||
    (course.format !== "live" && course.format !== "cohort")
  ) {
    return new Response("No scheduled session for this course.", {
      status: 404,
    });
  }

  const ics = buildCourseIcs({
    courseId: course.id,
    title: course.title,
    startsAt: course.sessionStartsAt,
    joinUrl: course.sessionJoinUrl,
    recurrence: course.sessionRecurrence,
    courseUrl: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/course/${slug}`,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-session.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
