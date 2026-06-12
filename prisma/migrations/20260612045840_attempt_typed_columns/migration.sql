-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "chosenIndex" INTEGER,
ADD COLUMN     "subIndex" INTEGER;

-- Backfill the typed columns from chosenKey's legacy encodings
-- (REQUIREMENTS R16 / KNOWN_ISSUES S2-3). Three shapes carry a choice:
--   "3"      block MCQ           -> chosenIndex
--   "2:1"    QUIZ/AI_QUIZ deck   -> subIndex : chosenIndex
--   "B"      legacy Question MCQ -> letter position (A=0)
-- "drag:N/M" and "branch:<id>" are scores/terminals, not choices — they
-- stay NULL on purpose.
UPDATE "Attempt" SET "chosenIndex" = "chosenKey"::int
WHERE "chosenKey" ~ '^[0-9]+$';

UPDATE "Attempt" SET
  "subIndex"    = split_part("chosenKey", ':', 1)::int,
  "chosenIndex" = split_part("chosenKey", ':', 2)::int
WHERE "chosenKey" ~ '^[0-9]+:[0-9]+$';

UPDATE "Attempt" SET "chosenIndex" = ascii("chosenKey") - 65
WHERE "chosenKey" ~ '^[A-E]$';
