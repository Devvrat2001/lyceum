-- CreateTable
CREATE TABLE "BlockVote" (
    "blockId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chosenKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockVote_pkey" PRIMARY KEY ("blockId","userId")
);

-- CreateIndex
CREATE INDEX "BlockVote_blockId_idx" ON "BlockVote"("blockId");

-- AddForeignKey
ALTER TABLE "BlockVote" ADD CONSTRAINT "BlockVote_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockVote" ADD CONSTRAINT "BlockVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
