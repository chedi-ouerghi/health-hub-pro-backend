ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_stripePaymentIntentId_key" ON "invoices"("stripePaymentIntentId");
