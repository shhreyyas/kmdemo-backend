-- Allow catalog supply rows without a business (global catalog).
ALTER TABLE "SupplyItem" ALTER COLUMN "businessId" DROP NOT NULL;

-- Align visibility model with MenuItem: creator + isGlobal derivation.
ALTER TABLE "SupplyItem" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "SupplyItem" ADD COLUMN "isGlobal" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SupplyItem"
SET "isGlobal" = ("businessId" IS NULL OR "createdByUserId" IS NULL);

ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SupplyItem_createdByUserId_idx" ON "SupplyItem"("createdByUserId");
CREATE INDEX "SupplyItem_isGlobal_idx" ON "SupplyItem"("isGlobal");
