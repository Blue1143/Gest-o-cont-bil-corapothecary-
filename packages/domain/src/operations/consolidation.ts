import { addDays, addMonths, type IsoDate } from '../dates';
import type { FactRow } from '../indicators/engine';
import type { MetricCounts, MetricKey } from '../indicators/types';
import { BUNDLE_METRIC_KEYS, type BundleMetric } from './bundles';
import { coverageBySector, requiredTrainings, type CoverageAttendance, type CoverageProfessional, type CoverageTraining } from './training';

/** Monthly facts from operational records (Phase 4): bundles, hand hygiene, alcohol use, training. */
export const OPERATIONAL_METRICS: MetricKey[] = [
  'bundle_cvc_auditorias', 'bundle_cvc_conformes', 'bundle_vm_auditorias', 'bundle_vm_conformes', 'bundle_svd_auditorias', 'bundle_svd_conformes',
  'hm_oportunidades', 'hm_acoes', 'alcool_ml', 'treinamento_publico', 'treinamento_concluidos',
];

export interface OperationalInput {
  months: IsoDate[];
  bundleAudits: Array<{ date: IsoDate; sectorId: string; metric: BundleMetric | null; compliant: boolean }>;
  handHygiene: Array<{ date: IsoDate; sectorId: string; opportunities: number; actions: number }>;
  alcohol: Array<{ date: IsoDate; sectorId: string; ml: number }>;
  training: { professionals: CoverageProfessional[]; trainings: CoverageTraining[]; attendances: CoverageAttendance[]; warningDays: number | undefined } | null;
}

const monthEnd = (m: IsoDate) => addDays(addMonths(m, 1), -1);

export function consolidateOperationalFacts(input: OperationalInput): FactRow[] {
  const rows: FactRow[] = [];
  for (const month of input.months) {
    const end = monthEnd(month);
    const inMonth = (d: IsoDate) => d >= month && d <= end;
    const by = new Map<string, MetricCounts>();
    const add = (sector: string, metric: MetricKey, n: number) => {
      const c = by.get(sector) ?? {};
      c[metric] = (c[metric] ?? 0) + n;
      by.set(sector, c);
    };
    for (const a of input.bundleAudits) {
      if (!a.metric || !inMonth(a.date)) continue;
      const keys = BUNDLE_METRIC_KEYS[a.metric];
      add(a.sectorId, keys.audits, 1);
      add(a.sectorId, keys.compliant, a.compliant ? 1 : 0);
    }
    for (const h of input.handHygiene) {
      if (!inMonth(h.date)) continue;
      add(h.sectorId, 'hm_oportunidades', h.opportunities);
      add(h.sectorId, 'hm_acoes', h.actions);
    }
    for (const a of input.alcohol) if (inMonth(a.date)) add(a.sectorId, 'alcool_ml', a.ml);
    if (input.training) {
      // Snapshot at the end of the month (or today for the current month, handled by the caller's data).
      for (const [sector, c] of coverageBySector(requiredTrainings({ ...input.training, at: end }))) {
        add(sector, 'treinamento_publico', c.publico);
        add(sector, 'treinamento_concluidos', c.concluidos);
      }
    }
    for (const [sectorId, counts] of by) rows.push({ period: month, sectorId, counts });
  }
  return rows;
}
