-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "razorpayCustomerId" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Quotation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "planCode" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "billingSubscriptionId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpayInvoiceId" TEXT,
    "amountPaise" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "rawWebhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookInbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_razorpaySubscriptionId_key" ON "BillingSubscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "BillingSubscription_businessId_idx" ON "BillingSubscription"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentEvent_razorpayPaymentId_key" ON "BillingPaymentEvent"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "BillingPaymentEvent_businessId_idx" ON "BillingPaymentEvent"("businessId");

-- CreateIndex
CREATE INDEX "BillingPaymentEvent_billingSubscriptionId_idx" ON "BillingPaymentEvent"("billingSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInbox_eventId_key" ON "WebhookInbox"("eventId");

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentEvent" ADD CONSTRAINT "BillingPaymentEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentEvent" ADD CONSTRAINT "BillingPaymentEvent_billingSubscriptionId_fkey" FOREIGN KEY ("billingSubscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
