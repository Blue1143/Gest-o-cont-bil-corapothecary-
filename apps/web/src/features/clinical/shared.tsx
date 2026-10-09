import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CULTURE_OUTCOME_LABEL, INVESTIGATION_STATUS_LABEL, formatDate, fromLocalInput, toLocalInput,
  type CultureOutcome, type InvestigationStatus, type OrgPayload, type PatientRef, type Status,
} from '@ccih/domain';
import { AlertBanner, Button, Card, Icon, ProvenanceTag, StatusBadge, cx } from '@ccih/ui';
import { useDataSource, useInstitution } from '../../data/source';
import type { ClinicalPort } from '../../data/port';
import { useAdminMutation } from '../admin/shared';

export const DEFAULT_TZ = 'America/Sao_Paulo';

export function useClinical(): ClinicalPort | undefined {
  return useDataSource().clinical;
}

/** Institution time zone: every date shown or typed in the clinical modules uses it. */
export function useTimeZone(): string {
  return useInstitution().data?.data.config.timezone ?? DEFAULT_TZ;
}

export function useOrg() {
  const clinical = useClinical();
  return useQuery({ queryKey: ['org'], enabled: !!clinical, queryFn: () => clinical!.org(), staleTime: 5 * 60_000 });
}

export const sectorName = (org: OrgPayload | undefined, id: string | null | undefined) => (id ? (org?.sectors.find((s) => s.id === id)?.name ?? 'Setor') : '—');

/** Query keys refreshed after any clinical change. */
export const CLINICAL_KEYS = ['patients', 'patient', 'cases', 'case', 'surgeries', 'surgery', 'cultures', 'culture', 'census', 'org', 'facts'];

export function useClinicalMutation<I, O = unknown>(run: (input: I) => Promise<O>) {
  return useAdminMutation<I, O>(run, CLINICAL_KEYS);
}

/** Clinical modules need the backend: the browser never generates synthetic patients. */
export function RequireClinical({ title, children }: { title: string; children: ReactNode }) {
  const clinical = useClinical();
  if (clinical) return <>{children}</>;
  return (
    <div className="page">
      <header className="page-head"><h1 className="page-title">{title}</h1></header>
      <AlertBanner tone="info" title="Módulo disponível com o backend">
        Pacientes, IRAS, cirurgias e culturas são registros clínicos com controle de acesso e auditoria no servidor. Rode a API (VITE_DATA_SOURCE=api) para usar este módulo.
      </AlertBanner>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="page-head">
      <div>
        {back ? <Link to={back.to} className="back-link"><Icon name="back" size={14} />{back.label}</Link> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ig-row" style={{ gap: 8 }}>{actions}</div> : null}
    </header>
  );
}

/** Initials + record number: the default identification on every clinical screen (LGPD). */
export function PatientLabel({ patient, link = true }: { patient: PatientRef; link?: boolean }) {
  const body = (
    <>
      <b>{patient.initials}</b> <span className="ig-mono ig-small">{patient.recordNumber}</span>
    </>
  );
  return link ? <Link to={`/pacientes/${patient.id}`} aria-label={`Paciente ${patient.initials}, prontuário ${patient.recordNumber}`}>{body}</Link> : <span>{body}</span>;
}

export const CASE_TONE: Record<InvestigationStatus, Status> = { suspeita: 'warn', em_investigacao: 'warn', confirmada: 'crit', descartada: 'neutral' };

export function CaseStatusBadge({ status }: { status: InvestigationStatus }) {
  return <StatusBadge status={CASE_TONE[status]}>{INVESTIGATION_STATUS_LABEL[status]}</StatusBadge>;
}

const CULTURE_TONE: Record<CultureOutcome, Status> = { pendente: 'neutral', negativa: 'ok', positiva: 'crit', contaminada: 'warn' };

export function CultureOutcomeBadge({ outcome }: { outcome: CultureOutcome }) {
  return <StatusBadge status={CULTURE_TONE[outcome]}>{CULTURE_OUTCOME_LABEL[outcome]}</StatusBadge>;
}

export function DemoTag({ origin }: { origin: 'real' | 'demo' }) {
  return origin === 'demo' ? <ProvenanceTag kind="demo">Sintético</ProvenanceTag> : null;
}

export interface TimelineItem {
  id: string;
  at: string;
  title: ReactNode;
  detail?: ReactNode;
  tone: Status;
}

export function Timeline({ items, timeZone, empty = 'Nenhum evento registrado.' }: { items: TimelineItem[]; timeZone: string; empty?: string }) {
  if (!items.length) return <p className="ig-muted ig-small">{empty}</p>;
  return (
    <ol className="ig-tl">
      {items.map((it) => (
        <li key={it.id}>
          <span className={cx('ig-tl-dot', `ig-tone-${it.tone}`)} aria-hidden="true">{it.tone === 'neutral' ? null : <Icon name={it.tone} size={14} weight={2.5} />}</span>
          <div>
            <div className="ig-tl-step">
              <b>{it.title}</b>
              <span className="ig-small ig-muted ig-num">{formatDate(it.at, timeZone)}</span>
            </div>
            {it.detail ? <div className="ig-small ig-muted">{it.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Server-side pagination footer. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="ig-small ig-muted">{total} {total === 1 ? 'registro' : 'registros'}</p>;
  return (
    <nav className="ig-table-foot" aria-label="Paginação">
      <span className="ig-num">{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} de {total}</span>
      <span className="ig-row" style={{ gap: 8 }}>
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Anterior</Button>
        <span className="ig-num" aria-live="polite">Página {page} de {pages}</span>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>Próxima</Button>
      </span>
    </nav>
  );
}

/** datetime-local helpers bound to the institution zone. */
export const nowLocal = (tz: string) => toLocalInput(new Date(), tz);
export const localToIso = (value: string, tz: string) => (value ? fromLocalInput(value, tz) : null);

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} actions={actions} headingLevel={2}>
      {children}
    </Card>
  );
}
