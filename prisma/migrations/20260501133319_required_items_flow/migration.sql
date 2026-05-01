-- CreateEnum
CREATE TYPE "RequiredItemType" AS ENUM ('INGREDIENT', 'UTENSIL');

-- CreateEnum
CREATE TYPE "RequiredItemCategory" AS ENUM ('VEGETABLES', 'DAIRY', 'GROCERIES', 'UTENSILS');

-- CreateTable
CREATE TABLE "RequiredItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "RequiredItemType" NOT NULL,
    "category" "RequiredItemCategory" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameHi" TEXT NOT NULL,
    "nameGu" TEXT NOT NULL,
    "unitOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultUnit" TEXT NOT NULL,
    "availableCount" INTEGER,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequiredItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequiredItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requiredItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL,
    "category" "RequiredItemCategory" NOT NULL,
    "nameSnapshotEn" TEXT NOT NULL,
    "nameSnapshotHi" TEXT NOT NULL,
    "nameSnapshotGu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequiredItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEventRequiredItem" (
    "id" TEXT NOT NULL,
    "bookingEventId" TEXT NOT NULL,
    "requiredItemId" TEXT NOT NULL,
    "itemType" "RequiredItemType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL,
    "category" "RequiredItemCategory" NOT NULL,
    "nameSnapshotEn" TEXT NOT NULL,
    "nameSnapshotHi" TEXT NOT NULL,
    "nameSnapshotGu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEventRequiredItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequiredItem_businessId_type_category_isActive_idx" ON "RequiredItem"("businessId", "type", "category", "isActive");

-- CreateIndex
CREATE INDEX "BookingRequiredItem_bookingId_category_idx" ON "BookingRequiredItem"("bookingId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequiredItem_bookingId_requiredItemId_key" ON "BookingRequiredItem"("bookingId", "requiredItemId");

-- CreateIndex
CREATE INDEX "BookingEventRequiredItem_bookingEventId_itemType_idx" ON "BookingEventRequiredItem"("bookingEventId", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEventRequiredItem_bookingEventId_requiredItemId_key" ON "BookingEventRequiredItem"("bookingEventId", "requiredItemId");

-- AddForeignKey
ALTER TABLE "RequiredItem" ADD CONSTRAINT "RequiredItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequiredItem" ADD CONSTRAINT "BookingRequiredItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequiredItem" ADD CONSTRAINT "BookingRequiredItem_requiredItemId_fkey" FOREIGN KEY ("requiredItemId") REFERENCES "RequiredItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventRequiredItem" ADD CONSTRAINT "BookingEventRequiredItem_bookingEventId_fkey" FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventRequiredItem" ADD CONSTRAINT "BookingEventRequiredItem_requiredItemId_fkey" FOREIGN KEY ("requiredItemId") REFERENCES "RequiredItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
