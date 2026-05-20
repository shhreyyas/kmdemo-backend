-- Rename payment status PAID -> RECEIVED (user-facing: "received" not "paid")
ALTER TYPE "PaymentStatus" RENAME VALUE 'PAID' TO 'RECEIVED';
