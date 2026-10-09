import type { ReactNode } from 'react';
import {
  LOAD_STATUS_LABEL, WOUND_CLASS_LABEL, formatDate,
  type LoadStatus, type ProphylaxisEvaluation, type RiskIndexResult, type Status, type WoundClass,
} from '@ccih/domain';
import { StatusBadge } from '../components/Basics';
import { LOAD_TONE } from './Cme';

export interface SurgeryBox {
  id: string;
  code: string;
  description: string;
  lot: string;
  cycle?: string;
  loadStatus: LoadStatus;
}

export interface SurgeryRecordProps {
  procedure: string;
  code?: string;
  patient?: { initials: string; recordNumber: string };
  date: string;
  room?: string;
  specialty?: string;
  surgeon?: string;
  woundClass?: WoundClass | null;
  asa?: number | null;
  durationMin?: number | null;
  p75Min?: number | null;
  risk: RiskIndexResult;
  prophylaxis?: { drug: string; dose?: string; minutesBeforeIncision?: number | null; durationHours?: number | null; redose?: boolean };
  prophylaxisEvaluation?: ProphylaxisEvaluation;
  boxes?: SurgeryBox[];
  surveillance: { end: string; days: number } | null;
  surveillanceOutcome?: 'em_vigilancia' | 'sem_isc' | 'isc_confirmada';
  hasImplant?: boolean;
  footer?: ReactNode;
}

const PROPHYLAXIS: Record<ProphylaxisEvaluation['result'], [Status, string]> = {
  conforme: ['ok', 'Profilaxia conforme'],
  nao_conforme: ['crit', 'Profilaxia não conforme'],
  incompleto: ['neutral', 'Profilaxia: dados incompletos'],
  nao_indicada: ['neutral', 'Profilaxia não indicada'],
  sem_regra: ['neutral', 'Sem regra institucional'],
};

const FACTOR_LABEL = { asa: 'ASA', woundClass: 'potencial de contaminação', duration: 'duração ou P75' } as const;

export function SurgeryRecord(p: SurgeryRecordProps) {
  const outcome = p.surveillanceOutcome ?? 'em_vigilancia';
  const outcomeBadge: [Status, string] =
    outcome === 'isc_confirmada' ? ['crit', 'ISC confirmada'] : outcome === 'sem_isc' ? ['ok', 'Vigilância encerrada sem ISC'] : p.surveillance ? ['info', `Em vigilância até ${formatDate(p.surveillance.end)}`] : ['neutral', 'Janela de vigilância não configurada'];
  const pe = p.prophylaxisEvaluation;
  return (
    <article className="ig-card" aria-label={`Cirurgia ${p.code ?? p.procedure}`}>
      <div className="ig-rec-head">
        <div>
          <span className="ig-label">Registro cirúrgico</span>
          <h3 className="ig-rec-name">{p.procedure}</h3>
          <div className="ig-row" style={{ marginTop: 4 }}>
            {p.code ? <span className="ig-mono">{p.code}</span> : null}
            {p.patient ? <span className="ig-muted ig-small">{p.patient.initials} · <span className="ig-mono">{p.patient.recordNumber}</span></span> : null}
          </div>
        </div>
        <StatusBadge status={outcomeBadge[0]}>{outcomeBadge[1]}</StatusBadge>
      </div>
      <dl className="ig-facts">
        <div><dt>Data</dt><dd>{formatDate(p.date)}</dd></div>
        <div><dt>Sala / especialidade</dt><dd>{[p.room, p.specialty].filter(Boolean).join(' · ') || '—'}</dd></div>
        {p.surgeon ? <div><dt>Cirurgião</dt><dd>{p.surgeon}</dd></div> : null}
        <div><dt>Potencial de contaminação</dt><dd>{p.woundClass ? WOUND_CLASS_LABEL[p.woundClass] : '—'}</dd></div>
        <div><dt>ASA</dt><dd className="ig-num">{p.asa != null ? `ASA ${p.asa}` : '—'}</dd></div>
        <div><dt>Duração / P75</dt><dd className="ig-num">{p.durationMin != null ? `${p.durationMin} min` : '—'}{p.p75Min != null ? ` / ${p.p75Min} min` : ''}</dd></div>
        <div>
          <dt>Índice de risco (IRIC)</dt>
          <dd className="ig-row" style={{ gap: 8 }}>
            <span className="ig-risk" aria-hidden="true">
              {[0, 1, 2].map((k) => <i key={k} className={k < p.risk.score ? 'on' : undefined} />)}
            </span>
            <b className="ig-num">{p.risk.score} de 3</b>
            {!p.risk.complete ? (
              <StatusBadge status="neutral">Incompleto: falta {p.risk.missing.map((f) => FACTOR_LABEL[f]).join(', ')}</StatusBadge>
            ) : null}
          </dd>
        </div>
      </dl>
      {p.prophylaxis ? (
        <div className="ig-section">
          <span className="ig-label">Antibioticoprofilaxia</span>
          <div className="ig-row" style={{ justifyContent: 'space-between' }}>
            <span>
              <b>{p.prophylaxis.drug}</b>{p.prophylaxis.dose ? ` ${p.prophylaxis.dose}` : ''}
              <span className="ig-muted ig-small">
                {p.prophylaxis.minutesBeforeIncision != null ? ` · ${p.prophylaxis.minutesBeforeIncision} min antes da incisão` : ' · horário não informado'}
                {p.prophylaxis.durationHours != null ? ` · duração ${p.prophylaxis.durationHours} h` : ''}
                {p.prophylaxis.redose ? ' · redose realizada' : ''}
              </span>
            </span>
            {pe ? <StatusBadge status={PROPHYLAXIS[pe.result][0]}>{PROPHYLAXIS[pe.result][1]}</StatusBadge> : null}
          </div>
          {pe?.reasons.length ? <ul className="ig-card-sub" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{pe.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
        </div>
      ) : null}
      {p.boxes?.length ? (
        <div className="ig-section">
          <span className="ig-label">Materiais e caixas cirúrgicas (rastreabilidade)</span>
          <ul className="ig-list">
            {p.boxes.map((b) => (
              <li key={b.id}>
                <span><span className="ig-mono">{b.code}</span> {b.description}</span>
                <span className="ig-row" style={{ gap: 8 }}>
                  <span className="ig-mono ig-muted">Lote {b.lot}{b.cycle ? ` · Ciclo ${b.cycle}` : ''}</span>
                  <StatusBadge status={LOAD_TONE[b.loadStatus]}>Carga {LOAD_STATUS_LABEL[b.loadStatus].toLowerCase()}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ig-card-foot">
        {p.surveillance
          ? `Vigilância pós-operatória de ${p.surveillance.days} dias${p.hasImplant ? ' (com implante)' : ''}, até ${formatDate(p.surveillance.end)} — prazo configurado pela instituição.`
          : 'Prazo de vigilância pós-operatória não configurado pela instituição.'}
      </p>
      {p.footer ? <div className="ig-section ig-row">{p.footer}</div> : null}
    </article>
  );
}
