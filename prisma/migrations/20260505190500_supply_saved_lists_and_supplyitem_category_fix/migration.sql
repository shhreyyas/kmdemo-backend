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

-- Backward-compatible fix: some DBs have `categorySlug` but no `category`
ALTER TABLE "SupplyItem"
  ADD COLUMN IF NOT EXISTS "category" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'SupplyItem' AND column_name = 'categorySlug'
  ) THEN
    EXECUTE '
      UPDATE "SupplyItem"
      SET "category" = CASE lower(COALESCE("categorySlug", ''''))
        WHEN ''vegetables'' THEN ''VEGETABLES''
        WHEN ''dairy'' THEN ''DAIRY''
        WHEN ''groceries'' THEN ''GROCERIES''
        WHEN ''utensils'' THEN ''UTENSILS''
        ELSE ''GROCERIES''
      END
      WHERE "category" IS NULL
    ';
  ELSE
    EXECUTE '
      UPDATE "SupplyItem"
      SET "category" = ''GROCERIES''
      WHERE "category" IS NULL
    ';
  END IF;
END$$;

ALTER TABLE "SupplyItem"
  ALTER COLUMN "category" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SupplyItem_businessId_type_category_idx"
  ON "SupplyItem"("businessId", "type", "category");

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplySavedList" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingEventId" TEXT,
    "title" TEXT NOT NULL,
    "categoriesLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
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
    "category" TEXT NOT NULL,
    "nameSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplySavedListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplySavedList_businessId_isActive_createdAt_idx"
  ON "SupplySavedList"("businessId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplySavedList_bookingEventId_idx"
  ON "SupplySavedList"("bookingEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplySavedListItem_listId_category_idx"
  ON "SupplySavedListItem"("listId", "category");

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

