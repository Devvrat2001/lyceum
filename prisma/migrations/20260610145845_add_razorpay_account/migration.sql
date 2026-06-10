-- CreateTable
CREATE TABLE "RazorpayAccount" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RazorpayAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayAccount_teacherId_key" ON "RazorpayAccount"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayAccount_externalId_key" ON "RazorpayAccount"("externalId");

-- AddForeignKey
ALTER TABLE "RazorpayAccount" ADD CONSTRAINT "RazorpayAccount_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
