import { addDays, type IsoDate } from '../dates';
import { LOAD_STATUS_LABEL, TEST_TYPE_LABEL, type LoadReleaseEvaluation, type LoadStatus, type SterilizationTestType, type TestResult } from '../rules/sterilization';

/**
 * CME (sterile processing): sterilizers, cycles/loads, quality tests and release. Release follows
 * the institutional policy (`evaluateLoadRelease`); this module validates what people record and
 * which decisions are possible. Nothing here releases a load by itself.
 */
export type SterilizerType = 'vapor_prevacuo' | 'vapor_gravitacional' | 'peroxido_plasma' | 'oxido_etileno' | 'outro';
export const STERILIZER_TYPE_LABEL: Record<SterilizerType, string> = {
  vapor_prevacuo: 'Vapor saturado — pré-vácuo',
  vapor_gravitacional: 'Vapor saturado — gravitacional',
  peroxido_plasma: 'Peróxido de hidrogênio (plasma)',
  oxido_etileno: 'Óxido de etileno',
  outro: 'Outro',
};
/** The Bowie-Dick test checks air removal; it only applies to pre-vacuum steam sterilizers. */
export const bowieDickApplies = (type: SterilizerType): boolean => type === 'vapor_prevacuo';

export type EquipmentStatus = 'ativo' | 'manutencao' | 'inativo';
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = { ativo: 'Em uso', manutencao: 'Em manutenção (bloqueado)', inativo: 'Inativo' };

export type PackagingType = 'papel_grau_cirurgico' | 'sms' | 'container_rigido' | 'tecido_algodao' | 'outro';
export const PACKAGING_LABEL: Record<PackagingType, string> = {
  papel_grau_cirurgico: 'Papel grau cirúrgico', sms: 'SMS (não tecido)', container_rigido: 'Contêiner rígido', tecido_algodao: 'Tecido de algodão', outro: 'Outro',
};

export type PhysicalResult = 'conforme' | 'nao_conforme';
export const PHYSICAL_RESULT_LABEL: Record<PhysicalResult, string> = { conforme: 'Parâmetros conformes', nao_conforme: 'Parâmetros não conformes' };

export type IbControl = 'positivo' | 'negativo';
export const TEST_RESULT_LABEL: Record<TestResult, string> = { aprovado: 'Aprovado', reprovado: 'Reprovado', pendente: 'Em leitura' };
/** IB wording: an approved biological indicator is a negative (no growth) reading. */
export const IB_RESULT_LABEL: Record<TestResult, string> = { aprovado: 'Negativo (sem crescimento)', reprovado: 'Positivo (crescimento)', pendente: 'Em incubação' };
export const testResultLabel = (type: SterilizationTestType, r: TestResult) => (type === 'IB' ? IB_RESULT_LABEL[r] : TEST_RESULT_LABEL[r]);

/** Types recorded as a test row (the physical record comes from the cycle itself). */
export type RecordedTestType = Exclude<SterilizationTestType, 'REGISTRO_FISICO'>;
export const RECORDED_TEST_TYPES: RecordedTestType[] = ['BOWIE_DICK', 'IQ1', 'IQ2', 'IQ3', 'IQ4', 'IQ5', 'IQ6', 'IB'];
/** Bowie-Dick is an equipment test (one per sterilizer and day); the others belong to a load. */
export const testScope = (type: RecordedTestType): 'equipamento' | 'carga' => (type === 'BOWIE_DICK' ? 'equipamento' : 'carga');
export const isChemicalIndicator = (type: SterilizationTestType) => /^IQ[1-6]$/.test(type);

export interface TestRecordInput {
  type: RecordedTestType;
  result: TestResult;
  performedOn: IsoDate;
  indicatorLot: string | null;
  indicatorExpiry: IsoDate | null;
  /** IB only. */
  incubationStart?: string | null;
  readAt?: string | null;
  controlResult?: IbControl | null;
  /** Type of the sterilizer, to refuse a Bowie-Dick where it does not apply. */
  sterilizerType: SterilizerType;
}

export interface Problem { path: string; message: string }

export function checkTestRecord(t: TestRecordInput): Problem[] {
  const p: Problem[] = [];
  if (!t.indicatorLot?.trim()) p.push({ path: 'indicatorLot', message: 'Informe o lote do indicador.' });
  if (!t.indicatorExpiry) p.push({ path: 'indicatorExpiry', message: 'Informe a validade do indicador.' });
  else if (t.indicatorExpiry < t.performedOn) p.push({ path: 'indicatorExpiry', message: 'Indicador vencido na data do teste: o resultado não tem validade. Use outro lote.' });
  if (t.type === 'BOWIE_DICK' && !bowieDickApplies(t.sterilizerType)) p.push({ path: 'type', message: 'Bowie-Dick só se aplica a autoclaves a vapor com pré-vácuo.' });
  if (t.type !== 'IB') {
    if (t.result === 'pendente') p.push({ path: 'result', message: `${TEST_TYPE_LABEL[t.type]} tem leitura imediata: informe aprovado ou reprovado.` });
    return p;
  }
  if (!t.incubationStart) p.push({ path: 'incubationStart', message: 'Informe o início da incubação.' });
  if (t.result === 'pendente') return p;
  if (!t.readAt) p.push({ path: 'readAt', message: 'Informe a data e hora da leitura.' });
  else if (t.incubationStart && t.readAt < t.incubationStart) p.push({ path: 'readAt', message: 'A leitura não pode ser anterior ao início da incubação.' });
  if (!t.controlResult) p.push({ path: 'controlResult', message: 'Informe o resultado do indicador controle (não processado).' });
  else if (t.controlResult === 'negativo') p.push({ path: 'controlResult', message: 'Controle sem crescimento invalida a leitura: repita o teste com outro indicador.' });
  return p;
}

/** Release workflow. A released load can only be recalled (rejected) afterwards. */
export const LOAD_TRANSITIONS: Record<LoadStatus, LoadStatus[]> = {
  aguardando: ['liberada', 'retida', 'rejeitada', 'reprocessamento'],
  retida: ['liberada', 'rejeitada', 'reprocessamento'],
  liberada: ['rejeitada'],
  rejeitada: [],
  reprocessamento: [],
};

export const decisionLabel = (from: LoadStatus, to: LoadStatus): string =>
  from === 'liberada' && to === 'rejeitada' ? 'Recolhimento' : ({ liberada: 'Liberar', retida: 'Reter', rejeitada: 'Rejeitar', reprocessamento: 'Enviar para reprocessamento', aguardando: 'Aguardar' } as const)[to];

export function checkLoadDecision(from: LoadStatus, to: LoadStatus, evaluation: LoadReleaseEvaluation, justification: string): Problem[] {
  const p: Problem[] = [];
  if (!LOAD_TRANSITIONS[from].includes(to)) {
    p.push({ path: 'status', message: `Carga ${LOAD_STATUS_LABEL[from].toLowerCase()} não pode passar para ${LOAD_STATUS_LABEL[to].toLowerCase()}.` });
    return p;
  }
  if (to === 'liberada' && (!evaluation.policyApplied || evaluation.status !== 'liberada')) {
    p.push({ path: 'status', message: evaluation.policyApplied ? `A política não permite liberar: ${evaluation.reasons.join(' ')}` : 'Sem política de liberação configurada: a carga não pode ser liberada.' });
  }
  if (justification.trim().length < 10) p.push({ path: 'justification', message: 'Descreva o motivo (mínimo 10 caracteres).' });
  return p;
}

/** Sterility expiry by the institutional shelf life; null when no rule is configured. */
export const sterileUntil = (processedOn: IsoDate, shelfLifeDays: number | undefined): IsoDate | null =>
  shelfLifeDays == null ? null : addDays(processedOn, shelfLifeDays);

export interface ItemForUse { loadStatus: LoadStatus; expiresOn: IsoDate | null; alreadyUsed: boolean }

/** Why an item cannot be used on `usedOn` (empty when it can). */
export function checkItemUse(item: ItemForUse, usedOn: IsoDate): Problem[] {
  const p: Problem[] = [];
  if (item.loadStatus !== 'liberada') p.push({ path: 'labelCode', message: `Carga ${LOAD_STATUS_LABEL[item.loadStatus].toLowerCase()}: o material não pode ser usado.` });
  if (item.expiresOn && usedOn > item.expiresOn) p.push({ path: 'labelCode', message: `Esterilização vencida em ${item.expiresOn.split('-').reverse().join('/')}: reprocessar.` });
  if (item.alreadyUsed) p.push({ path: 'labelCode', message: 'Material já utilizado: precisa ser reprocessado antes de novo uso.' });
  return p;
}

/** Load code: sterilizer code, cycle date and the sequence of that sterilizer on the day. */
export const loadCode = (sterilizerCode: string, on: IsoDate, seq: number) => `${sterilizerCode.toUpperCase()}-${on.slice(2).replaceAll('-', '')}-${String(seq).padStart(2, '0')}`;
/** Label printed on each package; it is what the surgical team scans or types. */
export const itemLabel = (code: string, position: number) => `${code}-${String(position).padStart(2, '0')}`;
