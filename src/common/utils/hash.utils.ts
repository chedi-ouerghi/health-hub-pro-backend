import * as argon2 from 'argon2';
import { createHash } from 'crypto';

/**
 * Hash a plain-text password using argon2id (recommended for password hashing).
 */
export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id });

/**
 * Verify a plain-text password against an argon2 hash.
 */
export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  argon2.verify(hash, plain);

/**
 * Hash a token (refresh token, password reset token, email verification token)
 * using SHA-256 so we can store a fingerprint in the DB without exposing the
 * raw token.  The raw token is sent to the client, the hash is stored in DB.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
