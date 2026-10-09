import { existsSync, readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * Passwords of the synthetic users: E2E_PASSWORD (same as SEED_PASSWORD) in CI, or the local
 * git-ignored file written by the seed. Never hardcoded.
 */
export function passwordOf(login: string): string {
  if (process.env.E2E_PASSWORD) return process.env.E2E_PASSWORD;
  const file = new URL('../apps/api/.seed-credentials.local', import.meta.url);
  if (!existsSync(file)) throw new Error('Defina E2E_PASSWORD ou rode npm run db:reset -w @ccih/api.');
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${login}\t`));
  if (!line) throw new Error(`Usuário ${login} não está no seed local.`);
  return line.split('\t')[2]!;
}

export async function login(page: Page, user: string) {
  await page.goto('/entrar');
  await page.getByLabel(/Usuário/).fill(user);
  await page.getByLabel(/Senha/).fill(passwordOf(user));
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

/** "YYYY-MM-DDTHH:mm" for datetime-local, in the browser zone (set to the institution zone in the config). */
export function localInput(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export const DAY = 86_400_000;

/** Collects page errors and failed requests; the flows must finish without any. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}
