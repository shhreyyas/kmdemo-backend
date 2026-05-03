-- Rename enums
ALTER TYPE "RequiredItemType" RENAME TO "SupplyItemType";
ALTER TYPE "RequiredItemCategory" RENAME TO "SupplyItemCategory";

-- Rename tables
ALTER TABLE "RequiredItem" RENAME TO "SupplyItem";
ALTER TABLE "BookingRequiredItem" RENAME TO "BookingSupplyItem";
ALTER TABLE "BookingEventRequiredItem" RENAME TO "BookingEventSupplyItem";

-- Rename foreign key columns
ALTER TABLE "BookingSupplyItem" RENAME COLUMN "requiredItemId" TO "supplyItemId";
ALTER TABLE "BookingEventSupplyItem" RENAME COLUMN "requiredItemId" TO "supplyItemId";

-- Rename indexes
ALTER INDEX IF EXISTS "RequiredItem_businessId_type_category_isActive_idx"
  RENAME TO "SupplyItem_businessId_type_category_isActive_idx";
ALTER INDEX IF EXISTS "BookingRequiredItem_bookingId_category_idx"
  RENAME TO "BookingSupplyItem_bookingId_category_idx";
ALTER INDEX IF EXISTS "BookingEventRequiredItem_bookingEventId_itemType_idx"
  RENAME TO "BookingEventSupplyItem_bookingEventId_itemType_idx";

-- Rename unique indexes
ALTER INDEX IF EXISTS "BookingRequiredItem_bookingId_requiredItemId_key"
  RENAME TO "BookingSupplyItem_bookingId_supplyItemId_key";
ALTER INDEX IF EXISTS "BookingEventRequiredItem_bookingEventId_requiredItemId_key"
  RENAME TO "BookingEventSupplyItem_bookingEventId_supplyItemId_key";

-- Rename primary key indexes
ALTER INDEX IF EXISTS "RequiredItem_pkey" RENAME TO "SupplyItem_pkey";
ALTER INDEX IF EXISTS "BookingRequiredItem_pkey" RENAME TO "BookingSupplyItem_pkey";
ALTER INDEX IF EXISTS "BookingEventRequiredItem_pkey" RENAME TO "BookingEventSupplyItem_pkey";
