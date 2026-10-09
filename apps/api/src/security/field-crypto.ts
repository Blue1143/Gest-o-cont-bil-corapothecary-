import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Column encryption for identifying data (patient full name): AES-256-GCM with a random IV and the
 * row identity as associated data, so a ciphertext copied to another row does not decrypt.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
export class FieldCipher {
  private constructor(private readonly key: Buffer) {}

  /** null when no key is configured: identifying fields are then refused, never stored in clear. */
  static fromEnv(base64Key: string | undefined): FieldCipher | null {
    if (!base64Key) return null;
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY deve ter 32 bytes em base64.');
    return new FieldCipher(key);
  }

  encrypt(plain: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  }

  decrypt(token: string, context: string): string {
    const [version, iv, tag, ct] = token.split('.');
    if (version !== 'v1' || !iv || !tag || ct == null) throw new Error('Formato de campo cifrado desconhecido.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }
}

export const patientNameContext = (institutionId: string, patientId: string) => `patient.full_name|${institutionId}|${patientId}`;
