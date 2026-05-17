/*
  Warnings:

  - You are about to drop the column `searchable` on the `LessonChunk` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "LessonChunk_searchable_idx";

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "blockId" TEXT,
ALTER COLUMN "questionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LessonChunk" DROP COLUMN "searchable";

-- CreateIndex
CREATE INDEX "Attempt_blockId_createdAt_idx" ON "Attempt"("blockId", "createdAt");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;
