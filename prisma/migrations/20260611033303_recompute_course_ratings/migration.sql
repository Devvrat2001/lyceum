-- Honest ratings: the seed used to hand-stamp vanity ratingAvg /
-- ratingCount (e.g. "612 ratings" backed by 2 Review rows), and the
-- review mutation only recomputes the course being reviewed — so stale
-- vanity numbers survive everywhere else. Recompute both columns from
-- the real Review table for every course. Courses with no reviews drop
-- to 0/0 and the UI renders "Not yet rated".
--
-- enrollCount is deliberately NOT touched here: 20260609232244 chose
-- to keep the demo catalog's enrollment numbers, and reversing that is
-- a separate product decision. (The seed no longer writes vanity
-- values for either field, so fresh databases are fully honest.)
UPDATE "Course" SET
  "ratingAvg" = COALESCE(
    (SELECT AVG(r."rating")::double precision
     FROM "Review" r WHERE r."courseId" = "Course"."id"),
    0
  ),
  "ratingCount" = (
    SELECT COUNT(*)::int
    FROM "Review" r WHERE r."courseId" = "Course"."id"
  );
