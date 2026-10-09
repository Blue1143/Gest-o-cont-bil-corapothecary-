import { dayDiff, type IsoDate } from '../dates';
import type { Permission } from '../permissions';
import type { StockEvaluation } from '../rules/operations';

/**
 * Alert center. Candidates are derived from the records with institutional thresholds; the API
 * deduplicates them by key (one open alert per key) and suppresses re-creation for a configured
 * period after closure, to limit alert fatigue. Training alerts are aggregated per training and sector.
 */
export type AlertKind =
  | 'iras_investigacao_atrasada' | 'dispositivo_prolongado' | 'mdr_novo' | 'treinamento_vencido'
  | 'insumo_critico' | 'plano_acao_atrasado' | 'isc_contato_pendente';

export type AlertPriority = 'alta' | 'media' | 'baixa';
export type AlertStatus = 'aberto' | 'assumido' | 'encerrado';

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  iras_investigacao_atrasada: 'Investigação de IRAS sem conclusão',
  dispositivo_prolongado: 'Dispositivo em uso prolongado',
  mdr_novo: 'Novo microrganismo multirresistente',
  treinamento_vencido: 'Treinamento obrigatório vencido ou pendente',
  insumo_critico: 'Insumo em situação crítica',
  plano_acao_atrasado: 'Ação de plano 5W2H atrasada',
  isc_contato_pendente: 'Vigilância pós-alta de ISC sem contato',
};
export const ALERT_PRIORITY_LABEL: Record<AlertPriority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = { aberto: 'Aberto', assumido: 'Assumido', encerrado: 'Encerrado' };

/** Who may see each kind of alert (besides alerts:view). */
export const ALERT_KIND_PERMISSION: Record<AlertKind, Permission> = {
  iras_investigacao_atrasada: 'iras:view', dispositivo_prolongado: 'patient:view', mdr_novo: 'micro:view', treinamento_vencido: 'quality:view',
  insumo_critico: 'quality:view', plano_acao_atrasado: 'quality:view', isc_contato_pendente: 'surgery:view',
};

export interface AlertCandidate {
  kind: AlertKind;
  dedupKey: string;
  priority: AlertPriority;
  title: string;
  detail: string;
  entity: string;
  entityId: string | null;
  sectorId: string | null;
  /** Screen where the alert is handled. */
  link: string | null;
}

export interface AlertRules {
  investigationOverdueDays: number | undefined;
  deviceReviewDays: number | undefined;
}

export interface AlertInput {
  today: IsoDate;
  rules: AlertRules;
  openCases: Array<{ id: string; typeLabel: string; patientLabel: string; openedOn: IsoDate; sectorId: string }>;
  openDevices: Array<{ id: string; type: string; patientId: string; patientLabel: string; insertedOn: IsoDate; sectorId: string | null }>;
  newMdr: Array<{ isolateId: string; cultureId: string; organism: string; patientLabel: string; sectorId: string; collectedOn: IsoDate }>;
  trainingGaps: Array<{ trainingId: string; trainingTitle: string; sectorId: string; overdue: number }>;
  supplies: Array<{ id: string; name: string; evaluation: StockEvaluation }>;
  overdueActions: Array<{ id: string; ncId: string; what: string; dueOn: IsoDate; sectorId: string | null }>;
  pendingFollowups: Array<{ surgeryId: string; procedure: string; patientLabel: string; windowEnd: IsoDate }>;
}

export function buildAlertCandidates(input: AlertInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { investigationOverdueDays: overdue, deviceReviewDays: review } = input.rules;
  if (overdue != null) {
    for (const c of input.openCases) {
      const days = dayDiff(c.openedOn, input.today);
      if (days >= overdue) out.push({ kind: 'iras_investigacao_atrasada', dedupKey: `iras:${c.id}`, priority: 'alta', title: `${c.typeLabel} em aberto há ${days} dias`, detail: `Paciente ${c.patientLabel}. Limite institucional: ${overdue} dias.`, entity: 'iras_case', entityId: c.id, sectorId: c.sectorId, link: `/vigilancia/${c.id}` });
    }
  }
  if (review != null) {
    for (const d of input.openDevices) {
      const day = dayDiff(d.insertedOn, input.today) + 1;
      if (day > review) out.push({ kind: 'dispositivo_prolongado', dedupKey: `disp:${d.id}`, priority: 'media', title: `${d.type} em D${day}: reavaliar indicação`, detail: `Paciente ${d.patientLabel}. Revisão configurada a partir de D${review + 1}.`, entity: 'device_use', entityId: d.id, sectorId: d.sectorId, link: `/pacientes/${d.patientId}` });
    }
  }
  for (const m of input.newMdr) {
    out.push({ kind: 'mdr_novo', dedupKey: `mdr:${m.isolateId}`, priority: 'alta', title: `${m.organism} multirresistente`, detail: `Paciente ${m.patientLabel}, coleta em ${m.collectedOn.split('-').reverse().join('/')}. Verificar precauções conforme protocolo institucional.`, entity: 'isolate', entityId: m.isolateId, sectorId: m.sectorId, link: `/microbiologia/${m.cultureId}` });
  }
  for (const t of input.trainingGaps) {
    if (t.overdue <= 0) continue;
    out.push({ kind: 'treinamento_vencido', dedupKey: `trein:${t.trainingId}:${t.sectorId}`, priority: 'baixa', title: `${t.trainingTitle}: ${t.overdue} profissional(is) sem treinamento válido`, detail: 'Inclui pendentes e vencidos do setor.', entity: 'training', entityId: t.trainingId, sectorId: t.sectorId, link: '/treinamentos' });
  }
  for (const s of input.supplies) {
    if (s.evaluation.status !== 'crit') continue;
    out.push({ kind: 'insumo_critico', dedupKey: `insumo:${s.id}:${s.evaluation.label}`, priority: s.evaluation.coverage === 'indisponivel' ? 'alta' : 'media', title: `${s.name}: ${s.evaluation.label}`, detail: s.evaluation.coverageDays != null ? `Cobertura estimada de ${Math.floor(s.evaluation.coverageDays)} dia(s).` : 'Sem consumo registrado nos últimos 30 dias.', entity: 'supply', entityId: s.id, sectorId: null, link: '/insumos' });
  }
  for (const a of input.overdueActions) {
    out.push({ kind: 'plano_acao_atrasado', dedupKey: `acao:${a.id}`, priority: 'media', title: `Ação atrasada: ${a.what.slice(0, 80)}`, detail: `Prazo ${a.dueOn.split('-').reverse().join('/')}.`, entity: 'action_plan', entityId: a.id, sectorId: a.sectorId, link: `/auditorias/nao-conformidades/${a.ncId}` });
  }
  for (const f of input.pendingFollowups) {
    out.push({ kind: 'isc_contato_pendente', dedupKey: `isc:${f.surgeryId}`, priority: 'baixa', title: `${f.procedure}: sem contato pós-alta`, detail: `Paciente ${f.patientLabel}. Janela de vigilância até ${f.windowEnd.split('-').reverse().join('/')}.`, entity: 'surgery', entityId: f.surgeryId, sectorId: null, link: `/cirurgias/${f.surgeryId}` });
  }
  return out;
}

export type FollowupMethod = 'telefone' | 'ambulatorio' | 'retorno' | 'mensagem' | 'outro';
export const FOLLOWUP_METHOD_LABEL: Record<FollowupMethod, string> = { telefone: 'Telefone', ambulatorio: 'Ambulatório', retorno: 'Retorno ao hospital', mensagem: 'Mensagem', outro: 'Outro' };
export type FollowupOutcome = 'sem_sinais' | 'suspeita' | 'nao_localizado';
export const FOLLOWUP_OUTCOME_LABEL: Record<FollowupOutcome, string> = { sem_sinais: 'Sem sinais de infecção', suspeita: 'Suspeita de ISC', nao_localizado: 'Paciente não localizado' };
