-- Data backfill: Course.enrollCount was only ever set by the seed —
-- no enrollment path incremented it, so organically-created courses
-- showed "0 students" (teacher cards, storefronts, Popular sort)
-- regardless of real signups. Raise the counter to the actual
-- enrollment count wherever it lags. Seeded demo courses, whose
-- vanity counts exceed their real row counts, are deliberately left
-- untouched so the demo catalog keeps its numbers.
UPDATE "Course" c
SET "enrollCount" = sub.cnt
FROM (
  SELECT "courseId", COUNT(*)::int AS cnt
  FROM "Enrollment"
  GROUP BY "courseId"
) sub
WHERE sub."courseId" = c."id"
  AND c."enrollCount" < sub.cnt;
