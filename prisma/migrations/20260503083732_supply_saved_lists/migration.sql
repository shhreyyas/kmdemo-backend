-- CreateTable
CREATE TABLE "SupplySavedList" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "title" VARCHAR(512) NOT NULL,
    "bookingEventId" TEXT,
    "categoriesLabel" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySavedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplySavedListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "nameSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySavedListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplySavedList_businessId_createdAt_idx" ON "SupplySavedList"("businessId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupplySavedList_bookingEventId_idx" ON "SupplySavedList"("bookingEventId");

-- CreateIndex
CREATE INDEX "SupplySavedListItem_listId_idx" ON "SupplySavedListItem"("listId");

-- CreateIndex
CREATE INDEX "SupplySavedListItem_supplyItemId_idx" ON "SupplySavedListItem"("supplyItemId");

-- AddForeignKey
ALTER TABLE "SupplySavedList" ADD CONSTRAINT "SupplySavedList_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplySavedList" ADD CONSTRAINT "SupplySavedList_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplySavedList" ADD CONSTRAINT "SupplySavedList_bookingEventId_fkey" FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplySavedListItem" ADD CONSTRAINT "SupplySavedListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "SupplySavedList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplySavedListItem" ADD CONSTRAINT "SupplySavedListItem_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
