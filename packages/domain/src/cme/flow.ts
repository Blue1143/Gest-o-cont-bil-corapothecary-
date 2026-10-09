import type { IsoDate } from '../dates';
import type { LoadStatus } from '../rules/sterilization';

/**
 * CME processing flow, from the reception of contaminated material to distribution and return.
 * A process is one reprocessing round of an asset (or of loose material). Every scan is decided
 * here — the API records the decision, refused or not, and only accepted scans move the process.
 * A well-formed code never authorizes a movement by itself.
 */
export type ProcessStep =
  | 'recepcao' | 'limpeza' | 'inspecao' | 'preparo' | 'embalagem' | 'esterilizacao' | 'liberacao'
  | 'armazenamento' | 'separacao' | 'distribuicao' | 'devolucao';

export const PROCESS_STEPS: ProcessStep[] = ['recepcao', 'limpeza', 'inspecao', 'preparo', 'embalagem', 'esterilizacao', 'liberacao', 'armazenamento', 'separacao', 'distribuicao', 'devolucao'];

export const PROCESS_STEP_LABEL: Record<ProcessStep, string> = {
  recepcao: 'Recepção de material contaminado', limpeza: 'Limpeza', inspecao: 'Inspeção', preparo: 'Preparo e montagem', embalagem: 'Embalagem',
  esterilizacao: 'Montagem da carga e esterilização', liberacao: 'Avaliação e liberação da carga', armazenamento: 'Armazenamento',
  separacao: 'Separação e conferência', distribuicao: 'Distribuição e saída do CME', devolucao: 'Devolução',
};

/** Steps registered by scanning at a station (the release is a load decision, not a scan). */
export const SCANNABLE_STEPS: ProcessStep[] = PROCESS_STEPS.filter((s) => s !== 'liberacao');

export type ProcessState = 'em_processo' | 'bloqueado' | 'liberado' | 'distribuido' | 'devolvido' | 'encerrado' | 'descartado';
export const PROCESS_STATE_LABEL: Record<ProcessState, string> = {
  em_processo: 'Em processamento', bloqueado: 'Bloqueado', liberado: 'Liberado no CME', distribuido: 'Distribuído', devolvido: 'Devolvido para reprocessamento', encerrado: 'Encerrado', descartado: 'Descartado',
};
export const OPEN_STATES: ProcessState[] = ['em_processo', 'bloqueado', 'liberado', 'distribuido'];

export type ScanResult =
  | 'aceita' | 'codigo_desconhecido' | 'etapa_incorreta' | 'duplicada' | 'bloqueado' | 'carga_nao_liberada'
  | 'destino_incompativel' | 'requer_conferencia' | 'estacao_invalida' | 'excecao_autorizada';

export const SCAN_RESULT_LABEL: Record<ScanResult, string> = {
  aceita: 'Leitura aceita', codigo_desconhecido: 'Código desconhecido', etapa_incorreta: 'Etapa incorreta', duplicada: 'Leitura duplicada', bloqueado: 'Material bloqueado',
  carga_nao_liberada: 'Carga não liberada', destino_incompativel: 'Destino incompatível', requer_conferencia: 'Requer conferência manual autorizada',
  estacao_invalida: 'Estação não autorizada', excecao_autorizada: 'Exceção autorizada',
};

/** Only sequence problems can be overridden (with permission, reason and audit). Safety blocks never. */
export const OVERRIDABLE: ScanResult[] = ['etapa_incorreta', 'destino_incompativel'];

export type InputMethod = 'leitor' | 'camera' | 'manual';
export const INPUT_METHOD_LABEL: Record<InputMethod, string> = { leitor: 'Leitor de código de barras', camera: 'Câmera', manual: 'Conferência manual no sistema' };

export type InspectionOutcome = 'aprovado' | 'relimpeza' | 'descarte';
export const INSPECTION_OUTCOME_LABEL: Record<InspectionOutcome, string> = { aprovado: 'Aprovado', relimpeza: 'Reprovado — volta para limpeza', descarte: 'Reprovado — descarte' };
export type ReturnOutcome = 'retorno_estoque' | 'reprocessar';
export const RETURN_OUTCOME_LABEL: Record<ReturnOutcome, string> = { retorno_estoque: 'Íntegro e não usado — volta ao estoque', reprocessar: 'Encaminhar para reprocessamento' };

export interface FlowConfig { storageRequired: boolean; separationRequired: boolean }

export interface PackageState {
  loadStatus: LoadStatus;
  /** The cycle has started (a load "em montagem" has not). */
  cycleStarted: boolean;
  expiresOn: IsoDate | null;
  /** Released and later rejected. */
  recalled: boolean;
}

export interface ProcessSnapshot {
  /** An open process exists for the scanned asset/process/package. */
  open: boolean;
  lastStep: ProcessStep | null;
  state: ProcessState | null;
  /** Steps accepted next, as stored after the previous accepted scan. */
  nextSteps: ProcessStep[];
  package: PackageState | null;
  /** Destination chosen at separation (the exit must match it). */
  plannedDestinationId: string | null;
  /** Asset in maintenance or retired. */
  assetBlocked: string | null;
}

export interface ScanRequest {
  step: ProcessStep;
  /** Step result where the step has one (inspection, return). */
  outcome?: string | null;
  destinationId?: string | null;
  today: IsoDate;
}

export interface ScanDecision {
  result: ScanResult;
  message: string;
  /** Present when accepted: the new step, state and allowed next steps. */
  apply?: { step: ProcessStep; state: ProcessState; nextSteps: ProcessStep[]; closes: boolean; opens: boolean };
}

const POST_RELEASE: ProcessStep[] = ['armazenamento', 'separacao', 'distribuicao'];

/** Steps allowed after `from` among storage, separation and exit, skipping optional ones. */
export function postReleaseSteps(config: FlowConfig, from: ProcessStep | null): ProcessStep[] {
  const required = (s: ProcessStep) => s === 'distribuicao' || (s === 'armazenamento' && config.storageRequired) || (s === 'separacao' && config.separationRequired);
  const start = from && POST_RELEASE.includes(from) ? POST_RELEASE.indexOf(from) + 1 : 0;
  const out: ProcessStep[] = [];
  for (const s of POST_RELEASE.slice(start)) {
    out.push(s);
    if (required(s)) break;
  }
  return out;
}

const label = (s: ProcessStep) => PROCESS_STEP_LABEL[s];
const list = (steps: ProcessStep[]) => steps.map(label).join(' ou ');

function packageProblem(pkg: PackageState | null, today: IsoDate): ScanDecision | null {
  if (!pkg) return { result: 'requer_conferencia', message: 'Material sem pacote estéril vinculado: confira a carga.' };
  if (pkg.recalled) return { result: 'bloqueado', message: 'Carga recolhida: o pacote não pode circular. Encaminhe para reprocessamento.' };
  if (pkg.loadStatus === 'rejeitada' || pkg.loadStatus === 'reprocessamento') return { result: 'bloqueado', message: 'Carga rejeitada: o pacote não pode circular. Encaminhe para reprocessamento.' };
  if (pkg.loadStatus !== 'liberada') return { result: 'carga_nao_liberada', message: pkg.cycleStarted ? 'Carga ainda não liberada.' : 'Carga em montagem: o ciclo ainda não foi realizado.' };
  if (pkg.expiresOn && today > pkg.expiresOn) return { result: 'bloqueado', message: `Esterilização vencida em ${pkg.expiresOn.split('-').reverse().join('/')}: encaminhe para reprocessamento.` };
  return null;
}

export function decideScan(p: ProcessSnapshot, req: ScanRequest, config: FlowConfig): ScanDecision {
  const { step } = req;
  if (step === 'liberacao') return { result: 'etapa_incorreta', message: 'A liberação é uma decisão da carga, registrada na tela da carga.' };
  if (p.assetBlocked && step === 'recepcao') return { result: 'bloqueado', message: p.assetBlocked };

  if (step === 'recepcao') {
    // Packages of a rejected or recalled load go back to the start of the flow.
    const rejected = !!p.package && (p.package.recalled || p.package.loadStatus === 'rejeitada' || p.package.loadStatus === 'reprocessamento');
    if (p.open && p.state !== 'distribuido' && !rejected) {
      if (p.lastStep === 'recepcao') return { result: 'duplicada', message: 'Recepção já registrada para este material.' };
      return { result: 'etapa_incorreta', message: `Material já está em processamento (${p.lastStep ? label(p.lastStep) : 'sem etapa'}). Registre a devolução antes de uma nova recepção.` };
    }
    // A distributed (used) package returning dirty closes the previous round and opens a new one.
    return { result: 'aceita', message: 'Recepção registrada.', apply: { step, state: 'em_processo', nextSteps: ['limpeza'], closes: p.open, opens: true } };
  }

  if (!p.open) return { result: 'etapa_incorreta', message: 'Material sem recepção registrada na CME.' };
  if (p.state === 'bloqueado') return { result: 'bloqueado', message: 'Processo bloqueado: trate a pendência antes de continuar.' };
  if (p.lastStep === step && step !== 'devolucao') return { result: 'duplicada', message: `${label(step)} já registrada para este material.` };

  // After sterilization the allowed steps depend on the load decision, not on a stored list.
  const afterSterilization = p.lastStep === 'esterilizacao' || (p.lastStep === 'devolucao' && p.state === 'liberado');
  // A package still in the CME (e.g. expired in storage) can always be sent back to reprocessing.
  const allowed = [...(afterSterilization ? postReleaseSteps(config, null) : p.nextSteps), ...(p.state === 'liberado' ? ['devolucao' as const] : [])];
  if (POST_RELEASE.includes(step)) {
    const problem = packageProblem(p.package, req.today);
    if (problem) return problem;
  }
  if (!allowed.includes(step)) {
    const later = PROCESS_STEPS.indexOf(step) > PROCESS_STEPS.indexOf(allowed[0] ?? step);
    return { result: 'etapa_incorreta', message: allowed.length ? `${later ? 'Etapa obrigatória pendente' : 'Etapa esperada'}: ${list(allowed)}.` : 'Nenhuma etapa disponível para este material agora.' };
  }

  switch (step) {
    case 'limpeza': return { result: 'aceita', message: 'Limpeza registrada.', apply: { step, state: 'em_processo', nextSteps: ['inspecao'], closes: false, opens: false } };
    case 'inspecao': {
      const o = req.outcome as InspectionOutcome | undefined;
      if (o === 'relimpeza') return { result: 'aceita', message: 'Inspeção reprovada: material volta para a limpeza.', apply: { step, state: 'em_processo', nextSteps: ['limpeza'], closes: false, opens: false } };
      if (o === 'descarte') return { result: 'aceita', message: 'Inspeção reprovada: material descartado.', apply: { step, state: 'descartado', nextSteps: [], closes: true, opens: false } };
      if (o !== 'aprovado') return { result: 'requer_conferencia', message: 'Informe o resultado da inspeção.' };
      return { result: 'aceita', message: 'Inspeção aprovada.', apply: { step, state: 'em_processo', nextSteps: ['preparo'], closes: false, opens: false } };
    }
    case 'preparo': return { result: 'aceita', message: 'Preparo e montagem registrados.', apply: { step, state: 'em_processo', nextSteps: ['embalagem'], closes: false, opens: false } };
    case 'embalagem': return { result: 'aceita', message: 'Embalagem registrada.', apply: { step, state: 'em_processo', nextSteps: ['esterilizacao'], closes: false, opens: false } };
    case 'esterilizacao': return { result: 'aceita', message: 'Pacote incluído na carga.', apply: { step, state: 'em_processo', nextSteps: [], closes: false, opens: false } };
    case 'armazenamento': return { result: 'aceita', message: 'Armazenamento registrado.', apply: { step, state: 'liberado', nextSteps: postReleaseSteps(config, 'armazenamento'), closes: false, opens: false } };
    case 'separacao':
      if (!req.destinationId) return { result: 'requer_conferencia', message: 'Informe o setor de destino da separação.' };
      return { result: 'aceita', message: 'Separação conferida.', apply: { step, state: 'liberado', nextSteps: ['distribuicao'], closes: false, opens: false } };
    case 'distribuicao':
      if (!req.destinationId) return { result: 'requer_conferencia', message: 'Informe o setor de destino.' };
      if (p.plannedDestinationId && p.plannedDestinationId !== req.destinationId) return { result: 'destino_incompativel', message: 'Destino diferente do conferido na separação.' };
      return { result: 'aceita', message: 'Saída do CME registrada.', apply: { step, state: 'distribuido', nextSteps: ['devolucao'], closes: false, opens: false } };
    case 'devolucao': {
      const o = req.outcome as ReturnOutcome | undefined;
      if (o === 'reprocessar') return { result: 'aceita', message: 'Devolução registrada: material encaminhado para reprocessamento.', apply: { step, state: 'devolvido', nextSteps: [], closes: true, opens: false } };
      if (o !== 'retorno_estoque') return { result: 'requer_conferencia', message: 'Informe a condição do material devolvido.' };
      if (p.state === 'liberado') return { result: 'etapa_incorreta', message: 'O pacote já está no estoque do CME.' };
      const problem = packageProblem(p.package, req.today);
      if (problem) return { ...problem, message: `${problem.message} Não pode voltar ao estoque.` };
      return { result: 'aceita', message: 'Devolução registrada: pacote volta ao estoque.', apply: { step, state: 'liberado', nextSteps: postReleaseSteps(config, null), closes: false, opens: false } };
    }
    default: return { result: 'etapa_incorreta', message: 'Etapa não reconhecida.' };
  }
}

/** Whether a load can receive packages (assembly happens before the cycle starts). */
export function checkAssembly(load: { cycleStarted: boolean; status: LoadStatus; sterilizerActive: boolean }): string | null {
  if (load.cycleStarted) return 'O ciclo desta carga já começou: monte outra carga.';
  if (load.status !== 'aguardando') return 'Carga encerrada: monte outra carga.';
  if (!load.sterilizerActive) return 'Equipamento bloqueado ou inativo.';
  return null;
}

/**
 * Authorized exception: re-decides a sequence problem as if the requested step were expected.
 * Safety checks (load not released, recall, expiry, blocked asset, duplicates) still apply.
 */
export function decideOverride(p: ProcessSnapshot, req: ScanRequest, config: FlowConfig): ScanDecision {
  const first = decideScan(p, req, config);
  if (!OVERRIDABLE.includes(first.result)) return first;
  const forced = decideScan({ ...p, lastStep: p.lastStep === req.step ? p.lastStep : null, nextSteps: [req.step], plannedDestinationId: null }, req, config);
  if (forced.result !== 'aceita') return forced;
  return { ...forced, result: 'excecao_autorizada', message: `Exceção autorizada (${first.message}) ${forced.message}` };
}
