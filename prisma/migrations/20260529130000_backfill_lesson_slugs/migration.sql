-- Backfill slugs for any Lesson missing one.
--
-- Lessons are routed at `/student/lesson/[slug]`, and the course
-- curriculum only renders a lesson as a clickable link when it has a
-- slug (otherwise it falls back to a dead, non-clickable row). The
-- seed historically assigned slugs to only a handful of demo lessons,
-- leaving every other lesson with a NULL slug — so those lessons, and
-- any blocks/questions authored on them, were unreachable for students.
--
-- This gives every slug-less lesson a deterministic
-- `<course-slug>-u<unit-order>-l<lesson-order>` slug — the same scheme
-- the AI course generator already uses. It is collision-free because
-- the course slug is globally unique and (unit order, lesson order) is
-- unique within a course. The unique index on Lesson.slug is the final
-- guard. Idempotent: once every lesson has a slug, re-running matches
-- no rows.
UPDATE "Lesson" l
SET "slug" = c."slug" || '-u' || u."order" || '-l' || l."order"
FROM "Unit" u
JOIN "Course" c ON c."id" = u."courseId"
WHERE l."unitId" = u."id"
  AND (l."slug" IS NULL OR l."slug" = '');
