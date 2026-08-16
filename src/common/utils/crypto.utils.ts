import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derive a 32-byte AES key.
 * - If the configured secret is a 64-char hex string (e.g. generated with
 *   `openssl rand -hex 32`) it is used as-is.
 * - Otherwise a SHA-256 digest of the secret is used (deterministic, NOT a
 *   KDF — prefer a dedicated key in production via TWO_FACTOR_ENCRYPTION_KEY).
 */
export function getEncryptionKey(secret: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
  return createHash('sha256').update(secret).digest();
}

/** AES-256-GCM encrypt; output format: `iv.tag.ciphertext` (base64). */
export function encryptSecret(plain: string, secret: string): string {
  const key = getEncryptionKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

/** AES-256-GCM decrypt (throws on tampered payload — GCM authenticates). */
export function decryptSecret(payload: string, secret: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload');
  }
  const key = getEncryptionKey(secret);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}