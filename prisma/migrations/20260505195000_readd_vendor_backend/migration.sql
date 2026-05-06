CREATE TABLE IF NOT EXISTS "Vendor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Vendor_businessId_category_isActive_idx"
  ON "Vendor"("businessId", "category", "isActive");

CREATE INDEX IF NOT EXISTS "Vendor_businessId_isActive_idx"
  ON "Vendor"("businessId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Vendor_businessId_fkey'
  ) THEN
    ALTER TABLE "Vendor"
      ADD CONSTRAINT "Vendor_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

