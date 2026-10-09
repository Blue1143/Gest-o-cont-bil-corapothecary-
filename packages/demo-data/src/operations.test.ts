import { describe, expect, it } from 'vitest';
import { generateOperations, DEMO_BUNDLES } from './operations';
import { WARD_PROFILES } from './facts';

const now = new Date('2026-10-09T15:00:00Z');
const ops = generateOperations({ from: '2026-08-01', now, timezone: 'America/Sao_Paulo' });

describe('synthetic operational records', () => {
  it('are deterministic', () => {
    expect(generateOperations({ from: '2026-08-01', now, timezone: 'America/Sao_Paulo' }).bundleAudits.length).toBe(ops.bundleAudits.length);
  });

  it('never consume more than a lot holds', () => {
    for (const lot of ops.lots) {
      const used = ops.consumption.filter((c) => c.supplyCode === lot.supplyCode && c.lot === lot.lot).reduce((s, c) => s + c.quantity, 0);
      expect(used).toBeLessThanOrEqual(lot.entries[0]!.quantity + 1);
    }
  });

  it('keep staff and audit volumes in line with the ward profiles', () => {
    const staff = Object.values(WARD_PROFILES).reduce((s, p) => s + p.staff, 0);
    expect(Math.abs(ops.staff.length - staff)).toBeLessThanOrEqual(10);
    const cvc = ops.bundleAudits.filter((a) => a.templateCode === 'bundle-cvc' && a.sectorCode === 'uti-adulto' && a.auditedAt.startsWith('2026-09')).length;
    expect(cvc).toBeGreaterThan(10);
    for (const a of ops.bundleAudits) expect(a.answers).toHaveLength(DEMO_BUNDLES.find((b) => b.code === a.templateCode)!.items.length);
    for (const h of ops.handHygiene) expect(h.actions).toBeLessThanOrEqual(h.opportunities);
  });
});
