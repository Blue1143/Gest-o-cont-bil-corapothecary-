import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ASSOCIATION_LABEL, DEVICE_LABEL, INVESTIGATION_STATUS_LABEL, IRAS_TRANSITIONS, IRAS_TYPES, IRAS_TYPE_ORDER, MATERIAL_LABEL, NOTE_KIND_LABEL, REQUIRES_VALIDATION_LABEL,
  formatDate, isOpenStatus, transitionPermission, TRANSITION_LABEL,
  type CultureMaterial, type DeviceType, type InvestigationStatus, type IrasCaseSummary,
} from '@ccih/domain';
import { AlertBanner, Button, Card, DataTable, EmptyState, ErrorState, InfectionTag, LoadingState, ProvenanceTag, StatusBadge, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import { ApiError } from '../../data/api/http';
import { CaseForm, StatusForm } from './iras-forms';
import { CaseStatusBadge, CultureOutcomeBadge, DemoTag, PageHeader, Pager, PatientLabel, RequireClinical, Timeline, sectorName, useClinical, useOrg, useTimeZone } from './shared';

const STATUSES: InvestigationStatus[] = ['suspeita', 'em_investigacao', 'confirmada', 'descartada'];

export function IrasListPage() {
  return <RequireClinical title="Vigilância IRAS"><IrasList /></RequireClinical>;
}

function IrasList() {
  const clinical = useClinical()!;
  const org = useOrg();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'pagina') next.delete('pagina');
    setParams(next, { replace: true });
  };
  const page = Number(get('pagina') || '1') || 1;
  const status = get('situacao') || 'suspeita,em_investigacao';
  const query = { status: status === 'todas' ? undefined : status, type: get('tipo') || undefined, sectorId: get('setor') || undefined, deviceType: get('dispositivo') || undefined, from: get('de') || undefined, to: get('ate') || undefined, q: get('q') || undefined, page, pageSize: 25 };
  const list = useQuery({ queryKey: ['cases', query], queryFn: () => clinical.cases(query) });
  const [search, setSearch] = useState(get('q'));

  const columns: Column<IrasCaseSummary>[] = [
    { key: 'eventDate', label: 'Evento', render: (c) => <Link to={`/vigilancia/${c.id}`}>{formatDate(c.eventDate)}</Link>, value: (c) => c.eventDate },
    { key: 'patient', label: 'Paciente', value: (c) => c.patient.recordNumber, render: (c) => <span className="ig-row" style={{ gap: 6 }}><PatientLabel patient={c.patient} /><DemoTag origin={c.origin} /></span> },
    { key: 'type', label: 'Tipo', value: (c) => c.type, render: (c) => <InfectionTag type={c.type} /> },
    { key: 'sector', label: 'Setor', value: (c) => sectorName(org.data, c.sectorId) },
    { key: 'device', label: 'Dispositivo', value: (c) => c.deviceType ?? '', render: (c) => (c.deviceType ? <span title={DEVICE_LABEL[c.deviceType]}>{c.deviceType}{c.deviceAssociated === true ? ' · associada' : c.deviceAssociated === false ? ' · não associada' : ''}</span> : '—') },
    { key: 'status', label: 'Situação', value: (c) => INVESTIGATION_STATUS_LABEL[c.status], render: (c) => <CaseStatusBadge status={c.status} /> },
    { key: 'criterion', label: 'Critério', sortable: false, render: (c) => (c.criterion ? <span className="ig-row" style={{ gap: 6 }}>{c.criterion.title}{!c.criterion.validated ? <ProvenanceTag kind="requer_validacao" /> : null}</span> : '—') },
  ];

  const counts = list.data?.counts;
  return (
    <div className="page">
      <PageHeader title="Vigilância IRAS" subtitle="Suspeitas, investigações e decisões. Cada mudança de situação exige justificativa e fica no histórico imutável do caso." />
      <div className="status-tiles" role="group" aria-label="Casos por situação (filtros atuais, exceto situação)">
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`status-tile${status === s ? ' active' : ''}`} aria-pressed={status === s} onClick={() => set('situacao', status === s ? '' : s)}>
            <span className="ig-label">{INVESTIGATION_STATUS_LABEL[s]}</span>
            <span className="status-tile-value ig-num">{counts ? counts[s] : '—'}</span>
          </button>
        ))}
      </div>
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); set('q', search.trim()); }}>
        <div className="field">
          <label htmlFor="iras-sit">Situação</label>
          <select id="iras-sit" className="select" value={status} onChange={(e) => set('situacao', e.target.value)}>
            <option value="suspeita,em_investigacao">Abertas</option>
            {STATUSES.map((s) => <option key={s} value={s}>{INVESTIGATION_STATUS_LABEL[s]}</option>)}
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="iras-tipo">Tipo de infecção</label>
          <select id="iras-tipo" className="select" value={get('tipo')} onChange={(e) => set('tipo', e.target.value)}>
            <option value="">Todos</option>
            {IRAS_TYPE_ORDER.map((t) => <option key={t} value={t}>{IRAS_TYPES[t].sigla}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="iras-setor">Setor</label>
          <select id="iras-setor" className="select" value={get('setor')} onChange={(e) => set('setor', e.target.value)}>
            <option value="">Todos os meus setores</option>
            {org.data?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="iras-disp">Dispositivo</label>
          <select id="iras-disp" className="select" value={get('dispositivo')} onChange={(e) => set('dispositivo', e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(DEVICE_LABEL) as DeviceType[]).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="iras-de">Evento de</label><input id="iras-de" type="date" className="select" value={get('de')} onChange={(e) => set('de', e.target.value)} /></div>
        <div className="field"><label htmlFor="iras-ate">até</label><input id="iras-ate" type="date" className="select" value={get('ate')} onChange={(e) => set('ate', e.target.value)} /></div>
        <div className="field"><label htmlFor="iras-q">Paciente</label><input id="iras-q" className="select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Prontuário ou iniciais" /></div>
        <Button type="submit" icon="search">Pesquisar</Button>
      </form>
      <DataTable caption="Casos" columns={columns} rows={list.data?.rows ?? []} rowKey={(c) => c.id} state={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'} onRetry={() => void list.refetch()}
        emptyMessage="Nenhum caso com estes filtros. Suspeitas são registradas a partir da página do paciente." />
      {list.data ? <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set('pagina', String(p))} /> : null}
    </div>
  );
}

export function IrasCasePage() {
  return <RequireClinical title="Caso de IRAS"><IrasCase /></RequireClinical>;
}

function IrasCase() {
  const { id = '' } = useParams();
  const clinical = useClinical()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const [action, setAction] = useState<null | 'edit' | InvestigationStatus>(null);
  const q = useQuery({ queryKey: ['case', id], queryFn: () => clinical.case(id) });
  const patient = useQuery({ queryKey: ['patient', q.data?.patient.id], enabled: action === 'edit' && !!q.data, queryFn: () => clinical.patient(q.data!.patient.id) });

  if (q.isPending) return <div className="page"><LoadingState /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div className="page"><Card>{nf ? <EmptyState title="Caso não encontrado">O caso não existe ou está fora dos setores do seu perfil.</EmptyState> : <ErrorState onRetry={() => void q.refetch()} />}</Card></div>;
  }
  const c = q.data;
  const ctx = c.context;
  const device = c.admission.devices.find((d) => d.id === c.deviceUseId);
  const transitions = IRAS_TRANSITIONS[c.status].filter((to) => session.can(transitionPermission(c.status, to)));
  const done = () => setAction(null);

  return (
    <div className="page">
      <PageHeader back={{ to: '/vigilancia', label: 'Vigilância IRAS' }}
        title={<span className="ig-row" style={{ gap: 10 }}><InfectionTag type={c.type} showName /><CaseStatusBadge status={c.status} /><DemoTag origin={c.origin} /></span>}
        subtitle={<>Paciente <PatientLabel patient={c.patient} /> · evento em {formatDate(c.eventDate)} · {sectorName(org.data, c.sectorId)}</>}
        actions={!action ? <>
          {isOpenStatus(c.status) && session.can('iras:edit') ? <Button onClick={() => setAction('edit')}>Editar dados</Button> : null}
          {transitions.map((to) => <Button key={to} variant={to === 'confirmada' ? 'primary' : to === 'descartada' ? 'danger' : 'secondary'} onClick={() => setAction(to)}>{TRANSITION_LABEL[to]}</Button>)}
        </> : null}
      />
      {action === 'edit' ? (patient.data ? <CaseForm admission={c.admission} surgeries={patient.data.surgeries.filter((s) => s.admissionId === c.admissionId)} cultures={patient.data.cultures.filter((x) => x.admissionId === c.admissionId)} existing={c} onDone={done} /> : <Card><LoadingState /></Card>) : null}
      {action && action !== 'edit' ? <StatusForm detail={c} to={action} onDone={done} /> : null}

      <div className="cols-2">
        <Card title="Apoio à decisão" subtitle="Calculado com os parâmetros institucionais vigentes. Não classifica o caso.">
          <dl className="def-list">
            <dt>Dia de internação no evento</dt><dd>D{ctx.hospitalDay}</dd>
            <dt>Relacionada à assistência</dt>
            <dd>{ctx.healthcareAssociated === 'sem_regra' ? <StatusBadge status="neutral">Sem regra configurada</StatusBadge> : <StatusBadge status={ctx.healthcareAssociated === 'elegivel' ? 'info' : 'neutral'}>{ctx.healthcareAssociated === 'elegivel' ? `Elegível (a partir de D${ctx.hospitalAcquiredFromDay})` : `Não elegível (regra: a partir de D${ctx.hospitalAcquiredFromDay})`}</StatusBadge>}</dd>
          </dl>
          <div className="ig-section">
            <span className="ig-label">Dispositivos da internação no dia do evento</span>
            {ctx.devices.length ? (
              <ul className="ig-list">
                {ctx.devices.map((d) => (
                  <li key={d.id}>
                    <span><b>{d.type}</b> {d.relevant ? <span className="ig-small ig-muted">· relevante para {IRAS_TYPES[c.type].sigla}</span> : null}{d.id === c.deviceUseId ? <span className="ig-small"> · vinculado ao caso</span> : null}</span>
                    <span className="ig-row" style={{ gap: 6 }}>{d.deviceDayOnEvent ? <span className="ig-days ig-tone-info">D{d.deviceDayOnEvent}</span> : null}<span className="ig-small">{ASSOCIATION_LABEL[d.association]}</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="ig-small ig-muted">Nenhum dispositivo registrado nesta internação.</p>}
          </div>
          <p className="ig-card-sub">Parâmetros em Administração › Parâmetros. Referências sem validação aparecem como “{REQUIRES_VALIDATION_LABEL}”.</p>
        </Card>
        <Card title="Decisão e vínculos">
          <dl className="def-list">
            <dt>Critério aplicado</dt>
            <dd>{c.criterion ? <>{c.criterion.title} · versão {c.criterion.version}{!c.criterion.validated ? <ProvenanceTag kind="requer_validacao" /> : null}</> : 'Ainda não decidido'}</dd>
            <dt>Associada a dispositivo</dt><dd>{c.deviceAssociated == null ? '—' : c.deviceAssociated ? 'Sim' : 'Não'}</dd>
            <dt>Dispositivo vinculado</dt><dd>{device ? `${device.type} · inserido ${formatDate(device.insertedAt, tz)}` : '—'}</dd>
            <dt>Cirurgia vinculada</dt><dd>{c.surgery ? <Link to={`/cirurgias/${c.surgery.id}`}>{c.surgery.procedure.name} · {formatDate(c.surgery.startedAt, tz)}</Link> : '—'}</dd>
            <dt>Descrição</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.description ?? '—'}</dd>
          </dl>
          {c.cultures.length ? (
            <div className="ig-section">
              <span className="ig-label">Culturas vinculadas</span>
              <ul className="ig-list">
                {c.cultures.map((x) => (
                  <li key={x.id}>
                    <Link to={`/microbiologia/${x.id}`}>{MATERIAL_LABEL[x.material as CultureMaterial] ?? x.material} · {formatDate(x.collectedAt, tz)}</Link>
                    <span className="ig-row" style={{ gap: 6 }}>{x.organisms.length ? <i className="ig-small">{x.organisms.join(', ')}</i> : null}<CultureOutcomeBadge outcome={x.outcome} /></span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title="Histórico do caso" subtitle="Registros permanentes: não podem ser editados nem apagados.">
        <Timeline timeZone={tz} items={[...c.history].reverse().map((h) => ({ id: h.id, at: h.at, tone: h.to === 'confirmada' ? 'crit' : h.to === 'descartada' ? 'neutral' : 'warn', title: h.from ? `${INVESTIGATION_STATUS_LABEL[h.from]} → ${INVESTIGATION_STATUS_LABEL[h.to]}` : INVESTIGATION_STATUS_LABEL[h.to], detail: `${h.by}: ${h.justification}` }))} />
      </Card>

      {c.notes.length ? (
        <Card title="Evoluções relacionadas">
          <ul className="ig-list">
            {c.notes.map((n) => <li key={n.id} style={{ display: 'block' }}><b>{NOTE_KIND_LABEL[n.kind]}</b> <span className="ig-small ig-muted">· {n.authorName} · {formatDate(n.createdAt, tz)}</span><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{n.body}</p></li>)}
          </ul>
        </Card>
      ) : null}
      {c.origin === 'demo' ? <AlertBanner tone="info" title="Caso sintético">Gerado para demonstração; não corresponde a paciente real.</AlertBanner> : null}
    </div>
  );
}
