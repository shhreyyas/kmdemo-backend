-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "pricePerPerson" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "foodType" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "parentMenuId" TEXT,
    "ingredients" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuItem_businessId_idx" ON "MenuItem"("businessId");

-- CreateIndex
CREATE INDEX "MenuItem_createdByUserId_idx" ON "MenuItem"("createdByUserId");

-- CreateIndex
CREATE INDEX "MenuItem_isGlobal_idx" ON "MenuItem"("isGlobal");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentMenuId_fkey" FOREIGN KEY ("parentMenuId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
