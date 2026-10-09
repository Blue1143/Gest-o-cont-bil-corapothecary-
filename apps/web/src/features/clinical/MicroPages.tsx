import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CULTURE_OUTCOME_LABEL, INTERPRETATION_LABEL, MATERIAL_LABEL, RESISTANCE_LABEL, formatDate,
  type CultureDetail, type CultureMaterial, type CultureSummary, type ResistanceProfile,
} from '@ccih/domain';
import { AlertBanner, Button, Card, DataTable, EmptyState, ErrorState, Field, LoadingState, StatusBadge, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import { ApiError } from '../../data/api/http';
import { JustificationField, justificationError } from '../admin/shared';
import type { IsolateInput } from '../../data/port';
import { FormCard } from './patient-forms';
import { CultureOutcomeBadge, DemoTag, PageHeader, Pager, PatientLabel, RequireClinical, localToIso, nowLocal, sectorName, useClinical, useClinicalMutation, useOrg, useTimeZone } from './shared';

const materialLabel = (m: string) => MATERIAL_LABEL[m as CultureMaterial] ?? m;

export function CulturesPage() {
  return <RequireClinical title="Microbiologia"><Cultures /></RequireClinical>;
}

function Cultures() {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
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
  const query = { from: get('de') || undefined, to: get('ate') || undefined, sectorId: get('setor') || undefined, material: get('material') || undefined, outcome: get('resultado') || undefined, resistant: get('mdr') === '1' ? 'true' : undefined, organism: get('organismo') || undefined, q: get('q') || undefined, page, pageSize: 25 };
  const list = useQuery({ queryKey: ['cultures', query], queryFn: () => clinical.cultures(query) });
  const [search, setSearch] = useState(get('q'));
  const [organism, setOrganism] = useState(get('organismo'));

  const columns: Column<CultureSummary>[] = [
    { key: 'collectedAt', label: 'Coleta', value: (c) => c.collectedAt, render: (c) => <Link to={`/microbiologia/${c.id}`}>{formatDate(c.collectedAt, tz)}</Link> },
    { key: 'patient', label: 'Paciente', value: (c) => c.patient.recordNumber, render: (c) => <span className="ig-row" style={{ gap: 6 }}><PatientLabel patient={c.patient} /><DemoTag origin={c.origin} /></span> },
    { key: 'material', label: 'Material', value: (c) => materialLabel(c.material) },
    { key: 'sector', label: 'Setor', value: (c) => sectorName(org.data, c.sectorId) },
    { key: 'outcome', label: 'Resultado', value: (c) => CULTURE_OUTCOME_LABEL[c.outcome], render: (c) => <CultureOutcomeBadge outcome={c.outcome} /> },
    { key: 'organisms', label: 'Microrganismos', value: (c) => c.organisms.join(', '), render: (c) => (c.organisms.length ? <i>{c.organisms.join(', ')}</i> : '—') },
    { key: 'profile', label: 'Perfil', value: (c) => c.resistance.join(', '), render: (c) => (c.resistance.length ? c.resistance.map((r) => <StatusBadge key={r} status="crit">{r}</StatusBadge>) : '—') },
  ];

  return (
    <div className="page">
      <PageHeader title="Microbiologia" subtitle="Culturas, microrganismos e antibiograma. Classificação MDR/XDR/PDR informada pelo laboratório ou pela CCIH; resultados são versionados, nunca sobrescritos." />
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); const next = new URLSearchParams(params); for (const [k, v] of [['q', search.trim()], ['organismo', organism.trim()]] as const) { if (v) next.set(k, v); else next.delete(k); } next.delete('pagina'); setParams(next, { replace: true }); }}>
        <div className="field"><label htmlFor="mic-de">Coleta de</label><input id="mic-de" type="date" className="select" value={get('de')} onChange={(e) => set('de', e.target.value)} /></div>
        <div className="field"><label htmlFor="mic-ate">até</label><input id="mic-ate" type="date" className="select" value={get('ate')} onChange={(e) => set('ate', e.target.value)} /></div>
        <div className="field">
          <label htmlFor="mic-setor">Setor</label>
          <select id="mic-setor" className="select" value={get('setor')} onChange={(e) => set('setor', e.target.value)}>
            <option value="">Todos os meus setores</option>
            {org.data?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mic-mat">Material</label>
          <select id="mic-mat" className="select" value={get('material')} onChange={(e) => set('material', e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(MATERIAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mic-res">Resultado</label>
          <select id="mic-res" className="select" value={get('resultado')} onChange={(e) => set('resultado', e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(CULTURE_OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="mic-org">Microrganismo</label><input id="mic-org" className="select" value={organism} onChange={(e) => setOrganism(e.target.value)} /></div>
        <div className="field"><label htmlFor="mic-q">Paciente</label><input id="mic-q" className="select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Prontuário ou iniciais" /></div>
        <label className="ig-row" style={{ gap: 6, alignSelf: 'center' }}><input type="checkbox" checked={get('mdr') === '1'} onChange={(e) => set('mdr', e.target.checked ? '1' : '')} /> Só multirresistentes</label>
        <Button type="submit" icon="search">Pesquisar</Button>
      </form>
      <DataTable caption="Culturas" columns={columns} rows={list.data?.rows ?? []} rowKey={(c) => c.id} state={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'} onRetry={() => void list.refetch()}
        emptyMessage="Nenhuma cultura com estes filtros. Coletas são registradas a partir da página do paciente." />
      {list.data ? <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set('pagina', String(p))} /> : null}
    </div>
  );
}

export function CulturePage() {
  return <RequireClinical title="Cultura"><Culture /></RequireClinical>;
}

function Culture() {
  const { id = '' } = useParams();
  const clinical = useClinical()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const [recording, setRecording] = useState(false);
  const q = useQuery({ queryKey: ['culture', id], queryFn: () => clinical.culture(id) });
  if (q.isPending) return <div className="page"><LoadingState /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div className="page"><Card>{nf ? <EmptyState title="Cultura não encontrada" /> : <ErrorState onRetry={() => void q.refetch()} />}</Card></div>;
  }
  const c = q.data;
  return (
    <div className="page">
      <PageHeader back={{ to: '/microbiologia', label: 'Microbiologia' }} title={`${materialLabel(c.material)} — ${formatDate(c.collectedAt, tz)}`}
        subtitle={<>Paciente <PatientLabel patient={c.patient} /> · {sectorName(org.data, c.sectorId)} · <CultureOutcomeBadge outcome={c.outcome} /></>}
        actions={session.can('micro:edit') && !recording ? <Button variant="primary" onClick={() => setRecording(true)}>{c.results.length ? 'Corrigir resultado' : 'Registrar resultado'}</Button> : null} />
      {recording ? <ResultForm culture={c} onDone={() => setRecording(false)} /> : null}
      {c.caseIds.length ? <AlertBanner tone="info" title="Vinculada a caso de IRAS">{c.caseIds.map((cid, i) => <Link key={cid} to={`/vigilancia/${cid}`}>{i ? ', ' : ''}Abrir caso {i + 1}</Link>)}</AlertBanner> : null}
      {!c.results.length ? <Card><EmptyState title="Aguardando resultado">Nenhum resultado registrado para esta coleta.</EmptyState></Card> : null}
      {c.results.map((r) => (
        <Card key={r.id} title={`Resultado — versão ${r.version}${r.version === c.resultVersion ? ' (vigente)' : ' (substituída)'}`} subtitle={`${CULTURE_OUTCOME_LABEL[r.outcome]} · liberado ${formatDate(r.reportedAt, tz)} · registrado por ${r.recordedBy}`}>
          {r.justification ? <p className="ig-small" style={{ marginTop: 0 }}>Motivo da correção: {r.justification}</p> : null}
          {r.breakpointVersion ? <p className="ig-small ig-muted" style={{ marginTop: 0 }}>Breakpoint: {r.breakpointVersion}</p> : null}
          {r.isolates.map((iso) => (
            <div key={iso.id} className="ig-section">
              <p className="ig-row" style={{ gap: 8, margin: '0 0 8px' }}><i><b>{iso.organism}</b></i>{iso.quantity ? <span className="ig-small">{iso.quantity}</span> : null}{iso.resistanceProfile ? <StatusBadge status="crit">{RESISTANCE_LABEL[iso.resistanceProfile]}</StatusBadge> : null}{iso.mechanism ? <span className="ig-small">{iso.mechanism}</span> : null}</p>
              {iso.susceptibility.length ? (
                <DataTable dense caption={`Antibiograma — ${iso.organism}`} rows={iso.susceptibility} rowKey={(t) => t.antimicrobial}
                  columns={[
                    { key: 'antimicrobial', label: 'Antimicrobiano' },
                    { key: 'mic', label: 'CIM' },
                    { key: 'interpretation', label: 'Interpretação', value: (t) => t.interpretation, render: (t) => <StatusBadge status={t.interpretation === 'R' ? 'crit' : t.interpretation === 'I' ? 'warn' : 'ok'}>{t.interpretation} — {INTERPRETATION_LABEL[t.interpretation]}</StatusBadge> },
                  ]} />
              ) : <p className="ig-small ig-muted">Sem antibiograma.</p>}
            </div>
          ))}
          {r.notes ? <p className="ig-small">{r.notes}</p> : null}
        </Card>
      ))}
    </div>
  );
}

const emptyIsolate = (): IsolateInput => ({ organism: '', quantity: null, resistanceProfile: null, mechanism: null, susceptibility: [] });

function ResultForm({ culture, onDone }: { culture: CultureDetail; onDone: () => void }) {
  const clinical = useClinical()!;
  const tz = useTimeZone();
  const correction = culture.results.length > 0;
  const [d, setD] = useState({ outcome: 'negativa' as 'negativa' | 'positiva' | 'contaminada', reportedAt: nowLocal(tz), breakpointVersion: '', notes: '', justification: '' });
  const [isolates, setIsolates] = useState<IsolateInput[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useClinicalMutation(() => clinical.addCultureResult(culture.id, {
    outcome: d.outcome, reportedAt: localToIso(d.reportedAt, tz)!, breakpointVersion: d.breakpointVersion.trim() || null, notes: d.notes.trim() || null,
    isolates: d.outcome === 'positiva' ? isolates.map((i) => ({ ...i, organism: i.organism.trim(), susceptibility: i.susceptibility.filter((t) => t.antimicrobial.trim()) })) : [],
    justification: correction ? d.justification.trim() : null,
  }));
  const updateIso = (i: number, patch: Partial<IsolateInput>) => setIsolates(isolates.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = () => {
    const e = {
      isolates: d.outcome === 'positiva' && (!isolates.length || isolates.some((i) => !i.organism.trim())) ? 'Informe o microrganismo de cada isolado.' : undefined,
      justification: correction ? justificationError(d.justification) : undefined,
    };
    setErrors(e);
    if (!Object.values(e).some(Boolean)) m.mutation.mutate(undefined, { onSuccess: onDone });
  };
  return (
    <FormCard title={correction ? 'Corrigir resultado (nova versão)' : 'Registrar resultado'} subtitle={correction ? 'A versão anterior permanece visível como substituída.' : undefined} error={m.formError} onSubmit={submit} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Registrar resultado">
      <div className="ig-form-row">
        <Field label="Resultado" required>
          <select value={d.outcome} onChange={(e) => { const outcome = e.target.value as typeof d.outcome; setD({ ...d, outcome }); if (outcome === 'positiva' && !isolates.length) setIsolates([emptyIsolate()]); }}>
            <option value="negativa">Negativa</option><option value="positiva">Positiva</option><option value="contaminada">Provável contaminação</option>
          </select>
        </Field>
        <Field label="Liberação do laudo" required error={m.fieldErrors.reportedAt ?? null}><input type="datetime-local" value={d.reportedAt} max={nowLocal(tz)} onChange={(e) => setD({ ...d, reportedAt: e.target.value })} /></Field>
        <Field label="Versão do breakpoint"><input value={d.breakpointVersion} maxLength={120} onChange={(e) => setD({ ...d, breakpointVersion: e.target.value })} placeholder="Ex.: BrCAST 2026" /></Field>
      </div>
      {d.outcome === 'positiva' ? (
        <>
          {errors.isolates ?? m.fieldErrors.isolates ? <p className="ig-field-error" role="alert">{errors.isolates ?? m.fieldErrors.isolates}</p> : null}
          {isolates.map((iso, i) => (
            <fieldset key={i} className="isolate-box">
              <legend>Isolado {i + 1}</legend>
              <div className="ig-form-row">
                <Field label="Microrganismo" required><input value={iso.organism} maxLength={120} onChange={(e) => updateIso(i, { organism: e.target.value })} /></Field>
                <Field label="Quantificação"><input value={iso.quantity ?? ''} maxLength={60} onChange={(e) => updateIso(i, { quantity: e.target.value || null })} /></Field>
                <Field label="Perfil (laboratório/CCIH)">
                  <select value={iso.resistanceProfile ?? ''} onChange={(e) => updateIso(i, { resistanceProfile: (e.target.value || null) as ResistanceProfile | null })}>
                    <option value="">Sem classificação</option>
                    {Object.entries(RESISTANCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Mecanismo"><input value={iso.mechanism ?? ''} maxLength={200} onChange={(e) => updateIso(i, { mechanism: e.target.value || null })} placeholder="Ex.: KPC, MRSA" /></Field>
              </div>
              <span className="ig-label">Antibiograma</span>
              {iso.susceptibility.map((t, k) => (
                <div key={k} className="ig-form-row">
                  <Field label={`Antimicrobiano ${k + 1}`}><input value={t.antimicrobial} maxLength={80} onChange={(e) => updateIso(i, { susceptibility: iso.susceptibility.map((x, j) => (j === k ? { ...x, antimicrobial: e.target.value } : x)) })} /></Field>
                  <Field label="CIM"><input value={t.mic ?? ''} maxLength={20} onChange={(e) => updateIso(i, { susceptibility: iso.susceptibility.map((x, j) => (j === k ? { ...x, mic: e.target.value || null } : x)) })} /></Field>
                  <Field label="Interpretação">
                    <select value={t.interpretation} onChange={(e) => updateIso(i, { susceptibility: iso.susceptibility.map((x, j) => (j === k ? { ...x, interpretation: e.target.value as 'S' | 'I' | 'R' } : x)) })}>
                      {Object.entries(INTERPRETATION_LABEL).map(([kk, v]) => <option key={kk} value={kk}>{kk} — {v}</option>)}
                    </select>
                  </Field>
                </div>
              ))}
              <div className="ig-form-actions">
                <Button size="sm" icon="plus" onClick={() => updateIso(i, { susceptibility: [...iso.susceptibility, { antimicrobial: '', mic: null, interpretation: 'S' }] })}>Adicionar antimicrobiano</Button>
                {isolates.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setIsolates(isolates.filter((_, j) => j !== i))}>Remover isolado</Button> : null}
              </div>
            </fieldset>
          ))}
          {isolates.length < 5 ? <div><Button size="sm" icon="plus" onClick={() => setIsolates([...isolates, emptyIsolate()])}>Adicionar isolado</Button></div> : null}
        </>
      ) : null}
      <Field label="Observações"><textarea value={d.notes} maxLength={2000} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      {correction ? <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={errors.justification ?? m.fieldErrors.justification} /> : null}
    </FormCard>
  );
}
