/**
 * CME load release. The policy is institutional configuration; this module only applies it and
 * explains the decision. Results never change silently: the API stores every decision in the
 * audit log.
 */
export type TestResult = 'aprovado' | 'reprovado' | 'pendente';

/** Chemical indicator classes 1–6 (ISO 11140-1) plus biological indicator and physical record. */
export type SterilizationTestType = 'BOWIE_DICK' | 'IQ1' | 'IQ2' | 'IQ3' | 'IQ4' | 'IQ5' | 'IQ6' | 'IB' | 'REGISTRO_FISICO';

export const TEST_TYPE_LABEL: Record<SterilizationTestType, string> = {
  BOWIE_DICK: 'Bowie-Dick',
  IQ1: 'Indicador químico classe 1',
  IQ2: 'Indicador químico classe 2',
  IQ3: 'Indicador químico classe 3',
  IQ4: 'Indicador químico classe 4',
  IQ5: 'Indicador químico classe 5',
  IQ6: 'Indicador químico classe 6',
  IB: 'Indicador biológico',
  REGISTRO_FISICO: 'Registro físico do ciclo',
};

export type LoadStatus = 'aguardando' | 'liberada' | 'retida' | 'rejeitada' | 'reprocessamento';

export const LOAD_STATUS_LABEL: Record<LoadStatus, string> = {
  aguardando: 'Aguardando',
  liberada: 'Liberada',
  retida: 'Retida',
  rejeitada: 'Rejeitada',
  reprocessamento: 'Em reprocessamento',
};

export interface LoadReleasePolicy {
  /** Tests that every load must pass to be released. */
  requiredLoadTests: SterilizationTestType[];
  /** Equipment test required on the same day before any load of a pre-vacuum sterilizer. */
  requireDailyBowieDick: boolean;
  /** Loads with implantable items wait for the biological indicator reading. */
  holdImplantsUntilBiological: boolean;
  /** Reference id backing the policy (validated by the institution). */
  referenceId: string | null;
}

export interface LoadTest {
  type: SterilizationTestType;
  result: TestResult;
}

export interface LoadForRelease {
  tests: LoadTest[];
  hasImplant: boolean;
  /** Same-day Bowie-Dick result of the sterilizer; undefined when not performed. */
  equipmentBowieDick?: TestResult;
  /** False for sterilizers where the Bowie-Dick test does not apply (only pre-vacuum steam). */
  bowieDickApplies?: boolean;
  /** A decision a person already registered (e.g. sent to reprocessing). Kept as is. */
  manualStatus?: Extract<LoadStatus, 'reprocessamento' | 'rejeitada'>;
}

export interface LoadReleaseEvaluation {
  status: LoadStatus;
  reasons: string[];
  /** False when no policy is configured: the system shows the data but makes no decision. */
  policyApplied: boolean;
}

export function evaluateLoadRelease(load: LoadForRelease, policy: LoadReleasePolicy | undefined): LoadReleaseEvaluation {
  if (load.manualStatus) {
    return { status: load.manualStatus, reasons: ['Decisão registrada manualmente pelo responsável da CME.'], policyApplied: !!policy };
  }
  if (!policy) {
    return { status: 'aguardando', reasons: ['Regra de liberação de carga não configurada pela instituição.'], policyApplied: false };
  }
  const resultOf = (type: SterilizationTestType) => load.tests.find((t) => t.type === type)?.result;
  const failed: string[] = [];
  const pending: string[] = [];

  if (policy.requireDailyBowieDick && load.bowieDickApplies !== false) {
    if (load.equipmentBowieDick === 'reprovado') failed.push('Bowie-Dick do equipamento reprovado no dia.');
    else if (load.equipmentBowieDick !== 'aprovado') pending.push('Bowie-Dick do dia não registrado.');
  }
  for (const type of policy.requiredLoadTests) {
    const r = resultOf(type);
    if (r === 'reprovado') failed.push(`${TEST_TYPE_LABEL[type]} reprovado.`);
    else if (r !== 'aprovado') pending.push(`${TEST_TYPE_LABEL[type]} ${r === 'pendente' ? 'em leitura' : 'não registrado'}.`);
  }
  const anyFailedOptional = load.tests.some((t) => t.result === 'reprovado' && !policy.requiredLoadTests.includes(t.type));
  if (anyFailedOptional) failed.push('Teste adicional reprovado.');

  if (failed.length) return { status: 'rejeitada', reasons: failed, policyApplied: true };

  if (load.hasImplant && policy.holdImplantsUntilBiological && resultOf('IB') !== 'aprovado') {
    return { status: 'retida', reasons: ['Carga com implantável aguardando resultado do indicador biológico.', ...pending], policyApplied: true };
  }
  if (pending.length) return { status: 'aguardando', reasons: pending, policyApplied: true };
  return { status: 'liberada', reasons: [], policyApplied: true };
}
