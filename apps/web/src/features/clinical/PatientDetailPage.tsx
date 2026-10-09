import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DEVICE_LABEL, IRAS_TYPES, MATERIAL_LABEL, NOTE_KIND_LABEL, OUTCOME_LABEL, SEX_LABEL, WOUND_CLASS_LABEL, ageLabel, dateInZone, deviceDay, formatDate, hospitalDay, todayIn,
  type AdmissionDto, type CultureMaterial, type DeviceDto, type NoteDto, type PatientDetail, type Status,
} from '@ccih/domain';
import { AlertBanner, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, InfectionTag, LoadingState, SubNav, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import { justificationError } from '../admin/shared';
import { ApiError } from '../../data/api/http';
import { AdmissionForm, CultureCollectForm, DeviceForm, DischargeForm, NoteForm, RemoveDeviceForm, TransferForm } from './patient-forms';
import { CaseForm } from './iras-forms';
import { SurgeryForm } from './surgery-forms';
import { CaseStatusBadge, CultureOutcomeBadge, DemoTag, PageHeader, RequireClinical, Timeline, sectorName, useClinical, useOrg, useTimeZone, type TimelineItem } from './shared';

export function PatientDetailPage() {
  return (
    <RequireClinical title="Paciente">
      <PatientDetailView />
    </RequireClinical>
  );
}

const SECTIONS = [
  { key: 'resumo', label: 'Linha do tempo' },
  { key: 'internacao', label: 'Internação e dispositivos' },
  { key: 'evolucao', label: 'Evolução CCIH' },
  { key: 'iras', label: 'IRAS', permission: 'iras:view' },
  { key: 'cirurgias', label: 'Cirurgias', permission: 'surgery:view' },
  { key: 'culturas', label: 'Culturas', permission: 'micro:view' },
] as const;

type Action = null | 'admit' | 'transfer' | 'discharge' | 'device' | { remove: DeviceDto } | 'note' | { amend: NoteDto } | 'case' | 'surgery' | 'culture';

function PatientDetailView() {
  const { id = '' } = useParams();
  const clinical = useClinical()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [action, setAction] = useState<Action>(null);
  const q = useQuery({ queryKey: ['patient', id], queryFn: () => clinical.patient(id) });
  const sections = SECTIONS.filter((s) => !('permission' in s) || session.can(s.permission));
  const section = sections.find((s) => s.key === params.get('secao'))?.key ?? 'resumo';

  if (q.isPending) return <div className="page"><LoadingState /></div>;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return <div className="page"><Card>{notFound ? <EmptyState title="Paciente não encontrado">O registro não existe ou está fora dos setores do seu perfil.</EmptyState> : <ErrorState onRetry={() => void q.refetch()} />}</Card></div>;
  }
  const p = q.data;
  const today = todayIn(tz);
  const current = p.current ? p.admissions.find((a) => a.id === p.current!.admissionId) : undefined;
  const latest = current ?? p.admissions[0];
  const canEdit = session.can('patient:edit');
  const done = () => setAction(null);

  return (
    <div className="page">
      <PageHeader
        back={{ to: '/pacientes', label: 'Pacientes' }}
        title={<span className="ig-row" style={{ gap: 10 }}>{p.initials}<span className="ig-mono" style={{ fontSize: 16, fontWeight: 500 }}>{p.recordNumber}</span><DemoTag origin={p.origin} /></span>}
        subtitle={`${ageLabel(p.birthDate, today)} · ${SEX_LABEL[p.sex]}${p.birthDate ? ` · nascimento ${formatDate(p.birthDate)}` : ''}`}
        actions={session.can('patient:view_identified') ? <RevealName patient={p} /> : null}
      />

      <Card title={current ? 'Internação atual' : 'Sem internação ativa'} subtitle={current ? current.diagnosis ?? undefined : latest ? `Última saída: ${formatDate(latest.dischargedAt, tz)} (${latest.outcome ? OUTCOME_LABEL[latest.outcome] : '—'})` : 'Nenhuma internação registrada.'}
        actions={canEdit ? (
          <div className="ig-row" style={{ gap: 8 }}>
            {current ? <>
              <Button size="sm" onClick={() => setAction('transfer')}>Transferir</Button>
              <Button size="sm" onClick={() => setAction('device')}>Inserir dispositivo</Button>
              <Button size="sm" onClick={() => setAction('discharge')}>Registrar saída</Button>
            </> : <Button size="sm" variant="primary" onClick={() => setAction('admit')}>Nova internação</Button>}
          </div>
        ) : null}>
        {current && p.current ? (
          <dl className="ig-facts">
            <div><dt>Setor</dt><dd>{sectorName(org.data, p.current.sectorId)}</dd></div>
            <div><dt>Leito</dt><dd>{p.current.bedCode ?? 'Sem leito'}</dd></div>
            <div><dt>Admissão</dt><dd>{formatDate(current.admittedAt, tz)}</dd></div>
            <div><dt>Dia de internação</dt><dd className="ig-num">D{hospitalDay(dateInZone(new Date(current.admittedAt), tz), today)}</dd></div>
          </dl>
        ) : null}
        {current ? <ActiveDevices admission={current} canEdit={canEdit} onRemove={(d) => setAction({ remove: d })} /> : null}
      </Card>

      {action === 'admit' ? <AdmissionForm patientId={p.id} onDone={done} /> : null}
      {action === 'transfer' && current ? <TransferForm admission={current} onDone={done} /> : null}
      {action === 'discharge' && current ? <DischargeForm admission={current} onDone={done} /> : null}
      {action === 'device' && current ? <DeviceForm admission={current} onDone={done} /> : null}
      {action && typeof action === 'object' && 'remove' in action ? <RemoveDeviceForm device={action.remove} onDone={done} /> : null}

      <SubNav label="Seções do paciente" items={sections.map((s) => ({ key: s.key, label: s.label, href: `${pathname}?secao=${s.key}`, active: s.key === section }))}
        renderLink={(item, className) => <Link to={item.href} replace className={className} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>} />

      {section === 'resumo' ? <Card title="Linha do tempo" subtitle="Eventos de todas as internações, do mais recente ao mais antigo."><Timeline items={timeline(p, org.data)} timeZone={tz} /></Card> : null}

      {section === 'internacao' ? <AdmissionsHistory patient={p} /> : null}

      {section === 'evolucao' ? (
        <>
          {canEdit && !action ? <div><Button variant="primary" icon="plus" onClick={() => setAction('note')}>Nova evolução</Button></div> : null}
          {action === 'note' ? <NoteForm patientId={p.id} admissionId={latest?.id ?? null} caseOptions={p.cases.map((c) => ({ id: c.id, label: `${IRAS_TYPES[c.type].sigla} · ${formatDate(c.eventDate)}` }))} onDone={done} /> : null}
          {action && typeof action === 'object' && 'amend' in action ? <NoteForm patientId={p.id} admissionId={action.amend.admissionId} caseOptions={[]} amend={action.amend} onDone={done} /> : null}
          <Notes notes={p.notes} canAmend={canEdit} onAmend={(n) => setAction({ amend: n })} />
        </>
      ) : null}

      {section === 'iras' ? (
        <>
          {session.can('iras:edit') && latest && !action ? <div><Button variant="primary" icon="plus" onClick={() => setAction('case')}>Registrar suspeita de IRAS</Button></div> : null}
          {action === 'case' && latest ? (
            <CaseForm admission={latest} surgeries={p.surgeries.filter((s) => s.admissionId === latest.id)} cultures={p.cultures.filter((c) => c.admissionId === latest.id)} onDone={done} />
          ) : null}
          <DataTable caption="Casos de IRAS" rows={p.cases} rowKey={(c) => c.id} emptyMessage="Nenhum caso registrado."
            columns={[
              { key: 'eventDate', label: 'Evento', render: (c) => <Link to={`/vigilancia/${c.id}`}>{formatDate(c.eventDate)}</Link> },
              { key: 'type', label: 'Tipo', render: (c) => <InfectionTag type={c.type} /> },
              { key: 'sector', label: 'Setor', value: (c) => sectorName(org.data, c.sectorId) },
              { key: 'status', label: 'Situação', render: (c) => <CaseStatusBadge status={c.status} /> },
            ]} />
        </>
      ) : null}

      {section === 'cirurgias' ? (
        <>
          {session.can('surgery:edit') && latest && !action ? <div><Button variant="primary" icon="plus" onClick={() => setAction('surgery')}>Registrar cirurgia</Button></div> : null}
          {action === 'surgery' && latest ? <SurgeryForm admissionId={latest.id} onDone={done} /> : null}
          <DataTable caption="Cirurgias" rows={p.surgeries} rowKey={(s) => s.id} emptyMessage="Nenhuma cirurgia registrada."
            columns={[
              { key: 'startedAt', label: 'Data', render: (s) => <Link to={`/cirurgias/${s.id}`}>{formatDate(s.startedAt, tz)}</Link> },
              { key: 'procedure', label: 'Procedimento', value: (s) => s.procedure.name },
              { key: 'surgeon', label: 'Cirurgião', value: (s) => s.surgeon.name },
              { key: 'wound', label: 'Classificação', value: (s) => (s.woundClass ? WOUND_CLASS_LABEL[s.woundClass] : '—') },
            ]} />
        </>
      ) : null}

      {section === 'culturas' ? (
        <>
          {session.can('micro:edit') && current && !action ? <div><Button variant="primary" icon="plus" onClick={() => setAction('culture')}>Registrar coleta</Button></div> : null}
          {action === 'culture' && current ? <CultureCollectForm admission={current} onDone={done} /> : null}
          <DataTable caption="Culturas" rows={p.cultures} rowKey={(c) => c.id} emptyMessage="Nenhuma cultura registrada."
            columns={[
              { key: 'collectedAt', label: 'Coleta', render: (c) => <Link to={`/microbiologia/${c.id}`}>{formatDate(c.collectedAt, tz)}</Link> },
              { key: 'material', label: 'Material', value: (c) => MATERIAL_LABEL[c.material as CultureMaterial] ?? c.material },
              { key: 'outcome', label: 'Resultado', render: (c) => <CultureOutcomeBadge outcome={c.outcome} /> },
              { key: 'organisms', label: 'Microrganismos', value: (c) => c.organisms.join(', ') || '—', render: (c) => (c.organisms.length ? <i>{c.organisms.join(', ')}</i> : '—') },
              { key: 'profile', label: 'Perfil', value: (c) => c.resistance.join(', ') || '—' },
            ]} />
        </>
      ) : null}
    </div>
  );
}

function ActiveDevices({ admission, canEdit, onRemove }: { admission: AdmissionDto; canEdit: boolean; onRemove: (d: DeviceDto) => void }) {
  const tz = useTimeZone();
  const today = todayIn(tz);
  const active = admission.devices.filter((d) => !d.removedAt);
  return (
    <div className="ig-section">
      <span className="ig-label">Dispositivos invasivos em uso — dia de uso (D1 = inserção)</span>
      {active.length ? (
        <ul className="ig-list">
          {active.map((d) => (
            <li key={d.id}>
              <span className="ig-row" style={{ gap: 8 }}>
                <b>{d.type}</b><span className="ig-muted ig-small">{DEVICE_LABEL[d.type]}{d.site ? ` · ${d.site}` : ''} · desde {formatDate(d.insertedAt, tz)}</span>
              </span>
              <span className="ig-row" style={{ gap: 8 }}>
                <span className="ig-days ig-tone-info">D{deviceDay({ insertedOn: dateInZone(new Date(d.insertedAt), tz) }, today)}</span>
                {canEdit ? <Button size="sm" onClick={() => onRemove(d)} aria-label={`Registrar retirada de ${d.type}`}>Retirar</Button> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="ig-small ig-muted">Nenhum dispositivo em uso.</p>}
    </div>
  );
}

function AdmissionsHistory({ patient }: { patient: PatientDetail }) {
  const org = useOrg();
  const tz = useTimeZone();
  if (!patient.admissions.length) return <Card><EmptyState title="Nenhuma internação registrada" /></Card>;
  return (
    <>
      {patient.admissions.map((a) => {
        const deviceCols: Column<DeviceDto>[] = [
          { key: 'type', label: 'Dispositivo', render: (d) => <span><b>{d.type}</b> <span className="ig-muted ig-small">{DEVICE_LABEL[d.type]}</span></span>, value: (d) => d.type },
          { key: 'site', label: 'Sítio' },
          { key: 'insertedAt', label: 'Inserção', value: (d) => d.insertedAt, render: (d) => formatDate(d.insertedAt, tz) },
          { key: 'removedAt', label: 'Retirada', value: (d) => d.removedAt ?? '', render: (d) => (d.removedAt ? `${formatDate(d.removedAt, tz)}${d.removalReason ? ` — ${d.removalReason}` : ''}` : 'Em uso') },
        ];
        return (
          <Card key={a.id} title={`Internação de ${formatDate(a.admittedAt, tz)}`} subtitle={a.dischargedAt ? `Saída ${formatDate(a.dischargedAt, tz)} · ${a.outcome ? OUTCOME_LABEL[a.outcome] : ''}` : 'Em curso'}>
            <span className="ig-label">Permanências</span>
            <ul className="ig-list">
              {a.movements.map((m) => (
                <li key={m.id}>
                  <span><b>{sectorName(org.data, m.sectorId)}</b>{m.bedCode ? ` · leito ${m.bedCode}` : ''}{m.reason ? <span className="ig-muted ig-small"> · {m.reason}</span> : null}</span>
                  <span className="ig-small ig-muted ig-num">{formatDate(m.start, tz)} → {m.end ? formatDate(m.end, tz) : 'atual'}</span>
                </li>
              ))}
            </ul>
            <div className="ig-section">
              <DataTable caption="Dispositivos" rows={a.devices} rowKey={(d) => d.id} columns={deviceCols} emptyMessage="Nenhum dispositivo nesta internação." dense />
            </div>
          </Card>
        );
      })}
    </>
  );
}

function Notes({ notes, canAmend, onAmend }: { notes: NoteDto[]; canAmend: boolean; onAmend: (n: NoteDto) => void }) {
  const tz = useTimeZone();
  if (!notes.length) return <Card><EmptyState title="Nenhuma evolução registrada" /></Card>;
  return (
    <Card title="Evolução CCIH" subtitle="Registros permanentes. Uma retificação não apaga o texto original.">
      <ul className="ig-list">
        {notes.map((n) => (
          <li key={n.id} style={{ display: 'block' }}>
            <div className="ig-tl-step">
              <b>{NOTE_KIND_LABEL[n.kind]}{n.caseId ? ' · caso de IRAS' : ''}</b>
              <span className="ig-small ig-muted">{n.authorName} · {formatDate(n.createdAt, tz)}</span>
            </div>
            <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap', textDecoration: n.amendedBy ? 'line-through' : undefined, color: n.amendedBy ? 'var(--ink-muted)' : undefined }}>{n.body}</p>
            {n.amendedBy ? <p className="ig-small ig-muted" style={{ margin: 0 }}>Retificado por registro posterior.</p> : null}
            {n.justification ? <p className="ig-small" style={{ margin: 0 }}>Motivo da retificação: {n.justification}</p> : null}
            {canAmend && !n.amendedBy ? <Button size="sm" variant="ghost" onClick={() => onAmend(n)}>Retificar</Button> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Identified data on request: reason required, shown only in this screen, logged by the server. */
function RevealName({ patient }: { patient: PatientDetail }) {
  const clinical = useClinical()!;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  if (!patient.hasFullName) return null;
  if (shown) return <AlertBanner tone="info" title={shown}>Exibição registrada no log de auditoria.</AlertBanner>;
  const confirm = async () => {
    const problem = justificationError(reason);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const r = await clinical.revealName(patient.id, reason.trim());
      setShown(r.fullName ?? r.reason ?? 'Nome indisponível');
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível exibir o nome.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button icon="eye" onClick={() => setOpen(true)}>Ver nome completo</Button>
      <ConfirmDialog open={open} title="Exibir nome completo?" confirmLabel="Exibir" busy={busy} onConfirm={() => void confirm()} onCancel={() => setOpen(false)}>
        <Field label="Motivo do acesso" required hint="Fica registrado no log de auditoria com seu usuário, data e IP." error={error}>
          <textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} maxLength={500} />
        </Field>
      </ConfirmDialog>
    </>
  );
}

function timeline(p: PatientDetail, org: Parameters<typeof sectorName>[0]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const a of p.admissions) {
    a.movements.forEach((m, i) => items.push({ id: `m-${m.id}`, at: m.start, tone: 'info', title: i === 0 ? `Admissão — ${sectorName(org, m.sectorId)}` : `Transferência para ${sectorName(org, m.sectorId)}`, detail: [m.bedCode ? `Leito ${m.bedCode}` : null, m.reason].filter(Boolean).join(' · ') || undefined }));
    if (a.dischargedAt) items.push({ id: `d-${a.id}`, at: a.dischargedAt, tone: a.outcome === 'obito' ? 'crit' : 'neutral', title: `Saída — ${a.outcome ? OUTCOME_LABEL[a.outcome] : ''}` });
    for (const d of a.devices) {
      items.push({ id: `di-${d.id}`, at: d.insertedAt, tone: 'warn', title: `Inserção de ${d.type}`, detail: [DEVICE_LABEL[d.type], d.site].filter(Boolean).join(' · ') });
      if (d.removedAt) items.push({ id: `dr-${d.id}`, at: d.removedAt, tone: 'neutral', title: `Retirada de ${d.type}`, detail: d.removalReason ?? undefined });
    }
  }
  for (const s of p.surgeries) items.push({ id: `s-${s.id}`, at: s.startedAt, tone: 'info', title: `Cirurgia — ${s.procedure.name}`, detail: `${s.surgeon.name}${s.woundClass ? ` · ${WOUND_CLASS_LABEL[s.woundClass]}` : ''}` });
  for (const c of p.cultures) items.push({ id: `c-${c.id}`, at: c.collectedAt, tone: c.outcome === 'positiva' ? 'crit' : c.outcome === 'pendente' ? 'neutral' : 'ok', title: `Cultura — ${MATERIAL_LABEL[c.material as CultureMaterial] ?? c.material}`, detail: c.organisms.length ? `${c.organisms.join(', ')}${c.resistance.length ? ` · ${c.resistance.join(', ')}` : ''}` : c.outcome === 'pendente' ? 'Aguardando resultado' : 'Sem crescimento' });
  const caseTone: Record<string, Status> = { suspeita: 'warn', em_investigacao: 'warn', confirmada: 'crit', descartada: 'neutral' };
  for (const c of p.cases) items.push({ id: `i-${c.id}`, at: c.createdAt, tone: caseTone[c.status]!, title: `${IRAS_TYPES[c.type].sigla} — evento em ${formatDate(c.eventDate)}`, detail: <Link to={`/vigilancia/${c.id}`}>Abrir caso</Link> });
  return items.sort((x, y) => y.at.localeCompare(x.at));
}
