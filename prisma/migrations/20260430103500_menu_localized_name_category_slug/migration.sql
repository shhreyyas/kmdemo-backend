ALTER TABLE "MenuCategory"
ALTER COLUMN "name" TYPE JSONB
USING jsonb_build_object('en', "name");

ALTER TABLE "MenuItem"
ADD COLUMN "categorySlug" TEXT;

UPDATE "MenuItem" mi
SET "categorySlug" = COALESCE(
  (
    SELECT mc."slug"
    FROM "MenuCategory" mc
    WHERE mc."slug" = mi."category"
    LIMIT 1
  ),
  (
    SELECT mc."slug"
    FROM "MenuCategory" mc
    WHERE LOWER(COALESCE(mc."name"->>'en', '')) = LOWER(COALESCE(mi."category", ''))
    LIMIT 1
  ),
  split_part(COALESCE(mi."category", ''), '"slug":"', 2)
)
WHERE mi."categorySlug" IS NULL;

UPDATE "MenuItem"
SET "categorySlug" = 'other'
WHERE "categorySlug" IS NULL OR btrim("categorySlug") = '';

ALTER TABLE "MenuItem"
ALTER COLUMN "name" TYPE JSONB
USING CASE
  WHEN "name" IS NULL OR btrim("name") = '' THEN jsonb_build_object('en', '')
  ELSE jsonb_build_object('en', "name")
END;

ALTER TABLE "MenuItem"
ALTER COLUMN "categorySlug" SET NOT NULL;

ALTER TABLE "MenuItem"
ADD CONSTRAINT "MenuItem_categorySlug_fkey"
FOREIGN KEY ("categorySlug") REFERENCES "MenuCategory"("slug")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "MenuItem_categorySlug_idx" ON "MenuItem"("categorySlug");

ALTER TABLE "MenuItem"
DROP COLUMN "category";
