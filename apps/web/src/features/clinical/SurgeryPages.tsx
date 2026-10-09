import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { WOUND_CLASS_LABEL, evaluateProphylaxis, formatDate, formatNumber, type SurgerySummary, type WoundClass } from '@ccih/domain';
import { AlertBanner, Button, Card, DataTable, EmptyState, ErrorState, InfectionTag, LoadingState, ProvenanceTag, StatusBadge, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import { useInstitution } from '../../data/source';
import { ApiError } from '../../data/api/http';
import { ProphylaxisBadge, SurgeryForm } from './surgery-forms';
import { CaseStatusBadge, DemoTag, PageHeader, Pager, PatientLabel, RequireClinical, useClinical, useTimeZone } from './shared';

export function SurgeriesPage() {
  return <RequireClinical title="Cirurgias"><Surgeries /></RequireClinical>;
}

const minutes = (s: SurgerySummary) => (s.endedAt ? Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000) : null);

function Surgeries() {
  const clinical = useClinical()!;
  const tz = useTimeZone();
  const rules = useInstitution().data?.data.config.rules;
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
  const query = { from: get('de') || undefined, to: get('ate') || undefined, procedureId: get('procedimento') || undefined, surgeonId: get('cirurgiao') || undefined, woundClass: get('classificacao') || undefined, q: get('q') || undefined, page, pageSize: 25 };
  const list = useQuery({ queryKey: ['surgeries', query], queryFn: () => clinical.surgeries(query) });
  const procedures = useQuery({ queryKey: ['procedures'], queryFn: () => clinical.procedures(), staleTime: 10 * 60_000 });
  const professionals = useQuery({ queryKey: ['professionals'], queryFn: () => clinical.professionals(), staleTime: 10 * 60_000 });
  const [search, setSearch] = useState(get('q'));

  const evaluation = (s: SurgerySummary) => (rules ? evaluateProphylaxis(
    { indicated: s.prophylaxisIndicated, drug: s.prophylaxisDrug, minutesBeforeIncision: s.prophylaxisDoseAt ? Math.round((Date.parse(s.startedAt) - Date.parse(s.prophylaxisDoseAt)) / 60_000) : null, durationHours: s.prophylaxisDurationH },
    { windowMin: rules.surgery.prophylaxisWindowMin?.value, windowByDrugMin: rules.surgery.prophylaxisWindowByDrugMin?.value, maxDurationH: rules.surgery.prophylaxisMaxDurationH?.value },
  ) : null);

  const columns: Column<SurgerySummary>[] = [
    { key: 'startedAt', label: 'Data', value: (s) => s.startedAt, render: (s) => <Link to={`/cirurgias/${s.id}`}>{formatDate(s.startedAt, tz)}</Link> },
    { key: 'patient', label: 'Paciente', value: (s) => s.patient.recordNumber, render: (s) => <span className="ig-row" style={{ gap: 6 }}><PatientLabel patient={s.patient} /><DemoTag origin={s.origin} /></span> },
    { key: 'procedure', label: 'Procedimento', value: (s) => s.procedure.name },
    { key: 'surgeon', label: 'Cirurgião', value: (s) => s.surgeon.name },
    { key: 'wound', label: 'Classificação', value: (s) => (s.woundClass ? WOUND_CLASS_LABEL[s.woundClass] : '—') },
    { key: 'duration', label: 'Duração (min)', align: 'right', value: (s) => minutes(s), render: (s) => formatNumber(minutes(s)) },
    { key: 'prophylaxis', label: 'Antibioticoprofilaxia', sortable: false, render: (s) => { const e = evaluation(s); return e ? <ProphylaxisBadge evaluation={e} /> : '—'; } },
  ];

  return (
    <div className="page">
      <PageHeader title="Cirurgias" subtitle="Registro cirúrgico, risco, antibioticoprofilaxia (pela janela configurada) e vigilância de ISC. Novas cirurgias são registradas a partir da página do paciente." />
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); set('q', search.trim()); }}>
        <div className="field"><label htmlFor="cir-de">De</label><input id="cir-de" type="date" className="select" value={get('de')} onChange={(e) => set('de', e.target.value)} /></div>
        <div className="field"><label htmlFor="cir-ate">Até</label><input id="cir-ate" type="date" className="select" value={get('ate')} onChange={(e) => set('ate', e.target.value)} /></div>
        <div className="field">
          <label htmlFor="cir-proc">Procedimento</label>
          <select id="cir-proc" className="select" value={get('procedimento')} onChange={(e) => set('procedimento', e.target.value)}>
            <option value="">Todos</option>
            {procedures.data?.procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cir-cir">Cirurgião</label>
          <select id="cir-cir" className="select" value={get('cirurgiao')} onChange={(e) => set('cirurgiao', e.target.value)}>
            <option value="">Todos</option>
            {professionals.data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cir-class">Classificação</label>
          <select id="cir-class" className="select" value={get('classificacao')} onChange={(e) => set('classificacao', e.target.value)}>
            <option value="">Todas</option>
            {(Object.keys(WOUND_CLASS_LABEL) as WoundClass[]).map((w) => <option key={w} value={w}>{WOUND_CLASS_LABEL[w]}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="cir-q">Paciente</label><input id="cir-q" className="select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Prontuário ou iniciais" /></div>
        <Button type="submit" icon="search">Pesquisar</Button>
      </form>
      <DataTable caption="Cirurgias" columns={columns} rows={list.data?.rows ?? []} rowKey={(s) => s.id} state={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'} onRetry={() => void list.refetch()} />
      {list.data ? <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set('pagina', String(p))} /> : null}
    </div>
  );
}

export function SurgeryPage() {
  return <RequireClinical title="Cirurgia"><Surgery /></RequireClinical>;
}

function Surgery() {
  const { id = '' } = useParams();
  const clinical = useClinical()!;
  const session = useSession();
  const tz = useTimeZone();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['surgery', id], queryFn: () => clinical.surgery(id) });
  if (q.isPending) return <div className="page"><LoadingState /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div className="page"><Card>{nf ? <EmptyState title="Cirurgia não encontrada" /> : <ErrorState onRetry={() => void q.refetch()} />}</Card></div>;
  }
  const s = q.data;
  const duration = minutes(s);
  const riskLabel = { asa: 'ASA', woundClass: 'potencial de contaminação', duration: 'duração ou P75' };
  return (
    <div className="page">
      <PageHeader back={{ to: '/cirurgias', label: 'Cirurgias' }} title={s.procedure.name}
        subtitle={<>Paciente <PatientLabel patient={s.patient} /> · {formatDate(s.startedAt, tz)} · {s.surgeon.name}</>}
        actions={session.can('surgery:edit') && !editing ? <Button onClick={() => setEditing(true)}>Editar</Button> : null} />
      {editing ? <SurgeryForm admissionId={s.admissionId} existing={s} onDone={() => setEditing(false)} /> : null}
      <div className="cols-2">
        <Card title="Registro cirúrgico">
          <dl className="def-list">
            <dt>Especialidade</dt><dd>{s.procedure.specialty}</dd>
            <dt>Sala</dt><dd>{s.room ?? '—'}</dd>
            <dt>Início → término</dt><dd>{formatDate(s.startedAt, tz)} → {s.endedAt ? formatDate(s.endedAt, tz) : 'não registrado'}{duration != null ? ` (${duration} min)` : ''}</dd>
            <dt>Classificação</dt><dd>{s.woundClass ? WOUND_CLASS_LABEL[s.woundClass] : 'Não informada'}</dd>
            <dt>ASA</dt><dd>{s.asa ?? 'Não informado'}</dd>
            <dt>Implante · urgência</dt><dd>{s.implant ? 'Com implante' : 'Sem implante'} · {s.urgency ? 'Urgência' : 'Eletiva'}</dd>
            <dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{s.notes ?? '—'}</dd>
          </dl>
          <DemoTag origin={s.origin} />
        </Card>
        <Card title="Índice de risco cirúrgico" subtitle="ASA ≥ 3, cirurgia contaminada/infectada e duração acima do P75 do procedimento: 1 ponto cada.">
          <p className="ig-row" style={{ gap: 8, margin: 0 }}>
            <span className="ig-risk" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < s.risk.score ? 'on' : undefined} />)}</span>
            <b className="ig-num">{s.risk.score}{s.risk.complete ? '' : '+'}</b>
            {!s.risk.complete ? <StatusBadge status="neutral">Incompleto: falta {s.risk.missing.map((m) => riskLabel[m]).join(', ')}</StatusBadge> : null}
          </p>
          <p className="ig-card-sub">P75 do procedimento: {s.p75Minutes != null ? `${s.p75Minutes} min` : 'não cadastrado'}{s.p75Source ? ` · Fonte: ${s.p75Source}` : ''}</p>
          {s.p75Source ? <ProvenanceTag kind="requer_validacao" /> : null}
        </Card>
        <Card title="Antibioticoprofilaxia" subtitle="Avaliada com a janela e a duração máxima configuradas pela instituição.">
          <p style={{ margin: 0 }}><ProphylaxisBadge evaluation={s.prophylaxis} /></p>
          <dl className="def-list" style={{ marginTop: 12 }}>
            <dt>Indicada</dt><dd>{s.prophylaxisIndicated == null ? 'Não informado' : s.prophylaxisIndicated ? 'Sim' : 'Não'}</dd>
            <dt>Fármaco</dt><dd>{s.prophylaxisDrug ?? '—'}</dd>
            <dt>Dose</dt><dd>{s.prophylaxisDoseAt ? formatDate(s.prophylaxisDoseAt, tz) : '—'}</dd>
            <dt>Duração</dt><dd>{s.prophylaxisDurationH != null ? `${formatNumber(s.prophylaxisDurationH, 1)} h` : '—'}</dd>
            <dt>Janela aplicada</dt><dd>{s.prophylaxis.appliedWindowMin != null ? `${s.prophylaxis.appliedWindowMin} min antes da incisão` : '—'}</dd>
          </dl>
          {s.prophylaxis.reasons.length ? <AlertBanner tone={s.prophylaxis.result === 'nao_conforme' ? 'crit' : 'info'}>{s.prophylaxis.reasons.join(' ')}</AlertBanner> : null}
        </Card>
        <Card title="Vigilância de ISC">
          {s.surveillance ? <p style={{ margin: 0 }}>Janela de vigilância de {s.surveillance.days} dias ({s.implant ? 'com implante' : 'sem implante'}) até <b>{formatDate(s.surveillance.end)}</b>.</p> : <StatusBadge status="neutral">Sem regra configurada</StatusBadge>}
          <div className="ig-section">
            <span className="ig-label">Casos de ISC vinculados</span>
            {s.cases.length ? (
              <ul className="ig-list">{s.cases.map((c) => <li key={c.id}><Link to={`/vigilancia/${c.id}`}><InfectionTag type={c.type} /> · {formatDate(c.eventDate)}</Link><CaseStatusBadge status={c.status} /></li>)}</ul>
            ) : <p className="ig-small ig-muted">Nenhum caso vinculado.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
