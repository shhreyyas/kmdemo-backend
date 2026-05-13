-- Nullable header snapshot: agreed per-guest menu bundle (optional; line snapshots remain on QuotationMenuItem).
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "menuPricePerGuestSnapshot" DECIMAL(12,2);
