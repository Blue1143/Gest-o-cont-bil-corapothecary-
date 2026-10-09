import { emptyRules, type InstitutionalRules, type RuleParameter } from './config';

/**
 * Every configurable rule parameter: where it lives in InstitutionalRules, how it is labelled and
 * how a new value is validated. Limits are input sanity checks, not clinical recommendations.
 */
export type RuleValueKind = 'integer' | 'drug_minutes';

export interface RuleParameterSpec {
  key: string;
  group: keyof InstitutionalRules;
  field: string;
  label: string;
  unit: string;
  kind: RuleValueKind;
  min: number;
  max: number;
}

const spec = (group: keyof InstitutionalRules, field: string, label: string, unit: string, min: number, max: number, kind: RuleValueKind = 'integer'): RuleParameterSpec => ({
  key: `${group}.${field}`, group, field, label, unit, kind, min, max,
});

export const RULE_PARAMETERS: RuleParameterSpec[] = [
  spec('devices', 'associationFromDeviceDay', 'IRAS associada a dispositivo a partir do dia de uso (D1 = instalação)', 'dia', 1, 30),
  spec('devices', 'associationGraceDaysAfterRemoval', 'Dias após a retirada ainda atribuídos ao dispositivo', 'dias', 0, 30),
  spec('admissions', 'hospitalAcquiredFromDay', 'IRAS a partir do dia de internação (D1 = admissão)', 'dia', 1, 30),
  spec('admissions', 'censusHour', 'Horário do censo diário (paciente-dia e dispositivo-dia)', 'h', 0, 23),
  spec('surgery', 'prophylaxisWindowMin', 'Janela da antibioticoprofilaxia antes da incisão', 'min', 1, 240),
  spec('surgery', 'prophylaxisWindowByDrugMin', 'Janela por fármaco (exceções)', 'min', 1, 240, 'drug_minutes'),
  spec('surgery', 'prophylaxisMaxDurationH', 'Duração máxima da antibioticoprofilaxia', 'h', 1, 168),
  spec('surgery', 'surveillanceDays', 'Vigilância pós-operatória sem implante', 'dias', 1, 365),
  spec('surgery', 'surveillanceDaysWithImplant', 'Vigilância pós-operatória com implante', 'dias', 1, 730),
  spec('supplies', 'expiryWarningDays', 'Alerta de validade de insumos', 'dias', 1, 365),
  spec('supplies', 'defaultMinCoverageDays', 'Cobertura mínima padrão de estoque', 'dias', 1, 365),
  spec('training', 'expiryWarningDays', 'Alerta de vencimento de treinamento', 'dias', 1, 365),
  spec('antimicrobials', 'prolongedTherapyDays', 'Terapia antimicrobiana prolongada a partir de', 'dias', 1, 90),
  spec('alerts', 'investigationOverdueDays', 'Alerta de investigação de IRAS sem conclusão após', 'dias', 1, 60),
  spec('alerts', 'deviceReviewDays', 'Alerta de revisão de dispositivo em uso após', 'dias', 1, 60),
  spec('alerts', 'suppressHours', 'Não reabrir alerta encerrado antes de', 'h', 1, 720),
  spec('cme', 'shelfLifeDays', 'Validade da esterilização dos pacotes', 'dias', 1, 365),
  spec('cme', 'ibReadingHours', 'Prazo para leitura do indicador biológico após a incubação', 'h', 1, 168),
  spec('cme', 'qualificationWarningDays', 'Alerta de qualificação de equipamento a vencer', 'dias', 1, 180),
];

export const RULE_GROUP_LABEL: Record<keyof InstitutionalRules, string> = {
  devices: 'Dispositivos', admissions: 'Internação', surgery: 'Cirurgia', supplies: 'Insumos', training: 'Treinamentos', antimicrobials: 'Antimicrobianos', alerts: 'Alertas', cme: 'CME',
};

const BY_KEY = new Map(RULE_PARAMETERS.map((s) => [s.key, s]));

export function getRuleSpec(key: string): RuleParameterSpec | undefined {
  return BY_KEY.get(key);
}

/** pt-BR validation message, or null when the value is acceptable for the parameter. */
export function validateRuleValue(spec: RuleParameterSpec, value: unknown): string | null {
  const inRange = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= spec.min && n <= spec.max;
  if (spec.kind === 'integer') return inRange(value) ? null : `Informe um número inteiro entre ${spec.min} e ${spec.max}.`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'Informe pares fármaco → minutos.';
  for (const [drug, minutes] of Object.entries(value)) {
    if (!/^[a-zà-ú0-9 -]{2,60}$/.test(drug)) return `Nome de fármaco inválido: "${drug}". Use letras minúsculas.`;
    if (!inRange(minutes)) return `Minutos de "${drug}" devem ser inteiros entre ${spec.min} e ${spec.max}.`;
  }
  return null;
}

export interface StoredRuleParameter {
  key: string;
  value: unknown;
  referenceId: string | null;
}

/** Builds InstitutionalRules from stored rows; unknown keys are ignored. */
export function rulesFromParameters(rows: StoredRuleParameter[]): InstitutionalRules {
  const rules = emptyRules() as unknown as Record<string, Record<string, RuleParameter<unknown>>>;
  for (const row of rows) {
    const s = BY_KEY.get(row.key);
    if (!s) continue;
    rules[s.group]![s.field] = { value: row.value, referenceId: row.referenceId };
  }
  return rules as unknown as InstitutionalRules;
}

/** Flattens InstitutionalRules into rows (inverse of rulesFromParameters). */
export function parametersFromRules(rules: InstitutionalRules): StoredRuleParameter[] {
  return RULE_PARAMETERS.flatMap((s) => {
    const p = (rules[s.group] as Record<string, RuleParameter<unknown> | undefined>)[s.field];
    return p ? [{ key: s.key, value: p.value, referenceId: p.referenceId }] : [];
  });
}
