-- R59 (partial) · Enforce the Attempt "exactly one of" invariant that was
-- previously app-layer-only (schema.prisma admits Prisma has no CHECK DSL).
-- Audited clean before adding: 0 violating rows across 33 Attempt rows.
--
-- NOT modeled in schema.prisma (no CHECK DSL), so it lives in migration
-- history only — same pattern as the LessonChunk FTS expression index. Do NOT
-- "clean up" a constraint that isn't in the schema; the shadow DB replays this.
--
-- NOTE: the sibling Order (courseId XOR pathId) constraint is DEFERRED. Adding
-- it flushed out a Prisma pg-adapter bug where a bundle-order insert that
-- follows parallel course creates + a path-with-nested-PathCourse create
-- silently drops the `pathId` bind parameter (persisting pathId=null → a both-
-- null row). See KNOWN_ISSUES "Order pathId drop" and REQUIREMENTS R59; the
-- Order constraint lands once that root cause is fixed.

-- Attempt: exactly one of questionId / blockId is set (legacy Question MCQ vs
-- block-builder MCQ). `<>` on the two NULL-tests is XOR: true iff exactly one.
ALTER TABLE "Attempt"
  ADD CONSTRAINT "attempt_question_xor_block"
  CHECK (("questionId" IS NULL) <> ("blockId" IS NULL));
