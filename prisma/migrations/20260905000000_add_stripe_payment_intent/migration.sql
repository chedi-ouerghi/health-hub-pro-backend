ALTER TABLE "invoices" ADD COLUMN "stripePaymentIntentId" TEXT;
CREATE UNIQUE INDEX "invoices_stripePaymentIntentId_key" ON "invoices"("stripePaymentIntentId");
