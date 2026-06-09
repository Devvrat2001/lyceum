-- AlterTable
ALTER TABLE "Path" ADD COLUMN     "authorId" TEXT;

-- AddForeignKey
ALTER TABLE "Path" ADD CONSTRAINT "Path_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
