-- Allow bulk INSERT / CSV import without specifying id (matches Prisma @default(uuid()) behaviour).
ALTER TABLE "MenuItem" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
