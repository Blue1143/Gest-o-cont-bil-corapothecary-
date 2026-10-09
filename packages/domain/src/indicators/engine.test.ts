import { describe, expect, it } from 'vitest';
import { INDICATORS, getIndicator } from './catalog';
import { computeBySector, computeForPeriods, computeIndicator, computeSeries, sumCounts, type FactRow } from './engine';

describe('indicator catalog', () => {
  it('has unique ids and complete definitions', () => {
    const ids = INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of INDICATORS) {
      expect(d.name && d.description && d.unit && d.dataSource && d.interpretation && d.responsibleRole).toBeTruthy();
      expect(d.multiplier).toBeGreaterThan(0);
    }
  });

  it('does not embed targets in definitions', () => {
    for (const d of INDICATORS) expect(d).not.toHaveProperty('target');
  });

  it('throws on unknown ids', () => {
    expect(() => getIndicator('nao-existe')).toThrow();
  });
});

describe('computeIndicator', () => {
  const ipcs = getIndicator('di-ipcs');

  it('computes numerator / denominator × multiplier', () => {
    expect(computeIndicator(ipcs, { iras_ipcs: 3, cvc_dia: 1248 })).toMatchObject({ kind: 'valor', numerator: 3, denominator: 1248 });
    expect(computeIndicator(ipcs, { iras_ipcs: 3, cvc_dia: 1248 }).value).toBeCloseTo(2.404, 3);
  });

  it('distinguishes zero denominator from missing data', () => {
    expect(computeIndicator(ipcs, { iras_ipcs: 0, cvc_dia: 0 }).kind).toBe('denominador_zero');
    expect(computeIndicator(ipcs, { cvc_dia: 100 }).kind).toBe('sem_dado');
  });

  it('supports absolute counts', () => {
    expect(computeIndicator(getIndicator('investigacoes-abertas'), { investigacoes_abertas: 4 }).value).toBe(4);
  });
});

describe('aggregation', () => {
  const rows: FactRow[] = [
    { period: '2026-08-01', sectorId: 'uti', counts: { iras_ipcs: 1, cvc_dia: 500 } },
    { period: '2026-08-01', sectorId: 'cm', counts: { iras_ipcs: 1, cvc_dia: 100 } },
    { period: '2026-09-01', sectorId: 'uti', counts: { iras_ipcs: 2, cvc_dia: 500 } },
  ];
  const ipcs = getIndicator('di-ipcs');

  it('sums counts before dividing (never averages rates)', () => {
    expect(sumCounts(rows.map((r) => r.counts))).toEqual({ iras_ipcs: 4, cvc_dia: 1100 });
    const [aug] = computeSeries(ipcs, rows, ['2026-08-01']);
    expect(aug).toBeCloseTo((2 / 600) * 1000, 6);
  });

  it('computes series per period and values per sector', () => {
    expect(computeSeries(ipcs, rows, ['2026-08-01', '2026-09-01', '2026-10-01'], ['uti'])).toEqual([2, 4, null]);
    const bySector = computeBySector(ipcs, rows, ['2026-08-01', '2026-09-01'], ['uti', 'cm']);
    expect(bySector.map((s) => s.result.value)).toEqual([3, 10]);
  });

  it('uses only the last period for stock metrics', () => {
    const open = getIndicator('investigacoes-abertas');
    const stock: FactRow[] = [
      { period: '2026-08-01', sectorId: 'uti', counts: { investigacoes_abertas: 5 } },
      { period: '2026-09-01', sectorId: 'uti', counts: { investigacoes_abertas: 2 } },
      { period: '2026-09-01', sectorId: 'cm', counts: { investigacoes_abertas: 1 } },
    ];
    expect(computeForPeriods(open, stock, ['2026-08-01', '2026-09-01']).value).toBe(3);
    expect(computeForPeriods(ipcs, rows, ['2026-08-01', '2026-09-01']).value).toBeCloseTo((4 / 1100) * 1000, 6);
  });
});
