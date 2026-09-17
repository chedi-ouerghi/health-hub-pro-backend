-- Persist the short-lived OTP used by the authenticated email verification flow.
ALTER TABLE "users"
  ADD COLUMN "emailVerificationCode" TEXT,
  ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);
