-- Bulk INSERT / CSV import omits updatedAt; Prisma normally sets it in app code.
ALTER TABLE "MenuItem" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
