import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { StudentChrome } from "@/components/layouts/StudentChrome";
import { getServerCaller } from "@/lib/trpc/server";
import { LessonClient } from "@/components/lesson/LessonClient";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const trpc = await getServerCaller();
  let lesson;
  try {
    lesson = await trpc.lesson.bySlug({ slug: lessonId });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <StudentChrome active="library">
      <LessonClient
        lesson={{
          id: lesson.id,
          slug: lesson.slug ?? lessonId,
          title: lesson.title,
          intro: lesson.intro,
          courseSlug: lesson.unit.course.slug,
          courseLabel: `${lesson.unit.course.subject.toUpperCase()} ${lesson.unit.course.grade} · UNIT ${lesson.unit.order} · LESSON ${lesson.title.split(" ").length}`,
          steps: lesson.steps.map((s) => ({
            id: s.id,
            order: s.order,
            title: s.title,
            durationLabel: s.durationLabel,
            isAi: s.isAi,
          })),
          questions: lesson.questions.map((q) => ({
            id: q.id,
            stem: q.stem,
            answers: q.answers as Array<{
              key: string;
              text: string;
              correct: boolean;
            }>,
          })),
          blocks: lesson.blocks.map((b) => ({
            id: b.id,
            type: b.type,
            order: b.order,
            // Block.settings is Prisma.JsonValue; narrow at the seam.
            settings: (b.settings ?? {}) as Record<string, unknown>,
          })),
        }}
      />
    </StudentChrome>
  );
}
