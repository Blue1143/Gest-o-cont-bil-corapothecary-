import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, setupTestApp, teardown, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp({ LOGIN_RATE_LIMIT_PER_MINUTE: '2' });
});
afterAll(async () => teardown(ctx));

describe('login throttling', () => {
  it('limits login attempts per IP with a pt-BR message', async () => {
    const attempt = () => ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: { login: 'admin', password: 'errada' } });
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);
    const third = await attempt();
    expect(third.statusCode).toBe(429);
    expect(third.json().message).toMatch(/Muitas tentativas/);
    // A made-up session cookie does not open a fresh budget: login attempts count per IP.
    const forged = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, cookies: { ccih_session: 'inventado' }, payload: { login: 'admin', password: 'errada' } });
    expect(forged.statusCode).toBe(429);
  });
});
