import { describe, expect, it } from 'vitest';
import { computeForPeriods, getIndicator } from '@ccih/domain';
import { DEMO_CONFIG, DEMO_SECTORS, generateFacts } from '@ccih/demo-data';
import { periodWindow } from '../../app/filters';
import { buildKpi, bundleAdherence, exposure, irasBySector, irasTrend, type DashboardInput } from './model';

const now = new Date('2026-10-09T12:00:00Z');
const { periods, previous } = periodWindow(3, 'America/Sao_Paulo', now);
const history = periodWindow(12, 'America/Sao_Paulo', now).periods;
const rows = generateFacts('2025-07-01', '2026-09-01', '2026-09-01');
const input: DashboardInput = { rows, periods, previous, history, scope: undefined, config: DEMO_CONFIG, sectors: DEMO_SECTORS };

describe('dashboard model', () => {
  it('uses the closed months before today', () => {
    expect(periods).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(previous).toEqual(['2026-04-01', '2026-05-01', '2026-06-01']);
  });

  it('derives every KPI from the indicator engine (single source of truth)', () => {
    const kpi = buildKpi('di-ipcs', input);
    expect(kpi.value).toBe(computeForPeriods(getIndicator('di-ipcs'), rows, periods).value);
    expect(kpi.spark).toHaveLength(12);
    expect(kpi.target?.origin).toBe('demonstracao');
    expect(kpi.footnote).toMatch(/cateter central-dia/);
  });

  it('respects the sector scope', () => {
    const scoped = buildKpi('di-pav', { ...input, scope: ['clinica-medica'] });
    expect(scoped.value).toBeNull();
    expect(scoped.emptyReason).toMatch(/Denominador zero/);
  });

  it('builds exposure, trend, sector and bundle views', () => {
    expect(exposure(input).find((e) => e.metric === 'pacientes_dia')?.value).toBeGreaterThan(0);
    const trend = irasTrend(input);
    expect(trend.series.map((s) => s.color)).toEqual(['iras-ipcs', 'iras-pav', 'iras-itu']);
    expect(irasBySector(input).map((b) => b.key)).not.toContain('cme');
    expect(bundleAdherence(input).sharedTarget).toBe(85);
  });

  it('is deterministic', () => {
    expect(generateFacts('2026-09-01', '2026-09-01', '2026-09-01')).toEqual(generateFacts('2026-09-01', '2026-09-01', '2026-09-01'));
  });
});
