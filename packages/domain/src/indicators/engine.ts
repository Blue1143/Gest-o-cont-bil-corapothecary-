import type { IndicatorComputation, IndicatorDefinition, MetricCounts, MetricKey } from './types';

/** numerator ÷ denominator × multiplier — the only place where indicator values are computed. */
export function computeIndicator(def: IndicatorDefinition, counts: MetricCounts): IndicatorComputation {
  const num = counts[def.numerator.metric];
  if (num == null) return { kind: 'sem_dado', value: null, numerator: null, denominator: null };
  if (!def.denominator) return { kind: 'valor', value: num * def.multiplier, numerator: num, denominator: null };
  const den = counts[def.denominator.metric];
  if (den == null) return { kind: 'sem_dado', value: null, numerator: null, denominator: null };
  if (den === 0) return { kind: 'denominador_zero', value: null, numerator: num, denominator: 0 };
  return { kind: 'valor', value: (num / den) * def.multiplier, numerator: num, denominator: den };
}

/** Sums counts of several sectors or periods; a key missing in every row stays missing. */
export function sumCounts(rows: MetricCounts[]): MetricCounts {
  const out: MetricCounts = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row) as [MetricKey, number | undefined][]) {
      if (v == null) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export interface FactRow {
  /** First day of the period (YYYY-MM-01). */
  period: string;
  sectorId: string;
  counts: MetricCounts;
}

export interface FactFilter {
  periods?: string[];
  sectorIds?: string[];
}

export function filterFacts(rows: FactRow[], filter: FactFilter): FactRow[] {
  return rows.filter(
    (r) => (!filter.periods || filter.periods.includes(r.period)) && (!filter.sectorIds || filter.sectorIds.includes(r.sectorId)),
  );
}

/**
 * Value over several periods (sectors summed). Flow metrics sum every period; stock metrics use
 * the last period that has data.
 */
export function computeForPeriods(def: IndicatorDefinition, rows: FactRow[], periods: string[], sectorIds?: string[]): IndicatorComputation {
  const scope = sectorIds ? { sectorIds } : {};
  if (def.aggregation === 'estoque') {
    for (const p of [...periods].sort().reverse()) {
      const inPeriod = filterFacts(rows, { periods: [p], ...scope });
      if (inPeriod.length) return computeIndicator(def, sumCounts(inPeriod.map((r) => r.counts)));
    }
    return { kind: 'sem_dado', value: null, numerator: null, denominator: null };
  }
  return computeIndicator(def, sumCounts(filterFacts(rows, { periods, ...scope }).map((r) => r.counts)));
}

/** One value per period (sectors summed), in the order of `periods`. */
export function computeSeries(def: IndicatorDefinition, rows: FactRow[], periods: string[], sectorIds?: string[]): Array<number | null> {
  return periods.map((p) => computeIndicator(def, sumCounts(filterFacts(rows, { periods: [p], ...(sectorIds ? { sectorIds } : {}) }).map((r) => r.counts))).value);
}

/** One value per sector for the given periods. */
export function computeBySector(def: IndicatorDefinition, rows: FactRow[], periods: string[], sectorIds: string[]): Array<{ sectorId: string; result: IndicatorComputation }> {
  return sectorIds.map((sectorId) => ({
    sectorId,
    result: computeForPeriods(def, rows, periods, [sectorId]),
  }));
}
