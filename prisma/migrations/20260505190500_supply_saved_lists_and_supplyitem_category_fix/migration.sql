-- Restored missing migration file to satisfy Prisma migration history.
-- This branch already includes canonical supply schema migrations.
SELECT 1;

-- Ensure enum exists on drifted databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplyItemCategory') THEN
    CREATE TYPE "SupplyItemCategory" AS ENUM ('VEGETABLES', 'DAIRY', 'GROCERIES', 'UTENSILS');
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "SupplyItem_businessId_type_categorySlug_idx"
  ON "SupplyItem"("businessId", "type", "categorySlug");

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplySavedList" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingEventId" TEXT,
    "title" TEXT NOT NULL,
    "categoriesLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySavedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplySavedListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "nameSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySavedListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplySavedList_businessId_createdAt_idx"
  ON "SupplySavedList"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplySavedList_bookingEventId_idx"
  ON "SupplySavedList"("bookingEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplySavedListItem_listId_categorySlug_idx"
  ON "SupplySavedListItem"("listId", "categorySlug");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupplySavedList_businessId_fkey'
  ) THEN
    ALTER TABLE "SupplySavedList"
      ADD CONSTRAINT "SupplySavedList_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupplySavedList_bookingEventId_fkey'
  ) THEN
    ALTER TABLE "SupplySavedList"
      ADD CONSTRAINT "SupplySavedList_bookingEventId_fkey"
      FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupplySavedListItem_listId_fkey'
  ) THEN
    ALTER TABLE "SupplySavedListItem"
      ADD CONSTRAINT "SupplySavedListItem_listId_fkey"
      FOREIGN KEY ("listId") REFERENCES "SupplySavedList"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupplySavedListItem_supplyItemId_fkey'
  ) THEN
    ALTER TABLE "SupplySavedListItem"
      ADD CONSTRAINT "SupplySavedListItem_supplyItemId_fkey"
      FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

