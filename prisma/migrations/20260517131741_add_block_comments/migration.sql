-- CreateTable
CREATE TABLE "BlockComment" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockComment_blockId_createdAt_idx" ON "BlockComment"("blockId", "createdAt");

-- CreateIndex
CREATE INDEX "BlockComment_userId_createdAt_idx" ON "BlockComment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BlockComment" ADD CONSTRAINT "BlockComment_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockComment" ADD CONSTRAINT "BlockComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
