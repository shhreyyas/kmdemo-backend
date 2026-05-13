-- Quotations: use functionType only; drop legacy eventName column.
ALTER TABLE "Quotation" DROP COLUMN IF EXISTS "eventName";
