-- Persist the short-lived OTP used by the authenticated email verification flow.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "emailVerificationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" TIMESTAMP(3);
