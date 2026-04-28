ALTER TABLE "ServiceType"
ALTER COLUMN "name" TYPE JSONB
USING jsonb_build_object('en', "name");
