import { z } from 'zod';

/** Environment, validated at startup: a misconfigured server refuses to start instead of running unsafely. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().url(),
  DATABASE_OWNER_URL: z.string().url().optional(),
  APP_ORIGIN: z.string().url(),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(480).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** Login attempts per IP per minute (brute-force throttling, in addition to the per-account lock). */
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  /** 32 bytes in base64. Without it, patient full names cannot be stored (initials + record number only). */
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'deve ter 32 bytes em base64')
    .optional(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${fields}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.COOKIE_SECURE) {
    throw new Error('Configuração inválida: COOKIE_SECURE deve ser true em produção.');
  }
  return parsed.data;
}
