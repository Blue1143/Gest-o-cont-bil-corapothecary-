import { addDays, addMonths, type IsoDate } from '../dates';
import type { InstitutionalRules } from '../config';
import type { InvestigationStatus, IrasType } from '../iras';
import type { FactRow } from '../indicators/engine';
import type { MetricCounts, MetricKey } from '../indicators/types';
import type { WoundClass } from '../rules/surgery';
import { censusOfRange, zonedInstant, type CensusAdmission } from './census';

/**
 * Monthly indicator facts derived from clinical records (Phase 3). Metrics of modules not built
 * yet (hand hygiene, bundles, CME, training, consumption) are not touched by this consolidation.
 */
export const CLINICAL_METRICS: MetricKey[] = [
  'pacientes_dia', 'cvc_dia', 'vm_dia', 'svd_dia',
  'iras_total', 'iras_ipcs', 'iras_pav', 'iras_itu', 'iras_isc', 'iras_outras',
  'mdr_novos', 'investigacoes_abertas',
  'cirurgias_limpas', 'isc_limpas', 'profilaxia_indicada', 'profilaxia_no_prazo', 'profilaxia_ate_24h',
];

export interface ConsolidationCase {
  type: IrasType;
  eventDate: IsoDate;
  sectorId: string;
  status: InvestigationStatus;
  deviceAssociated: boolean | null;
  surgeryId: string | null;
  /** Status history (ISO instants), used for the open investigations at the end of each month. */
  history: Array<{ to: InvestigationStatus; at: string }>;
}

export interface ConsolidationSurgery {
  id: string;
  date: IsoDate;
  sectorId: string;
  woundClass: WoundClass | null;
  prophylaxisIndicated: boolean | null;
  drug: string | null;
  minutesBeforeIncision: number | null;
  durationHours: number | null;
}

export interface ConsolidationMdr {
  admissionId: string;
  organism: string;
  collectedOn: IsoDate;
  sectorId: string;
}

export interface ConsolidationInput {
  timezone: string;
  rules: InstitutionalRules;
  /** Month starts (YYYY-MM-01) to consolidate. */
  months: IsoDate[];
  admissions: CensusAdmission[];
  cases: ConsolidationCase[];
  surgeries: ConsolidationSurgery[];
  /** Isolates classified as multidrug resistant (any profile). */
  mdrIsolates: ConsolidationMdr[];
}

export interface ConsolidationResult {
  rows: FactRow[];
  /** Metrics actually computed (the caller replaces only these). */
  metrics: MetricKey[];
  /** Metrics left out because a rule is not configured (pt-BR). */
  skipped: string[];
}

const monthEnd = (m: IsoDate) => addDays(addMonths(m, 1), -1);
const inMonth = (d: IsoDate, m: IsoDate) => d >= m && d <= monthEnd(m);

export function consolidateClinicalFacts(input: ConsolidationInput): ConsolidationResult {
  const skipped: string[] = [];
  const censusHour = input.rules.admissions.censusHour?.value;
  const windowMin = input.rules.surgery.prophylaxisWindowMin?.value;
  const byDrug = input.rules.surgery.prophylaxisWindowByDrugMin?.value ?? {};
  const maxDuration = input.rules.surgery.prophylaxisMaxDurationH?.value;
  if (censusHour == null) skipped.push('Paciente-dia e dispositivo-dia: horário do censo diário não configurado.');
  if (windowMin == null) skipped.push('Profilaxia no horário: janela de antibioticoprofilaxia não configurada.');
  if (maxDuration == null) skipped.push('Duração da profilaxia: duração máxima não configurada.');

  const confirmed = input.cases.filter((c) => c.status === 'confirmada');
  const cleanSurgeries = new Map(input.surgeries.filter((s) => s.woundClass === 'limpa').map((s) => [s.id, s]));
  const rows: FactRow[] = [];

  for (const month of input.months) {
    const bySector = new Map<string, MetricCounts>();
    const counts = (sector: string) => {
      let c = bySector.get(sector);
      if (!c) bySector.set(sector, (c = {}));
      return c;
    };
    const add = (sector: string, metric: MetricKey, n = 1) => {
      const c = counts(sector);
      c[metric] = (c[metric] ?? 0) + n;
    };

    if (censusHour != null) {
      for (const [sector, c] of censusOfRange(input.admissions, month, monthEnd(month), censusHour, input.timezone)) {
        add(sector, 'pacientes_dia', c.pacientes);
        add(sector, 'cvc_dia', c.cvc);
        add(sector, 'vm_dia', c.vm);
        add(sector, 'svd_dia', c.svd);
      }
    }

    for (const c of confirmed) {
      if (!inMonth(c.eventDate, month)) continue;
      add(c.sectorId, 'iras_total');
      if (c.type === 'IPCS' && c.deviceAssociated) add(c.sectorId, 'iras_ipcs');
      else if (c.type === 'PAV' && c.deviceAssociated) add(c.sectorId, 'iras_pav');
      else if (c.type === 'ITU-AC' && c.deviceAssociated) add(c.sectorId, 'iras_itu');
      else if (c.type === 'ISC') add(c.sectorId, 'iras_isc');
      else add(c.sectorId, 'iras_outras');
    }

    // Open investigations are a stock: status of each case at the end of the month.
    const endInstant = zonedInstant(addMonths(month, 1), 0, input.timezone).getTime();
    for (const c of input.cases) {
      const last = c.history.filter((h) => Date.parse(h.at) < endInstant).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
      if (last && (last.to === 'suspeita' || last.to === 'em_investigacao')) add(c.sectorId, 'investigacoes_abertas');
    }

    // New MDR: first isolate of each organism per admission.
    const seen = new Set<string>();
    for (const m of [...input.mdrIsolates].sort((a, b) => a.collectedOn.localeCompare(b.collectedOn))) {
      const key = `${m.admissionId}|${m.organism.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (inMonth(m.collectedOn, month)) add(m.sectorId, 'mdr_novos');
    }

    for (const s of input.surgeries) {
      if (!inMonth(s.date, month)) continue;
      if (s.woundClass === 'limpa') add(s.sectorId, 'cirurgias_limpas');
      if (s.prophylaxisIndicated !== true) continue;
      add(s.sectorId, 'profilaxia_indicada');
      const window = (s.drug && byDrug[s.drug.trim().toLowerCase()]) || windowMin;
      if (window != null) add(s.sectorId, 'profilaxia_no_prazo', s.minutesBeforeIncision != null && s.minutesBeforeIncision > 0 && s.minutesBeforeIncision <= window ? 1 : 0);
      if (maxDuration != null) add(s.sectorId, 'profilaxia_ate_24h', s.durationHours != null && s.durationHours <= maxDuration ? 1 : 0);
    }
    for (const c of confirmed) {
      const surgery = c.type === 'ISC' && c.surgeryId ? cleanSurgeries.get(c.surgeryId) : undefined;
      if (surgery && inMonth(surgery.date, month)) add(surgery.sectorId, 'isc_limpas');
    }

    // Zero is a real value for consolidated metrics: write it explicitly for every sector touched.
    for (const [sector, c] of bySector) {
      for (const metric of ['iras_total', 'iras_ipcs', 'iras_pav', 'iras_itu', 'iras_isc', 'iras_outras', 'mdr_novos', 'investigacoes_abertas'] as MetricKey[]) {
        if (c.pacientes_dia != null && c[metric] == null) c[metric] = 0;
      }
      if (c.cirurgias_limpas != null && c.isc_limpas == null) c.isc_limpas = 0;
      rows.push({ period: month, sectorId: sector, counts: c });
    }
  }
  const left = new Set<MetricKey>([
    ...(censusHour == null ? (['pacientes_dia', 'cvc_dia', 'vm_dia', 'svd_dia'] as MetricKey[]) : []),
    ...(windowMin == null ? (['profilaxia_no_prazo'] as MetricKey[]) : []),
    ...(maxDuration == null ? (['profilaxia_ate_24h'] as MetricKey[]) : []),
  ]);
  return { rows, metrics: CLINICAL_METRICS.filter((m) => !left.has(m)), skipped };
}
