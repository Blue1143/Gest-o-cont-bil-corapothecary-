import { useState } from 'react';
import { SECTOR_KIND_LABEL, type OrgBed, type OrgSector, type OrgUnit, type SectorKind } from '@ccih/domain';
import { Button, Card, ConfirmDialog, DataTable, ErrorState, Field, FormMessage, LoadingState, StatusBadge, type Column } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import { useSession } from '../auth/session';
import { FormCard } from '../clinical/patient-forms';
import { useOrg } from '../clinical/shared';
import { EditAvailability, JustificationField, justificationError, useAdminMutation } from './shared';

const KINDS = Object.entries(SECTOR_KIND_LABEL) as Array<[SectorKind, string]>;
const ORG_KEYS = ['org', 'institution', 'patients', 'census'];

/** "01-10, 12" → ["01".."10", "12"] (zero padding follows the first value). */
export function expandBedCodes(text: string): string[] | string {
  const out: string[] = [];
  for (const part of text.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean)) {
    const range = /^(\d{1,4})-(\d{1,4})$/.exec(part);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (b < a || b - a > 99) return `Intervalo inválido: ${part}.`;
      for (let n = a; n <= b; n++) out.push(String(n).padStart(range[1]!.length, '0'));
    } else if (/^[A-Za-z0-9-]{1,10}$/.test(part)) out.push(part);
    else return `Código inválido: ${part}.`;
  }
  return out.length ? [...new Set(out)] : 'Informe ao menos um leito.';
}

export function OrgPage() {
  const source = useDataSource();
  const session = useSession();
  const org = useOrg();
  const canEdit = session.writable && session.can('config:org:edit') && !!source.orgAdmin;
  const [editing, setEditing] = useState<null | { unit: OrgUnit | null } | { sector: OrgSector | null }>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!source.clinical) return <EditAvailability permissionLabel="Editar instituição, unidades e setores" allowed={false} />;
  if (org.isPending) return <LoadingState />;
  if (org.isError) return <ErrorState onRetry={() => void org.refetch()} />;
  const { units, sectors } = org.data;
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '—';
  const finish = (msg?: string) => { setEditing(null); if (msg) setSaved(msg); };

  const unitCols: Column<OrgUnit>[] = [
    { key: 'name', label: 'Unidade' },
    { key: 'active', label: 'Situação', value: (u) => (u.active ? 'Ativa' : 'Inativa'), render: (u) => <StatusBadge status={u.active ? 'ok' : 'neutral'}>{u.active ? 'Ativa' : 'Inativa'}</StatusBadge> },
    { key: 'sectors', label: 'Setores', align: 'right', value: (u) => sectors.filter((s) => s.unitId === u.id).length },
    ...(canEdit ? [{ key: 'a', label: 'Ação', sortable: false, exportable: false, render: (u: OrgUnit) => <Button size="sm" onClick={() => setEditing({ unit: u })} aria-label={`Editar ${u.name}`}>Editar</Button> } as Column<OrgUnit>] : []),
  ];
  const sectorCols: Column<OrgSector>[] = [
    { key: 'name', label: 'Setor', render: (s) => <span><b>{s.name}</b> <span className="ig-mono ig-small">{s.code}</span></span>, value: (s) => s.name },
    { key: 'unit', label: 'Unidade', value: (s) => unitName(s.unitId) },
    { key: 'kind', label: 'Tipo', value: (s) => SECTOR_KIND_LABEL[s.kind] },
    { key: 'beds', label: 'Leitos ativos · ocupados', align: 'right', value: (s) => s.beds.filter((b) => b.active).length, render: (s) => `${s.beds.filter((b) => b.active).length} · ${s.beds.filter((b) => b.occupied).length}` },
    { key: 'active', label: 'Situação', value: (s) => (s.active ? 'Ativo' : 'Inativo'), render: (s) => <StatusBadge status={s.active ? 'ok' : 'neutral'}>{s.active ? 'Ativo' : 'Inativo'}</StatusBadge> },
    ...(canEdit ? [{ key: 'a', label: 'Ação', sortable: false, exportable: false, render: (s: OrgSector) => <Button size="sm" onClick={() => setEditing({ sector: s })} aria-label={`Editar ${s.name}`}>Editar</Button> } as Column<OrgSector>] : []),
  ];

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <EditAvailability permissionLabel="Editar instituição, unidades e setores" allowed={session.can('config:org:edit')} />
      {saved ? <FormMessage tone="success">{saved}</FormMessage> : null}
      {canEdit && !editing ? (
        <div className="ig-row" style={{ gap: 8 }}>
          <Button icon="plus" onClick={() => setEditing({ unit: null })}>Nova unidade</Button>
          <Button icon="plus" onClick={() => setEditing({ sector: null })}>Novo setor</Button>
        </div>
      ) : null}
      {editing && 'unit' in editing ? <UnitForm unit={editing.unit} onDone={finish} /> : null}
      {editing && 'sector' in editing ? <SectorForm sector={editing.sector} units={units} onDone={finish} /> : null}
      <DataTable caption="Unidades" columns={unitCols} rows={units} rowKey={(u) => u.id} />
      <DataTable caption="Setores e leitos" columns={sectorCols} rows={sectors} rowKey={(s) => s.id} searchable searchPlaceholder="Pesquisar setor" />
    </div>
  );
}

function UnitForm({ unit, onDone }: { unit: OrgUnit | null; onDone: (msg?: string) => void }) {
  const admin = useDataSource().orgAdmin!;
  const [d, setD] = useState({ name: unit?.name ?? '', active: unit?.active ?? true, justification: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useAdminMutation(async () => {
    if (unit) await admin.updateUnit(unit.id, { name: d.name.trim(), active: d.active, rowVersion: unit.rowVersion, justification: d.justification.trim() });
    else await admin.createUnit({ name: d.name.trim(), justification: d.justification.trim() });
  }, ORG_KEYS);
  const submit = () => {
    const e = { name: d.name.trim() ? undefined : 'Informe o nome.', justification: justificationError(d.justification) };
    setErrors(e);
    if (!Object.values(e).some(Boolean)) m.mutation.mutate(undefined, { onSuccess: () => onDone(unit ? 'Unidade atualizada.' : 'Unidade criada.') });
  };
  return (
    <FormCard title={unit ? `Editar ${unit.name}` : 'Nova unidade'} error={m.formError} onSubmit={submit} onCancel={() => onDone()} busy={m.mutation.isPending} submitLabel="Salvar">
      <Field label="Nome" required error={errors.name ?? m.fieldErrors.name ?? null}><input value={d.name} maxLength={120} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
      {unit ? <label className="ig-row" style={{ gap: 8 }}><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Unidade ativa</label> : null}
      {m.fieldErrors.active ? <p className="ig-field-error" role="alert">{m.fieldErrors.active}</p> : null}
      <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={errors.justification ?? m.fieldErrors.justification} />
    </FormCard>
  );
}

function SectorForm({ sector, units, onDone }: { sector: OrgSector | null; units: OrgUnit[]; onDone: (msg?: string) => void }) {
  const admin = useDataSource().orgAdmin!;
  const [d, setD] = useState({ unitId: sector?.unitId ?? units[0]?.id ?? '', code: sector?.code ?? '', name: sector?.name ?? '', kind: (sector?.kind ?? 'internacao') as SectorKind, active: sector?.active ?? true, justification: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useAdminMutation(async () => {
    if (sector) await admin.updateSector(sector.id, { unitId: d.unitId, name: d.name.trim(), kind: d.kind, active: d.active, rowVersion: sector.rowVersion, justification: d.justification.trim() });
    else await admin.createSector({ unitId: d.unitId, code: d.code.trim(), name: d.name.trim(), kind: d.kind, justification: d.justification.trim() });
  }, ORG_KEYS);
  const submit = () => {
    const e = {
      name: d.name.trim() ? undefined : 'Informe o nome.',
      code: sector || /^[a-z0-9-]{2,40}$/.test(d.code.trim()) ? undefined : 'Use letras minúsculas, números e hífen (2 a 40).',
      justification: justificationError(d.justification),
    };
    setErrors(e);
    if (!Object.values(e).some(Boolean)) m.mutation.mutate(undefined, { onSuccess: () => onDone(sector ? 'Setor atualizado.' : 'Setor criado.') });
  };
  return (
    <>
      <FormCard title={sector ? `Editar ${sector.name}` : 'Novo setor'} subtitle={sector ? 'O código não muda: ele identifica o setor em integrações e relatórios.' : undefined} error={m.formError} onSubmit={submit} onCancel={() => onDone()} busy={m.mutation.isPending} submitLabel="Salvar setor">
        <div className="ig-form-row">
          <Field label="Nome" required error={errors.name ?? m.fieldErrors.name ?? null}><input value={d.name} maxLength={120} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          {!sector ? <Field label="Código" required hint="Ex.: uti-pediatrica" error={errors.code ?? m.fieldErrors.code ?? null}><input value={d.code} maxLength={40} onChange={(e) => setD({ ...d, code: e.target.value })} /></Field> : null}
        </div>
        <div className="ig-form-row">
          <Field label="Unidade" required error={m.fieldErrors.unitId ?? null}><select value={d.unitId} onChange={(e) => setD({ ...d, unitId: e.target.value })}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Tipo" required><select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as SectorKind })}>{KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        {sector ? <label className="ig-row" style={{ gap: 8 }}><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Setor ativo</label> : null}
        {m.fieldErrors.active ? <p className="ig-field-error" role="alert">{m.fieldErrors.active}</p> : null}
        <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={errors.justification ?? m.fieldErrors.justification} />
      </FormCard>
      {sector ? <BedsCard sector={sector} /> : null}
    </>
  );
}

function BedsCard({ sector }: { sector: OrgSector }) {
  const admin = useDataSource().orgAdmin!;
  const [codes, setCodes] = useState('');
  const [justification, setJustification] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [toggle, setToggle] = useState<OrgBed | null>(null);
  const add = useAdminMutation((input: { codes: string[]; justification: string }) => admin.addBeds(sector.id, input), ORG_KEYS);
  const update = useAdminMutation((input: { bed: OrgBed; justification: string }) => admin.updateBed(input.bed.id, { active: !input.bed.active, justification: input.justification }), ORG_KEYS);
  const submit = () => {
    const parsed = expandBedCodes(codes);
    const e = { codes: typeof parsed === 'string' ? parsed : undefined, justification: justificationError(justification) };
    setErrors(e);
    if (!Object.values(e).some(Boolean) && typeof parsed !== 'string') add.mutation.mutate({ codes: parsed, justification: justification.trim() }, { onSuccess: () => { setCodes(''); setJustification(''); } });
  };
  return (
    <Card title={`Leitos — ${sector.name}`} subtitle="Leitos ocupados não podem ser desativados.">
      <ul className="ig-devices" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sector.beds.map((b) => (
          <li key={b.id} className="ig-device">
            <b>{b.code}</b>
            <span className={`ig-days ig-tone-${b.occupied ? 'info' : b.active ? 'ok' : 'neutral'}`}>{b.occupied ? 'ocupado' : b.active ? 'livre' : 'inativo'}</span>
            <Button size="sm" variant="ghost" disabled={b.occupied} onClick={() => { setToggle(b); setJustification(''); }} aria-label={`${b.active ? 'Desativar' : 'Reativar'} leito ${b.code}`}>{b.active ? 'Desativar' : 'Reativar'}</Button>
          </li>
        ))}
      </ul>
      <form className="ig-form" style={{ marginTop: 16 }} noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {add.formError ? <FormMessage tone="error">{add.formError}</FormMessage> : null}
        <Field label="Novos leitos" hint="Lista ou intervalo, ex.: 21-25, 30" error={errors.codes ?? add.fieldErrors.codes ?? null}><input value={codes} onChange={(e) => setCodes(e.target.value)} /></Field>
        <JustificationField value={justification} onChange={setJustification} error={errors.justification ?? add.fieldErrors.justification} />
        <div className="ig-form-actions"><Button type="submit" disabled={add.mutation.isPending}>Adicionar leitos</Button></div>
      </form>
      <ConfirmDialog open={!!toggle} title={`${toggle?.active ? 'Desativar' : 'Reativar'} o leito ${toggle?.code ?? ''}?`} confirmLabel="Confirmar" busy={update.mutation.isPending}
        onCancel={() => setToggle(null)}
        onConfirm={() => { const err = justificationError(justification); if (err) { setErrors({ toggle: err }); return; } update.mutation.mutate({ bed: toggle!, justification: justification.trim() }, { onSettled: () => setToggle(null) }); }}>
        <Field label="Justificativa" required error={errors.toggle ?? update.formError ?? null}><textarea value={justification} onChange={(e) => setJustification(e.target.value)} maxLength={500} /></Field>
      </ConfirmDialog>
    </Card>
  );
}
