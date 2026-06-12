-- AlterEnum
ALTER TYPE "BlockType" ADD VALUE 'FREE_RESPONSE';

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "aiFeedback" TEXT,
ADD COLUMN     "freeText" TEXT,
ADD COLUMN     "score" INTEGER;
