-- Honest enrollment counts, completing what 20260611033303 did for
-- ratings: recompute Course.enrollCount from real Enrollment rows for
-- every course. This reverses 20260609232244's deliberate "keep the
-- demo catalog's vanity numbers" choice — by explicit product decision
-- (2026-06-11), the marketplace shows only numbers the rows support.
-- ensureEnrollment() keeps the counter exact going forward; this fixes
-- the stock.
UPDATE "Course" SET
  "enrollCount" = (
    SELECT COUNT(*)::int FROM "Enrollment" e
    WHERE e."courseId" = "Course"."id"
  );
