import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';

const base = { DATABASE_URL: 'postgres://u:p@localhost/db', APP_ORIGIN: 'https://ccih.exemplo' };

describe('environment', () => {
  it('refuses to start without required settings', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('requires secure cookies in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });
});
