-- Table name would collide with existing enum type "SupplyItemCategory" (same pg_catalog namespace).
-- Rename enum first; columns keep using the renamed type until dropped below.
ALTER TYPE "SupplyItemCategory" RENAME TO "_SupplyItemCategoryEnum";

-- CreateTable
CREATE TABLE "SupplyItemCategory" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplyItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItemCategory_slug_key" ON "SupplyItemCategory"("slug");
CREATE INDEX "SupplyItemCategory_isActive_sortOrder_idx" ON "SupplyItemCategory"("isActive", "sortOrder");

-- Seed base categories
INSERT INTO "SupplyItemCategory" ("id", "name", "slug", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('0a5b3737-5c3a-4df0-a5b8-7eb9c7f1a001', '{"en":"Vegetables","hi":"सब्जियां","gu":"શાકભાજી"}', 'vegetables', 1, true, NOW(), NOW()),
    ('0a5b3737-5c3a-4df0-a5b8-7eb9c7f1a002', '{"en":"Dairy","hi":"डेयरी","gu":"ડેરી"}', 'dairy', 2, true, NOW(), NOW()),
    ('0a5b3737-5c3a-4df0-a5b8-7eb9c7f1a003', '{"en":"Groceries","hi":"किराना","gu":"કિરાણા"}', 'groceries', 3, true, NOW(), NOW()),
    ('0a5b3737-5c3a-4df0-a5b8-7eb9c7f1a004', '{"en":"Utensils","hi":"बर्तन","gu":"વાસણ"}', 'utensils', 4, true, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

-- SupplyItem.category (enum) -> categorySlug (text fk)
ALTER TABLE "SupplyItem" ADD COLUMN "categorySlug" TEXT;
UPDATE "SupplyItem"
SET "categorySlug" = CASE "category"::text
    WHEN 'VEGETABLES' THEN 'vegetables'
    WHEN 'DAIRY' THEN 'dairy'
    WHEN 'GROCERIES' THEN 'groceries'
    WHEN 'UTENSILS' THEN 'utensils'
    ELSE NULL
END;
ALTER TABLE "SupplyItem" ALTER COLUMN "categorySlug" SET NOT NULL;
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_categorySlug_fkey"
    FOREIGN KEY ("categorySlug") REFERENCES "SupplyItemCategory"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "SupplyItem_businessId_type_category_isActive_idx";
CREATE INDEX "SupplyItem_businessId_type_categorySlug_isActive_idx"
    ON "SupplyItem"("businessId", "type", "categorySlug", "isActive");
CREATE INDEX "SupplyItem_categorySlug_idx" ON "SupplyItem"("categorySlug");
ALTER TABLE "SupplyItem" DROP COLUMN "category";

-- BookingSupplyItem.category (enum) -> categorySlug (text fk)
ALTER TABLE "BookingSupplyItem" ADD COLUMN "categorySlug" TEXT;
UPDATE "BookingSupplyItem"
SET "categorySlug" = CASE "category"::text
    WHEN 'VEGETABLES' THEN 'vegetables'
    WHEN 'DAIRY' THEN 'dairy'
    WHEN 'GROCERIES' THEN 'groceries'
    WHEN 'UTENSILS' THEN 'utensils'
    ELSE NULL
END;
ALTER TABLE "BookingSupplyItem" ALTER COLUMN "categorySlug" SET NOT NULL;
ALTER TABLE "BookingSupplyItem" ADD CONSTRAINT "BookingSupplyItem_categorySlug_fkey"
    FOREIGN KEY ("categorySlug") REFERENCES "SupplyItemCategory"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "BookingSupplyItem_bookingId_category_idx";
CREATE INDEX "BookingSupplyItem_bookingId_categorySlug_idx"
    ON "BookingSupplyItem"("bookingId", "categorySlug");
CREATE INDEX "BookingSupplyItem_categorySlug_idx" ON "BookingSupplyItem"("categorySlug");
ALTER TABLE "BookingSupplyItem" DROP COLUMN "category";

-- BookingEventSupplyItem.category (enum) -> categorySlug (text fk)
ALTER TABLE "BookingEventSupplyItem" ADD COLUMN "categorySlug" TEXT;
UPDATE "BookingEventSupplyItem"
SET "categorySlug" = CASE "category"::text
    WHEN 'VEGETABLES' THEN 'vegetables'
    WHEN 'DAIRY' THEN 'dairy'
    WHEN 'GROCERIES' THEN 'groceries'
    WHEN 'UTENSILS' THEN 'utensils'
    ELSE NULL
END;
ALTER TABLE "BookingEventSupplyItem" ALTER COLUMN "categorySlug" SET NOT NULL;
ALTER TABLE "BookingEventSupplyItem" ADD CONSTRAINT "BookingEventSupplyItem_categorySlug_fkey"
    FOREIGN KEY ("categorySlug") REFERENCES "SupplyItemCategory"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BookingEventSupplyItem_categorySlug_idx" ON "BookingEventSupplyItem"("categorySlug");
ALTER TABLE "BookingEventSupplyItem" DROP COLUMN "category";

-- Enum no longer needed after moving to slug references
DROP TYPE "_SupplyItemCategoryEnum";
