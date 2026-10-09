import { dayDiff, type IsoDate } from '../dates';
import type { Status } from '../status';

/* ---------- Bundles ---------- */

export type BundleAnswer = 'conforme' | 'nao_conforme' | 'nao_aplicavel' | null;
export type BundleMethod = 'tudo_ou_nada' | 'por_item';

export interface BundleEvaluation {
  result: 'conforme' | 'nao_conforme' | 'incompleto';
  status: Status;
  label: string;
  nonCompliant: number;
  unanswered: number;
  applicable: number;
  /** Share of applicable items marked compliant (0–100); used by the per-item method. */
  itemCompliancePct: number | null;
}

/**
 * Evaluates one bundle audit. `tudo_ou_nada`: one non-compliant item makes the audit non-compliant.
 * The method is configured per bundle by the institution.
 */
export function evaluateBundle(answers: BundleAnswer[], method: BundleMethod): BundleEvaluation {
  const unanswered = answers.filter((a) => a === null).length;
  const nonCompliant = answers.filter((a) => a === 'nao_conforme').length;
  const applicable = answers.filter((a) => a === 'conforme' || a === 'nao_conforme').length;
  const itemCompliancePct = applicable ? ((applicable - nonCompliant) / applicable) * 100 : null;
  if (unanswered) return { result: 'incompleto', status: 'neutral', label: `Incompleto — ${unanswered} sem resposta`, nonCompliant, unanswered, applicable, itemCompliancePct };
  const compliant = method === 'tudo_ou_nada' ? nonCompliant === 0 && applicable > 0 : nonCompliant === 0;
  return compliant
    ? { result: 'conforme', status: 'ok', label: 'Bundle conforme', nonCompliant, unanswered, applicable, itemCompliancePct }
    : { result: 'nao_conforme', status: 'crit', label: `Não conforme — ${nonCompliant} ${nonCompliant === 1 ? 'item' : 'itens'}`, nonCompliant, unanswered, applicable, itemCompliancePct };
}

/* ---------- Supplies ---------- */

export interface StockInput {
  quantity: number;
  dailyConsumption: number | null;
  minCoverageDays?: number | null;
  expiresOn?: IsoDate | null;
}

export interface StockRule {
  defaultMinCoverageDays: number | undefined;
  expiryWarningDays: number | undefined;
}

export interface StockEvaluation {
  coverageDays: number | null;
  coverage: 'abastecido' | 'repor' | 'ruptura_iminente' | 'indisponivel' | 'sem_consumo' | 'sem_regra';
  expiry: 'valido' | 'vencendo' | 'vencido' | 'sem_validade' | 'sem_regra';
  daysToExpiry: number | null;
  status: Status;
  label: string;
}

export function evaluateStock(item: StockInput, rule: StockRule, today: IsoDate): StockEvaluation {
  const coverageDays = item.dailyConsumption ? item.quantity / item.dailyConsumption : null;
  const min = item.minCoverageDays ?? rule.defaultMinCoverageDays;
  let coverage: StockEvaluation['coverage'];
  if (item.quantity <= 0) coverage = 'indisponivel';
  else if (coverageDays == null) coverage = 'sem_consumo';
  else if (min == null) coverage = 'sem_regra';
  else coverage = coverageDays < min / 2 ? 'ruptura_iminente' : coverageDays < min ? 'repor' : 'abastecido';

  const daysToExpiry = item.expiresOn ? dayDiff(today, item.expiresOn) : null;
  let expiry: StockEvaluation['expiry'];
  if (daysToExpiry == null) expiry = 'sem_validade';
  else if (daysToExpiry < 0) expiry = 'vencido';
  else if (rule.expiryWarningDays == null) expiry = 'sem_regra';
  else expiry = daysToExpiry <= rule.expiryWarningDays ? 'vencendo' : 'valido';

  if (coverage === 'indisponivel') return { coverageDays, coverage, expiry, daysToExpiry, status: 'crit', label: 'Indisponível' };
  if (expiry === 'vencido') return { coverageDays, coverage, expiry, daysToExpiry, status: 'crit', label: 'Vencido' };
  if (coverage === 'ruptura_iminente') return { coverageDays, coverage, expiry, daysToExpiry, status: 'crit', label: 'Ruptura iminente' };
  if (coverage === 'repor') return { coverageDays, coverage, expiry, daysToExpiry, status: 'warn', label: 'Repor' };
  if (expiry === 'vencendo') return { coverageDays, coverage, expiry, daysToExpiry, status: 'warn', label: `Vence em ${daysToExpiry} d` };
  if (coverage === 'sem_regra' || expiry === 'sem_regra') return { coverageDays, coverage, expiry, daysToExpiry, status: 'neutral', label: 'Sem regra configurada' };
  if (coverage === 'sem_consumo') return { coverageDays, coverage, expiry, daysToExpiry, status: 'neutral', label: 'Sem consumo' };
  return { coverageDays, coverage, expiry, daysToExpiry, status: 'ok', label: 'Abastecido' };
}

/* ---------- Training ---------- */

export function coveragePct(done: number, total: number): number | null {
  return total > 0 ? (done / total) * 100 : null;
}
