import { describe, expect, it } from 'vitest';
import { generateCme } from './cme';

const now = new Date('2026-10-09T15:00:00Z');
const surgeries = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, startedAt: new Date(Date.parse('2026-09-01T12:00:00Z') + i * 9 * 3_600_000), implant: i % 10 === 0 }));
const data = generateCme({ from: '2026-09-01', now, timezone: 'America/Sao_Paulo', surgeries });

describe('synthetic CME records', () => {
  it('is deterministic and never goes past now', () => {
    expect(generateCme({ from: '2026-09-01', now, timezone: 'America/Sao_Paulo', surgeries })).toEqual(data);
    expect(data.loads.every((l) => l.startedAt <= now && (!l.endedAt || l.endedAt <= now))).toBe(true);
    expect(data.loads.flatMap((l) => l.decisions).every((d) => d.at <= now)).toBe(true);
  });

  it('includes the situations the module must surface', () => {
    const last = (l: (typeof data.loads)[number]) => l.decisions.at(-1)?.to;
    expect(data.bowieDick.some((b) => b.result === 'reprovado')).toBe(true);
    expect(data.loads.filter((l) => l.reprocessedFromKey)).toHaveLength(2);
    expect(data.loads.some((l) => last(l) === 'reprocessamento')).toBe(true);
    expect(data.loads.some((l) => l.endedAt && l.decisions.length === 0)).toBe(true);
    expect(data.loads.filter((l) => l.decisions[0]?.to === 'liberada' && last(l) === 'rejeitada')).toHaveLength(1);
    expect(data.loads.some((l) => l.tests.some((t) => t.type === 'IB' && !t.reading && t.incubationStart!.getTime() < now.getTime() - 48 * 3_600_000))).toBe(true);
  });

  it('uses each package once, only after release, and links the recalled load to surgeries', () => {
    const keys = data.uses.map((u) => `${u.loadKey}#${u.itemIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
    const byKey = new Map(data.loads.map((l) => [l.key, l]));
    for (const u of data.uses) {
      const released = byKey.get(u.loadKey)!.decisions.find((d) => d.to === 'liberada');
      expect(released && released.at <= u.usedAt).toBe(true);
    }
    const recalled = data.loads.find((l) => l.decisions[0]?.to === 'liberada' && l.decisions.at(-1)?.to === 'rejeitada')!;
    expect(data.uses.filter((u) => u.loadKey === recalled.key && u.surgeryId).length).toBeGreaterThan(0);
    expect(data.uses.some((u) => !u.surgeryId)).toBe(true);
  });
});
