-- isGlobal = false only when both business and creator exist; otherwise true (aligns with deriveIsGlobal in app).
UPDATE "MenuItem"
SET "isGlobal" = NOT (
  "businessId" IS NOT NULL AND "createdByUserId" IS NOT NULL
);
