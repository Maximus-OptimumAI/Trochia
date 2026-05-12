/**
 * Field-encryption helper — STUB (XC-03 / D-06b).
 *
 * ⚠️ NOT real encryption yet. Real AES-256-GCM with dedicated, rotated key
 * columns lands in Phase 8/9 when cap-table figures and audio data actually
 * exist. For now this is a reversible base64 encoding with a marker prefix so
 * call sites that should encrypt-at-rest are written against this API today
 * and only the implementation changes later.
 *
 * Do NOT treat output of `encryptField` as confidential at rest.
 */

const STUB_PREFIX = 'stub:v0:';

/**
 * STUB. Encodes `plaintext` reversibly. Replace with AES-256-GCM in Phase 8/9.
 */
export function encryptField(plaintext: string): string {
  // TODO(phase-8/9): replace with AES-256-GCM using a dedicated KMS-managed key.
  return STUB_PREFIX + Buffer.from(plaintext, 'utf8').toString('base64');
}

/**
 * STUB. Decodes a value produced by `encryptField`. Replace in Phase 8/9.
 */
export function decryptField(ciphertext: string): string {
  // TODO(phase-8/9): replace with AES-256-GCM decryption.
  if (!ciphertext.startsWith(STUB_PREFIX)) {
    // Tolerate legacy/plain values during the stub era.
    return ciphertext;
  }
  return Buffer.from(ciphertext.slice(STUB_PREFIX.length), 'base64').toString('utf8');
}
