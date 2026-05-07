-- Align legacy Vendor table shape with current API/schema fields.
ALTER TABLE "Vendor"
  ADD COLUMN IF NOT EXISTS "whatsappNo" TEXT;

ALTER TABLE "Vendor"
  ADD COLUMN IF NOT EXISTS "categorySlug" TEXT;

-- Backfill from legacy category when available.
UPDATE "Vendor"
SET "categorySlug" = LOWER("category")
WHERE "categorySlug" IS NULL
  AND "category" IS NOT NULL
  AND btrim("category") <> '';

-- Keep legacy column compatible during transition.
ALTER TABLE "Vendor"
  ALTER COLUMN "category" DROP NOT NULL;

