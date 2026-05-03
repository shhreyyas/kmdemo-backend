-- FK constraint names stayed as *RequiredItem* after tables were renamed to *SupplyItem*.
-- Runs only after `20260501195000_rename_required_to_supply`.

-- RenameForeignKey
ALTER TABLE "BookingEventSupplyItem" RENAME CONSTRAINT "BookingEventRequiredItem_bookingEventId_fkey" TO "BookingEventSupplyItem_bookingEventId_fkey";

-- RenameForeignKey
ALTER TABLE "BookingEventSupplyItem" RENAME CONSTRAINT "BookingEventRequiredItem_requiredItemId_fkey" TO "BookingEventSupplyItem_supplyItemId_fkey";

-- RenameForeignKey
ALTER TABLE "BookingSupplyItem" RENAME CONSTRAINT "BookingRequiredItem_bookingId_fkey" TO "BookingSupplyItem_bookingId_fkey";

-- RenameForeignKey
ALTER TABLE "BookingSupplyItem" RENAME CONSTRAINT "BookingRequiredItem_requiredItemId_fkey" TO "BookingSupplyItem_supplyItemId_fkey";

-- RenameForeignKey
ALTER TABLE "SupplyItem" RENAME CONSTRAINT "RequiredItem_businessId_fkey" TO "SupplyItem_businessId_fkey";
