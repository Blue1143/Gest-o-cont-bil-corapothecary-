import {
  compareWithPrevious, roundTrend, computeForPeriods, computeSeries, evaluateTarget, findTarget, formatNumber, getIndicator, monthLabel, sumCounts, filterFacts,
  type FactRow, type IndicatorDefinition, type IndicatorTarget, type InstitutionalConfig, type MetricKey, type TargetEvaluation, type Trend,
} from '@ccih/domain';
import type { Sector } from '../../data/port';

export interface KpiView {
  id: string;
  label: string;
  def: IndicatorDefinition;
  value: number | null;
  target: IndicatorTarget | undefined;
  evaluation: TargetEvaluation;
  trend: Trend;
  spark: Array<number | null>;
  emptyReason?: string;
  footnote?: string;
}

export interface DashboardInput {
  rows: FactRow[];
  periods: string[];
  previous: string[];
  /** 12 months ending with the last period, for sparklines and trends. */
  history: string[];
  scope: string[] | undefined;
  config: InstitutionalConfig;
  sectors: Sector[];
}

/** Lower-cases a label for use mid-sentence, keeping acronyms (IPCS, PAV, ITU-AC, ISC, IB…). */
const midSentence = (label: string) => (/^[A-ZÀ-Ú]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));

const EMPTY_REASON = { denominador_zero: 'Denominador zero no período (sem exposição).', sem_dado: 'Sem dados no período.' } as const;

export function buildKpi(id: string, input: DashboardInput, label?: string): KpiView {
  const def = getIndicator(id);
  const current = computeForPeriods(def, input.rows, input.periods, input.scope);
  const prev = computeForPeriods(def, input.rows, input.previous, input.scope);
  const target = findTarget(input.config, id);
  const view: KpiView = {
    id,
    label: label ?? def.shortName,
    def,
    value: current.value,
    target,
    evaluation: evaluateTarget(current.value, target),
    trend: roundTrend(compareWithPrevious(current.value, prev.value, def.direction), def.decimals),
    spark: computeSeries(def, input.rows, input.history, input.scope),
  };
  if (current.kind !== 'valor') view.emptyReason = EMPTY_REASON[current.kind];
  else if (def.denominator && current.denominator != null)
    view.footnote = `${formatNumber(current.numerator)} ${midSentence(def.numerator.label)} · ${formatNumber(current.denominator)} ${midSentence(def.denominator.label)}`;
  return view;
}

export function exposure(input: DashboardInput): Array<{ metric: MetricKey; label: string; value: number | null }> {
  const counts = sumCounts(filterFacts(input.rows, { periods: input.periods, ...(input.scope ? { sectorIds: input.scope } : {}) }).map((r) => r.counts));
  const items: Array<[MetricKey, string]> = [
    ['pacientes_dia', 'Pacientes-dia'],
    ['cvc_dia', 'Cateter central-dia'],
    ['vm_dia', 'Ventilação mecânica-dia'],
    ['svd_dia', 'Cateter urinário-dia'],
  ];
  return items.map(([metric, label]) => ({ metric, label, value: counts[metric] ?? null }));
}

export interface TrendView {
  labels: string[];
  series: Array<{ name: string; color: string; values: Array<number | null> }>;
}

export function irasTrend(input: DashboardInput): TrendView {
  const periods = input.periods.length >= 3 ? input.periods : input.history;
  const spec: Array<[string, string, string]> = [['di-ipcs', 'IPCS', 'iras-ipcs'], ['di-pav', 'PAV', 'iras-pav'], ['di-itu', 'ITU-AC', 'iras-itu']];
  return {
    labels: periods.map(monthLabel),
    series: spec.map(([id, name, color]) => ({ name, color, values: computeSeries(getIndicator(id), input.rows, periods, input.scope) })),
  };
}

export function irasBySector(input: DashboardInput) {
  const def = getIndicator('di-iras');
  const wards = input.sectors.filter((s) => (s.kind === 'uti' || s.kind === 'internacao') && (!input.scope || input.scope.includes(s.id)));
  return wards
    .map((s) => {
      const r = computeForPeriods(def, input.rows, input.periods, [s.id]);
      return r.kind === 'valor'
        ? { key: s.id, label: s.name, value: r.value, note: `${formatNumber(r.numerator)} IRAS em ${formatNumber(r.denominator)} pacientes-dia` }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

export function bundleAdherence(input: DashboardInput) {
  const spec: Array<[string, string]> = [['bundle-cvc', 'Cateter central'], ['bundle-vm', 'Ventilação mecânica'], ['bundle-svd', 'Cateter urinário']];
  const bars = spec
    .map(([id, label]) => {
      const r = computeForPeriods(getIndicator(id), input.rows, input.periods, input.scope);
      return r.kind === 'valor' ? { key: id, label, value: r.value, note: `${formatNumber(r.numerator)} de ${formatNumber(r.denominator)} auditorias conformes` } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const targets = spec.map(([id]) => findTarget(input.config, id)?.value);
  const shared = targets.every((t) => t != null && t === targets[0]) ? targets[0] : undefined;
  return { bars, sharedTarget: shared };
}
