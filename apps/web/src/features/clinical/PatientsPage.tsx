import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DEVICE_LABEL, SEX_LABEL, ageLabel, hospitalDay, normalizeInitials, todayIn, dateInZone, type PatientSummary } from '@ccih/domain';
import { Button, Card, DataTable, Field, FormMessage, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import { UnsavedChangesGuard } from '../admin/shared';
import type { PatientInput } from '../../data/port';
import { DemoTag, PageHeader, Pager, PatientLabel, RequireClinical, localToIso, nowLocal, sectorName, useClinical, useClinicalMutation, useOrg, useTimeZone } from './shared';

export function PatientsPage() {
  return (
    <RequireClinical title="Pacientes">
      <Patients />
    </RequireClinical>
  );
}

function Patients() {
  const clinical = useClinical()!;
  const session = useSession();
  const org = useOrg();
  const tz = useTimeZone();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'internados';
  const sectorId = params.get('setor') ?? '';
  const page = Number(params.get('pagina') ?? '1') || 1;
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next, { replace: true });
  };
  const [search, setSearch] = useState(q);
  const list = useQuery({ queryKey: ['patients', q, status, sectorId, page], queryFn: () => clinical.patients({ q: q || undefined, status, sectorId: sectorId || undefined, page, pageSize: 25 }) });
  const today = todayIn(tz);

  const columns: Column<PatientSummary>[] = [
    { key: 'patient', label: 'Paciente', value: (p) => p.recordNumber, render: (p) => <span className="ig-row" style={{ gap: 6 }}><PatientLabel patient={p} /><DemoTag origin={p.origin} /></span> },
    { key: 'age', label: 'Idade · sexo', sortable: false, render: (p) => `${ageLabel(p.birthDate, today)} · ${SEX_LABEL[p.sex]}` },
    { key: 'sector', label: 'Setor · leito', value: (p) => sectorName(org.data, p.current?.sectorId), render: (p) => (p.current ? `${sectorName(org.data, p.current.sectorId)}${p.current.bedCode ? ` · leito ${p.current.bedCode}` : ' · sem leito'}` : <span className="ig-muted">Sem internação ativa</span>) },
    { key: 'day', label: 'Dia de internação', align: 'right', value: (p) => (p.current ? hospitalDay(dateInZone(new Date(p.current.admittedAt), tz), today) : null), render: (p) => (p.current ? `D${hospitalDay(dateInZone(new Date(p.current.admittedAt), tz), today)}` : '—') },
    { key: 'devices', label: 'Dispositivos', sortable: false, render: (p) => (p.activeDevices.length ? <span className="ig-row" style={{ gap: 4 }}>{p.activeDevices.map((d) => <span key={d} className="ig-prov" title={DEVICE_LABEL[d]}>{d}</span>)}</span> : <span className="ig-muted">—</span>) },
    { key: 'cases', label: 'Investigações abertas', align: 'right', value: (p) => p.openCases, render: (p) => (p.openCases ? <b>{p.openCases}</b> : '0') },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Pacientes"
        subtitle="Identificação por iniciais e prontuário. O nome completo, quando cadastrado, fica cifrado e só é exibido com permissão específica e registro no log."
        actions={session.can('patient:edit') && !creating ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Registrar paciente</Button> : null}
      />
      {creating ? <NewPatientForm onClose={() => setCreating(false)} /> : null}
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); set('q', search.trim()); }}>
        <div className="field">
          <label htmlFor="pac-q">Prontuário ou iniciais</label>
          <input id="pac-q" className="select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: DEMO-100123 ou MAS" />
        </div>
        <div className="field">
          <label htmlFor="pac-status">Situação</label>
          <select id="pac-status" className="select" value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="internados">Internados agora</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pac-setor">Setor</label>
          <select id="pac-setor" className="select" value={sectorId} onChange={(e) => set('setor', e.target.value)}>
            <option value="">Todos os meus setores</option>
            {org.data?.sectors.filter((s) => s.kind === 'uti' || s.kind === 'internacao').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <Button type="submit" icon="search">Pesquisar</Button>
      </form>
      <DataTable
        caption={status === 'internados' ? 'Pacientes internados' : 'Pacientes'}
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(p) => p.id}
        state={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'}
        onRetry={() => void list.refetch()}
        emptyMessage="Nenhum paciente encontrado com estes filtros."
      />
      {list.data ? <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set('pagina', String(p))} /> : null}
    </div>
  );
}

interface Draft {
  recordNumber: string; initials: string; fullName: string; birthDate: string; sex: 'F' | 'M' | 'NI';
  admit: boolean; admittedAt: string; sectorId: string; bedId: string; diagnosis: string;
}

function NewPatientForm({ onClose }: { onClose: () => void }) {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>({ recordNumber: '', initials: '', fullName: '', birthDate: '', sex: 'NI', admit: true, admittedAt: nowLocal(tz), sectorId: '', bedId: '', diagnosis: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const create = useClinicalMutation((input: PatientInput) => clinical.createPatient(input));
  // Navigate only after the unsaved-changes guard has been released (otherwise it blocks the redirect).
  const [createdId, setCreatedId] = useState<string | null>(null);
  useEffect(() => { if (createdId) navigate(`/pacientes/${createdId}`); }, [createdId, navigate]);
  const wards = org.data?.sectors.filter((s) => s.kind === 'uti' || s.kind === 'internacao') ?? [];
  const beds = wards.find((s) => s.id === d.sectorId)?.beds.filter((b) => b.active && !b.occupied) ?? [];
  const err = (k: string) => errors[k] ?? create.fieldErrors[k] ?? null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string | undefined> = {};
    if (!/^[A-Za-z0-9./-]{1,30}$/.test(d.recordNumber.trim())) next.recordNumber = 'Informe o prontuário (até 30 letras, números, ponto, barra ou hífen).';
    if (!normalizeInitials(d.initials) && !d.fullName.trim()) next.initials = 'Informe as iniciais (1 a 6 letras).';
    if (d.admit && !d.sectorId) next['admission.sectorId'] = 'Selecione o setor.';
    if (d.admit && !d.admittedAt) next['admission.admittedAt'] = 'Informe data e hora da admissão.';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    create.mutation.mutate(
      {
        recordNumber: d.recordNumber.trim(), initials: d.initials, fullName: d.fullName.trim() || null, birthDate: d.birthDate || null, sex: d.sex,
        admission: d.admit ? { admittedAt: localToIso(d.admittedAt, tz)!, sectorId: d.sectorId, bedId: d.bedId || null, diagnosis: d.diagnosis.trim() || null } : null,
      },
      { onSuccess: (out) => setCreatedId(out.id) },
    );
  };

  return (
    <Card title="Registrar paciente" subtitle="Nunca use dados reais em ambiente de demonstração.">
      <form className="ig-form" onSubmit={submit} noValidate>
        {create.formError ? <FormMessage tone="error">{create.formError}</FormMessage> : null}
        <div className="ig-form-row">
          <Field label="Prontuário" required error={err('recordNumber')}>
            <input value={d.recordNumber} onChange={(e) => setD({ ...d, recordNumber: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Iniciais" required hint="Ex.: MAS. Se vazio, são derivadas do nome." error={err('initials')}>
            <input value={d.initials} onChange={(e) => setD({ ...d, initials: e.target.value })} maxLength={20} autoComplete="off" />
          </Field>
        </div>
        <Field label="Nome completo" hint="Fica cifrado no servidor. A instalação pode desabilitar este campo (sem chave de cifragem)." error={err('fullName')}>
          <input value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} autoComplete="off" />
        </Field>
        <div className="ig-form-row">
          <Field label="Data de nascimento" error={err('birthDate')}>
            <input type="date" value={d.birthDate} onChange={(e) => setD({ ...d, birthDate: e.target.value })} max={todayIn(tz)} />
          </Field>
          <Field label="Sexo" required>
            <select value={d.sex} onChange={(e) => setD({ ...d, sex: e.target.value as Draft['sex'] })}>
              {Object.entries(SEX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <label className="ig-row" style={{ gap: 8 }}>
          <input type="checkbox" checked={d.admit} onChange={(e) => setD({ ...d, admit: e.target.checked })} /> Registrar internação agora
        </label>
        {d.admit ? (
          <>
            <div className="ig-form-row">
              <Field label="Admissão (data e hora)" required hint={`Horário de ${tz}.`} error={err('admission.admittedAt')}>
                <input type="datetime-local" value={d.admittedAt} onChange={(e) => setD({ ...d, admittedAt: e.target.value })} max={nowLocal(tz)} />
              </Field>
              <Field label="Setor" required error={err('admission.sectorId')}>
                <select value={d.sectorId} onChange={(e) => setD({ ...d, sectorId: e.target.value, bedId: '' })}>
                  <option value="">Selecione</option>
                  {wards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Leito" hint={d.sectorId ? `${beds.length} livre(s)` : undefined} error={err('bedId')}>
                <select value={d.bedId} onChange={(e) => setD({ ...d, bedId: e.target.value })} disabled={!d.sectorId}>
                  <option value="">Sem leito definido</option>
                  {beds.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Diagnóstico de internação">
              <input value={d.diagnosis} onChange={(e) => setD({ ...d, diagnosis: e.target.value })} maxLength={300} />
            </Field>
          </>
        ) : null}
        <div className="ig-form-actions">
          <Button type="submit" variant="primary" disabled={create.mutation.isPending}>{create.mutation.isPending ? 'Salvando…' : 'Registrar'}</Button>
          <Button onClick={onClose}>Cancelar</Button>
          <Link to="/censo" className="ig-small">Ver ocupação no censo</Link>
        </div>
      </form>
      <UnsavedChangesGuard when={!!(d.recordNumber || d.fullName) && !createdId} />
    </Card>
  );
}
