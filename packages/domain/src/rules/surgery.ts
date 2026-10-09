import { addDays, type IsoDate } from '../dates';

export type WoundClass = 'limpa' | 'potencialmente_contaminada' | 'contaminada' | 'infectada';

export const WOUND_CLASS_LABEL: Record<WoundClass, string> = {
  limpa: 'Limpa',
  potencialmente_contaminada: 'Potencialmente contaminada',
  contaminada: 'Contaminada',
  infectada: 'Infectada',
};

export interface RiskIndexInput {
  asa?: number | null;
  woundClass?: WoundClass | null;
  durationMin?: number | null;
  /** 75th percentile duration of the procedure, from the institution's procedure table. */
  p75Min?: number | null;
}

export type RiskFactor = 'asa' | 'woundClass' | 'duration';

export interface RiskIndexResult {
  score: number;
  /** Factors that could not be assessed; the score is a lower bound while this is not empty. */
  missing: RiskFactor[];
  complete: boolean;
}

/** Surgical risk index (ASA ≥ 3, contaminated/infected wound, duration > P75): one point each. */
export function surgicalRiskIndex(input: RiskIndexInput): RiskIndexResult {
  let score = 0;
  const missing: RiskFactor[] = [];
  if (input.asa == null) missing.push('asa');
  else if (input.asa >= 3) score++;
  if (input.woundClass == null) missing.push('woundClass');
  else if (input.woundClass === 'contaminada' || input.woundClass === 'infectada') score++;
  if (input.durationMin == null || input.p75Min == null) missing.push('duration');
  else if (input.durationMin > input.p75Min) score++;
  return { score, missing, complete: missing.length === 0 };
}

export interface ProphylaxisRecord {
  indicated: boolean | null;
  drug?: string | null;
  /** Minutes between dose start and incision (positive = before incision). */
  minutesBeforeIncision?: number | null;
  durationHours?: number | null;
}

export interface ProphylaxisRule {
  windowMin: number | undefined;
  windowByDrugMin?: Record<string, number> | undefined;
  maxDurationH: number | undefined;
}

export type ProphylaxisResult = 'conforme' | 'nao_conforme' | 'incompleto' | 'nao_indicada' | 'sem_regra';

export interface ProphylaxisEvaluation {
  result: ProphylaxisResult;
  /** pt-BR reasons shown to the user. */
  reasons: string[];
  appliedWindowMin: number | null;
}

/**
 * Checks prophylaxis timing and duration against the institutional window. Missing data is
 * "incompleto", never "não conforme"; a missing rule is "sem regra".
 */
export function evaluateProphylaxis(record: ProphylaxisRecord, rule: ProphylaxisRule): ProphylaxisEvaluation {
  if (record.indicated === false) return { result: 'nao_indicada', reasons: ['Profilaxia não indicada para o procedimento.'], appliedWindowMin: null };
  const drugKey = record.drug?.trim().toLowerCase() ?? '';
  const window = (drugKey && rule.windowByDrugMin?.[drugKey]) || rule.windowMin;
  if (window == null || rule.maxDurationH == null) {
    return { result: 'sem_regra', reasons: ['Janela de antibioticoprofilaxia não configurada pela instituição.'], appliedWindowMin: null };
  }
  const reasons: string[] = [];
  const missing: string[] = [];
  if (record.indicated == null) missing.push('indicação');
  if (record.minutesBeforeIncision == null) missing.push('horário da dose');
  if (record.durationHours == null) missing.push('duração');
  if (record.minutesBeforeIncision != null) {
    if (record.minutesBeforeIncision <= 0) reasons.push('Dose iniciada após a incisão.');
    else if (record.minutesBeforeIncision > window) reasons.push(`Dose fora da janela institucional de ${window} min (${record.minutesBeforeIncision} min antes da incisão).`);
  }
  if (record.durationHours != null && record.durationHours > rule.maxDurationH) {
    reasons.push(`Duração de ${record.durationHours} h acima do máximo institucional de ${rule.maxDurationH} h.`);
  }
  if (reasons.length) return { result: 'nao_conforme', reasons, appliedWindowMin: window };
  if (missing.length) return { result: 'incompleto', reasons: [`Dados ausentes: ${missing.join(', ')}.`], appliedWindowMin: window };
  return { result: 'conforme', reasons: [], appliedWindowMin: window };
}

export interface SurveillanceRule {
  days: number | undefined;
  daysWithImplant: number | undefined;
}

/** End of the post-operative surveillance window, or null when not configured. */
export function surveillanceEnd(surgeryDate: IsoDate, hasImplant: boolean, rule: SurveillanceRule): { end: IsoDate; days: number } | null {
  const days = hasImplant ? rule.daysWithImplant : rule.days;
  if (days == null) return null;
  return { end: addDays(surgeryDate, days), days };
}
