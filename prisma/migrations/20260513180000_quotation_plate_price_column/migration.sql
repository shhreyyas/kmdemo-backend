-- Rename header snapshot column to platePrice (API: plate_price).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Quotation' AND column_name = 'menuPricePerGuestSnapshot'
  ) THEN
    ALTER TABLE "Quotation" RENAME COLUMN "menuPricePerGuestSnapshot" TO "platePrice";
  END IF;
END $$;
