import type { ReactNode } from 'react';
import { INVESTIGATION_STATUS_LABEL, formatDate, type DeviceAssociation, type InvestigationStatus, type IrasType, type Status } from '@ccih/domain';
import { cx } from '../lib/util';
import { InfectionTag, StatusBadge } from '../components/Basics';

export interface PatientDevice {
  id: string;
  type: string;
  site?: string;
  /** Current device day (D1 = insertion), null when removed. */
  day: number | null;
  association: DeviceAssociation;
}

export type CultureResult = 'positiva' | 'negativa' | 'pendente' | 'contaminacao';

export interface PatientCulture {
  id: string;
  material: string;
  collectedOn: string;
  result: CultureResult;
  organism?: string;
  /** Epidemiological profile, e.g. "MDR · KPC". */
  profile?: string;
}

export interface PatientIras {
  id: string;
  type: IrasType;
  eventDate: string;
  criterion?: string;
  status: InvestigationStatus;
}

export interface PatientRecordProps {
  initials: string;
  recordNumber: string;
  age?: number | null;
  sex?: string | null;
  sector?: string;
  bed?: string;
  admittedOn?: string;
  lengthOfStayDays?: number | null;
  precaution?: string | null;
  devices?: PatientDevice[];
  cultures?: PatientCulture[];
  iras?: PatientIras[];
  /** Explains the configured device-association rule (or its absence). */
  deviceRuleNote?: ReactNode;
  footer?: ReactNode;
}

const CULTURE: Record<CultureResult, [Status, string]> = {
  positiva: ['crit', 'Positiva'],
  negativa: ['ok', 'Negativa'],
  pendente: ['neutral', 'Pendente'],
  contaminacao: ['warn', 'Provável contaminação'],
};

const INVESTIGATION_TONE: Record<InvestigationStatus, Status> = {
  suspeita: 'warn',
  em_investigacao: 'warn',
  confirmada: 'crit',
  descartada: 'neutral',
};

export function PatientRecord(p: PatientRecordProps) {
  return (
    <article className="ig-card" aria-label={`Prontuário ${p.recordNumber}`}>
      <div className="ig-rec-head">
        <div>
          <span className="ig-label">Prontuário</span>
          <h3 className="ig-rec-name">{p.initials}</h3>
          <div className="ig-row" style={{ marginTop: 4 }}>
            <span className="ig-mono">{p.recordNumber}</span>
            <span className="ig-muted ig-small">{[p.age != null ? `${p.age} anos` : null, p.sex].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        {p.precaution ? <StatusBadge status="warn">Precaução de {p.precaution}</StatusBadge> : <StatusBadge status="neutral">Precaução padrão</StatusBadge>}
      </div>
      <dl className="ig-facts">
        <div><dt>Setor</dt><dd>{p.sector ?? '—'}</dd></div>
        <div><dt>Leito</dt><dd>{p.bed ?? '—'}</dd></div>
        <div><dt>Admissão</dt><dd>{formatDate(p.admittedOn)}</dd></div>
        <div><dt>Internação</dt><dd className="ig-num">{p.lengthOfStayDays != null ? `${p.lengthOfStayDays} dias` : '—'}</dd></div>
      </dl>
      {p.devices?.length ? (
        <div className="ig-section">
          <span className="ig-label">Dispositivos invasivos — dia de uso</span>
          <ul className="ig-devices" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {p.devices.map((d) => {
              const tone = d.day == null ? 'neutral' : d.association === 'elegivel' ? 'info' : 'neutral';
              return (
                <li key={d.id} className="ig-device">
                  <b>{d.type}</b>
                  {d.site ? <span className="ig-muted">{d.site}</span> : null}
                  <span className={cx('ig-days', `ig-tone-${tone}`)}>
                    {d.day == null ? 'retirado' : `D${d.day}`}
                    {d.association === 'elegivel' && d.day != null ? <span className="ig-sr-only"> — elegível para IRAS associada ao dispositivo</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {p.deviceRuleNote ? <p className="ig-card-sub" style={{ marginTop: 8 }}>{p.deviceRuleNote}</p> : null}
        </div>
      ) : null}
      {p.cultures?.length ? (
        <div className="ig-section">
          <span className="ig-label">Culturas e exames</span>
          <ul className="ig-list">
            {p.cultures.map((c) => {
              const [tone, label] = CULTURE[c.result];
              return (
                <li key={c.id}>
                  <span>
                    <b>{c.material}</b>
                    <span className="ig-muted ig-small"> · {formatDate(c.collectedOn)}</span>
                    {c.organism ? <span> — <i>{c.organism}</i></span> : null}
                  </span>
                  <span className="ig-row" style={{ gap: 6 }}>
                    {c.profile ? <StatusBadge status="crit">{c.profile}</StatusBadge> : null}
                    <StatusBadge status={tone}>{label}</StatusBadge>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {p.iras?.length ? (
        <div className="ig-section">
          <span className="ig-label">Notificações de IRAS</span>
          <ul className="ig-list">
            {p.iras.map((n) => (
              <li key={n.id}>
                <span className="ig-row" style={{ gap: 8 }}>
                  <InfectionTag type={n.type} />
                  <span className="ig-small">{formatDate(n.eventDate)}{n.criterion ? ` · ${n.criterion}` : ''}</span>
                </span>
                <StatusBadge status={INVESTIGATION_TONE[n.status]}>{INVESTIGATION_STATUS_LABEL[n.status]}</StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.footer ? <div className="ig-section ig-row">{p.footer}</div> : null}
    </article>
  );
}
