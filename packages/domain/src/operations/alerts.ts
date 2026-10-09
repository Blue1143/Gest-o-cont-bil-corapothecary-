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
  | 'insumo_critico' | 'plano_acao_atrasado' | 'isc_contato_pendente'
  | 'cme_carga_recolhida' | 'cme_uso_sem_saida' | 'cme_liberada_com_falha' | 'cme_bowie_dick_reprovado' | 'cme_ib_leitura_atrasada' | 'cme_qualificacao';

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
  cme_carga_recolhida: 'Carga da CME recolhida após uso',
  cme_liberada_com_falha: 'Carga liberada com teste reprovado',
  cme_uso_sem_saida: 'Pacote usado sem saída registrada do CME',
  cme_bowie_dick_reprovado: 'Bowie-Dick reprovado com equipamento em uso',
  cme_ib_leitura_atrasada: 'Indicador biológico sem leitura no prazo',
  cme_qualificacao: 'Qualificação de equipamento da CME',
};
export const ALERT_PRIORITY_LABEL: Record<AlertPriority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = { aberto: 'Aberto', assumido: 'Assumido', encerrado: 'Encerrado' };

/** Who may see each kind of alert (besides alerts:view). */
export const ALERT_KIND_PERMISSION: Record<AlertKind, Permission> = {
  iras_investigacao_atrasada: 'iras:view', dispositivo_prolongado: 'patient:view', mdr_novo: 'micro:view', treinamento_vencido: 'quality:view',
  insumo_critico: 'quality:view', plano_acao_atrasado: 'quality:view', isc_contato_pendente: 'surgery:view',
  cme_carga_recolhida: 'cme:view', cme_liberada_com_falha: 'cme:view', cme_uso_sem_saida: 'cme:view', cme_bowie_dick_reprovado: 'cme:view', cme_ib_leitura_atrasada: 'cme:view', cme_qualificacao: 'cme:view',
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
  /**
   * An event (not a lasting condition): once an alert with this key is closed it is never
   * recreated, even after the suppression window, while the event is still recent.
   */
  oneShot?: boolean;
}

export interface AlertRules {
  investigationOverdueDays: number | undefined;
  deviceReviewDays: number | undefined;
  ibReadingHours?: number | undefined;
  qualificationWarningDays?: number | undefined;
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
  cme?: {
    /** Loads recalled (rejected after release) in the last days, with the exposure found. */
    recalledLoads: Array<{ loadId: string; code: string; surgeries: number; patients: number; sectorId: string }>;
    /** Packages used (surgery or sector) although the flow has no registered exit (transition period). */
    usesWithoutExit?: Array<{ useId: string; labelCode: string; processId: string; usedOn: IsoDate; sectorId: string }>;
    /** Released loads whose current tests now fail the policy (e.g. a positive IB read later). */
    releasedWithFailure: Array<{ loadId: string; code: string; reason: string; sectorId: string }>;
    /** Sterilizers still in use whose latest Bowie-Dick of the day failed. */
    failedBowieDick: Array<{ sterilizerId: string; name: string; sectorId: string }>;
    /** Pending biological indicators with the hours since incubation started. */
    pendingIb: Array<{ testId: string; loadId: string; loadCode: string; hours: number; sectorId: string }>;
    qualifications: Array<{ sterilizerId: string; name: string; dueOn: IsoDate; sectorId: string }>;
  };
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
    out.push({ kind: 'mdr_novo', oneShot: true, dedupKey: `mdr:${m.isolateId}`, priority: 'alta', title: `${m.organism} multirresistente`, detail: `Paciente ${m.patientLabel}, coleta em ${m.collectedOn.split('-').reverse().join('/')}. Verificar precauções conforme protocolo institucional.`, entity: 'isolate', entityId: m.isolateId, sectorId: m.sectorId, link: `/microbiologia/${m.cultureId}` });
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
  if (input.cme) {
    for (const l of input.cme.recalledLoads) {
      const exposure = l.surgeries ? `${l.patients} paciente(s) em ${l.surgeries} cirurgia(s) receberam material da carga: avaliar com a CCIH a necessidade de vigilância.` : 'Nenhum material desta carga foi registrado em uso.';
      out.push({ kind: 'cme_carga_recolhida', oneShot: true, dedupKey: `recolhe:${l.loadId}`, priority: l.surgeries ? 'alta' : 'media', title: `Carga ${l.code} recolhida`, detail: exposure, entity: 'sterilization_load', entityId: l.loadId, sectorId: l.sectorId, link: `/cme/cargas/${l.loadId}` });
    }
    for (const u of input.cme.usesWithoutExit ?? []) {
      out.push({ kind: 'cme_uso_sem_saida', oneShot: true, dedupKey: `semsaida:${u.useId}`, priority: 'media', title: `Pacote ${u.labelCode} usado sem saída do CME`, detail: `Uso em ${u.usedOn.split('-').reverse().join('/')}. Registre a distribuição na expedição para manter a trilha completa.`, entity: 'cme_process', entityId: u.processId, sectorId: u.sectorId, link: `/cme/processos/${u.processId}` });
    }
    for (const l of input.cme.releasedWithFailure) {
      out.push({ kind: 'cme_liberada_com_falha', dedupKey: `falha:${l.loadId}`, priority: 'alta', title: `Carga ${l.code} liberada com teste reprovado`, detail: `${l.reason} Avaliar o recolhimento dos pacotes e a exposição de pacientes.`, entity: 'sterilization_load', entityId: l.loadId, sectorId: l.sectorId, link: `/cme/cargas/${l.loadId}` });
    }
    for (const b of input.cme.failedBowieDick) {
      out.push({ kind: 'cme_bowie_dick_reprovado', dedupKey: `bd:${b.sterilizerId}:${input.today}`, priority: 'alta', title: `${b.name}: Bowie-Dick reprovado hoje`, detail: 'Bloquear o equipamento (manutenção) ou repetir o teste com aprovação antes de novas cargas.', entity: 'sterilizer', entityId: b.sterilizerId, sectorId: b.sectorId, link: '/cme/equipamentos' });
    }
    const limit = input.rules.ibReadingHours;
    if (limit != null) {
      for (const t of input.cme.pendingIb) {
        if (t.hours < limit) continue;
        out.push({ kind: 'cme_ib_leitura_atrasada', dedupKey: `ib:${t.testId}`, priority: 'media', title: `Carga ${t.loadCode}: indicador biológico sem leitura há ${Math.floor(t.hours)} h`, detail: `Prazo institucional: ${limit} h após o início da incubação.`, entity: 'sterilization_test', entityId: t.testId, sectorId: t.sectorId, link: `/cme/cargas/${t.loadId}` });
      }
    }
    const warn = input.rules.qualificationWarningDays;
    if (warn != null) {
      for (const q of input.cme.qualifications) {
        const days = dayDiff(input.today, q.dueOn);
        if (days > warn) continue;
        out.push({ kind: 'cme_qualificacao', dedupKey: `qualif:${q.sterilizerId}:${q.dueOn}`, priority: days < 0 ? 'alta' : 'baixa', title: days < 0 ? `${q.name}: qualificação vencida` : `${q.name}: qualificação vence em ${days} dia(s)`, detail: `Vencimento em ${q.dueOn.split('-').reverse().join('/')}.`, entity: 'sterilizer', entityId: q.sterilizerId, sectorId: q.sectorId, link: '/cme/equipamentos' });
      }
    }
  }
  return out;
}

export type FollowupMethod = 'telefone' | 'ambulatorio' | 'retorno' | 'mensagem' | 'outro';
export const FOLLOWUP_METHOD_LABEL: Record<FollowupMethod, string> = { telefone: 'Telefone', ambulatorio: 'Ambulatório', retorno: 'Retorno ao hospital', mensagem: 'Mensagem', outro: 'Outro' };
export type FollowupOutcome = 'sem_sinais' | 'suspeita' | 'nao_localizado';
export const FOLLOWUP_OUTCOME_LABEL: Record<FollowupOutcome, string> = { sem_sinais: 'Sem sinais de infecção', suspeita: 'Suspeita de ISC', nao_localizado: 'Paciente não localizado' };
