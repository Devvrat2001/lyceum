import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { getServerCaller } from "@/lib/trpc/server";
import { CourseBuilderClient } from "@/components/teacher/CourseBuilderClient";

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const trpc = await getServerCaller();
  // courseId here is actually the slug (route name kept for compatibility).
  let course;
  try {
    course = await trpc.teacher.course({ slug: courseId });
  } catch (err) {
    if (err instanceof TRPCError) {
      if (err.code === "NOT_FOUND") notFound();
      // FORBIDDEN: middleware already let them in (TEACHER role) but they
      // don't own this course. Treat as 404 to avoid leaking existence.
      if (err.code === "FORBIDDEN") notFound();
    }
    throw err;
  }

  return (
    <TeacherChrome active="courses">
      <CourseBuilderClient
        course={{
          id: course.id,
          slug: course.slug,
          title: course.title,
          tagline: course.tagline,
          status: course.status,
          subject: course.subject,
          grade: course.grade,
          board: course.board,
          format: course.format,
          sessionStartsAt: course.sessionStartsAt
            ? course.sessionStartsAt.toISOString()
            : null,
          sessionJoinUrl: course.sessionJoinUrl,
          priceCents: course.priceCents,
          thumbnailUrl: course.thumbnailUrl,
          updatedAt: course.updatedAt.toISOString(),
          units: course.units.map((u) => ({
            id: u.id,
            order: u.order,
            title: u.title,
            subtitle: u.subtitle,
            estLabel: u.estLabel,
            lessons: u.lessons.map((l) => ({
              id: l.id,
              slug: l.slug,
              title: l.title,
              durationMin: l.durationMin,
              blocks: l.blocks.map((b) => ({
                id: b.id,
                type: b.type,
                order: b.order,
                // settings is a Prisma.JsonValue; we narrow on the
                // client (CourseBuilderClient.BlockSettings).
                settings: (b.settings ?? {}) as Record<string, unknown>,
              })),
            })),
          })),
        }}
      />
    </TeacherChrome>
  );
}
