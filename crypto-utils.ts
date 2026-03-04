import { createDecipheriv } from 'crypto';

/**
 * Decrypt a Cursor API key stored as AES-256-GCM ciphertext.
 *
 * Format stored in cursor_api_keys.api_key_ciphertext:
 *   base64(iv) + "." + base64(ciphertext + authTag)
 *
 * This mirrors the encryption in:
 *   supabase/functions/cursor-api-key-upsert/index.ts
 *
 * Requires CURSOR_KEYS_ENCRYPTION_SECRET env var (same value as the Edge
 * Function secret) — 64 hex chars representing a 32-byte AES-256 key.
 */
export function decryptCursorApiKey(ciphertext: string): string {
  const secret = process.env.CURSOR_KEYS_ENCRYPTION_SECRET?.trim();
  if (!secret || secret.length < 64) {
    throw new Error(
      'CURSOR_KEYS_ENCRYPTION_SECRET is not configured on this server. ' +
      'Copy the same secret value from Supabase Dashboard → Edge Functions → Secrets into the VPS .env / docker-compose / pm2 config.'
    );
  }

  const keyBytes = Buffer.from(secret, 'hex');
  if (keyBytes.length !== 32) {
    throw new Error(
      'CURSOR_KEYS_ENCRYPTION_SECRET must be exactly 64 hex chars (32 bytes). ' +
      'Generate one with: openssl rand -hex 32'
    );
  }

  const parts = ciphertext.split('.');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid ciphertext format — expected "base64(iv).base64(ciphertext+authTag)" but got ${parts.length} segment(s). ` +
      'The value may not be encrypted (plaintext key stored directly) or may be corrupted.'
    );
  }

  const iv = Buffer.from(parts[0], 'base64');
  const encryptedWithTag = Buffer.from(parts[1], 'base64');

  // AES-256-GCM appends a 16-byte authentication tag at the end of the ciphertext
  const authTag = encryptedWithTag.slice(encryptedWithTag.length - 16);
  const encrypted = encryptedWithTag.slice(0, encryptedWithTag.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', keyBytes, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plaintext.toString('utf8');
}
