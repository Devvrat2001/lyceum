-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "board" TEXT;

-- Backfill curriculum boards for the known seed catalog so the new
-- /browse facet isn't empty on existing deployments. Guarded by
-- "board" IS NULL so a teacher's later choice is never overwritten if
-- this migration ever re-runs against restored data. Unknown courses
-- stay NULL (untagged) by design.
UPDATE "Course" SET "board" = 'cbse'
WHERE "slug" IN ('fractions-decimals-percents', 'algebra-foundations')
  AND "board" IS NULL;
UPDATE "Course" SET "board" = 'icse'
WHERE "slug" = 'ela-grade-6-novels'
  AND "board" IS NULL;
UPDATE "Course" SET "board" = 'state'
WHERE "slug" = 'earth-science-grade-6'
  AND "board" IS NULL;
