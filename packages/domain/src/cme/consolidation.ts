import { addDays, addMonths, type IsoDate } from '../dates';
import type { FactRow } from '../indicators/engine';
import type { MetricCounts, MetricKey } from '../indicators/types';
import type { LoadStatus, SterilizationTestType, TestResult } from '../rules/sterilization';
import { isChemicalIndicator, type PhysicalResult } from './cme';

/** Monthly CME facts from the records (Phase 5). */
export const CME_METRICS: MetricKey[] = [
  'cme_ciclos', 'cme_ciclos_conformes', 'cme_ciclos_nao_conformes', 'cme_iq_lidos', 'cme_iq_conformes', 'cme_cargas_reprocessadas',
  'cme_nao_conformidades', 'cme_bd_realizados', 'cme_bd_aprovados', 'cme_ib_monitorados', 'cme_ib_negativos', 'cme_cargas',
  'cme_cargas_liberadas', 'cme_cargas_retidas', 'cme_caixas_usadas', 'cme_caixas_rastreadas',
];

export interface CmeInput {
  months: IsoDate[];
  /** One row per load (cycle run), dated by the cycle start. */
  loads: Array<{ date: IsoDate; sectorId: string; physical: PhysicalResult | null; status: LoadStatus; everRetained: boolean }>;
  /** Current version of each test; pending readings are ignored. */
  tests: Array<{ date: IsoDate; sectorId: string; type: SterilizationTestType; result: TestResult }>;
  /** Uses of instrument sets; `traced` when linked to a surgery (and so to a patient). */
  setUses: Array<{ date: IsoDate; sectorId: string; traced: boolean }>;
  nonconformities: Array<{ date: IsoDate; sectorId: string }>;
}

export function consolidateCmeFacts(input: CmeInput): FactRow[] {
  const rows: FactRow[] = [];
  for (const month of input.months) {
    const end = addDays(addMonths(month, 1), -1);
    const inMonth = (d: IsoDate) => d >= month && d <= end;
    const by = new Map<string, MetricCounts>();
    const add = (sector: string, metric: MetricKey, n = 1) => {
      const c = by.get(sector) ?? {};
      c[metric] = (c[metric] ?? 0) + n;
      by.set(sector, c);
    };
    for (const l of input.loads) {
      if (!inMonth(l.date)) continue;
      add(l.sectorId, 'cme_cargas');
      if (l.physical) {
        add(l.sectorId, 'cme_ciclos');
        add(l.sectorId, l.physical === 'conforme' ? 'cme_ciclos_conformes' : 'cme_ciclos_nao_conformes');
      }
      if (l.status === 'liberada') add(l.sectorId, 'cme_cargas_liberadas');
      if (l.everRetained) add(l.sectorId, 'cme_cargas_retidas');
      if (l.status === 'reprocessamento') add(l.sectorId, 'cme_cargas_reprocessadas');
    }
    for (const t of input.tests) {
      if (!inMonth(t.date) || t.result === 'pendente') continue;
      const ok = t.result === 'aprovado' ? 1 : 0;
      if (t.type === 'BOWIE_DICK') { add(t.sectorId, 'cme_bd_realizados'); add(t.sectorId, 'cme_bd_aprovados', ok); }
      else if (t.type === 'IB') { add(t.sectorId, 'cme_ib_monitorados'); add(t.sectorId, 'cme_ib_negativos', ok); }
      else if (isChemicalIndicator(t.type)) { add(t.sectorId, 'cme_iq_lidos'); add(t.sectorId, 'cme_iq_conformes', ok); }
    }
    for (const u of input.setUses) {
      if (!inMonth(u.date)) continue;
      add(u.sectorId, 'cme_caixas_usadas');
      add(u.sectorId, 'cme_caixas_rastreadas', u.traced ? 1 : 0);
    }
    for (const n of input.nonconformities) if (inMonth(n.date)) add(n.sectorId, 'cme_nao_conformidades');
    for (const [sectorId, counts] of by) rows.push({ period: month, sectorId, counts });
  }
  return rows;
}
