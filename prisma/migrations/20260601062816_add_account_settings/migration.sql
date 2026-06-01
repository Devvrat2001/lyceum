-- DropIndex
DROP INDEX "Course_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coppaConsentAt" TIMESTAMP(3),
ADD COLUMN     "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tutorLogOptOut" BOOLEAN NOT NULL DEFAULT false;
