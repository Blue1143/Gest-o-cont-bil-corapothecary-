import { useState, type FormEvent } from 'react';
import { REFERENCE_STATUS_LABEL, formatDate, type ClinicalReference, type ReferenceKind, type ReferenceStatus } from '@ccih/domain';
import { Button, Card, ConfirmDialog, DataTable, ErrorState, Field, FormMessage, LoadingState, ProvenanceTag, StatusBadge, type Column } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import type { ReferenceInput } from '../../data/port';
import { useSession } from '../auth/session';
import { EditAvailability, JustificationField, UnsavedChangesGuard, justificationError, useAdmin, useAdminMutation, useConfigVersions } from './shared';

const KIND_LABEL: Record<ReferenceKind, string> = { regulatoria: 'Regulatória', diretriz: 'Diretriz', protocolo_institucional: 'Protocolo institucional', literatura: 'Literatura' };

type Mode = { kind: 'create' } | { kind: 'edit'; ref: ClinicalReference } | { kind: 'validate'; ref: ClinicalReference };

interface Draft extends ReferenceInput {
  code: string;
}

const empty = (): Draft => ({ code: '', title: '', kind: 'protocolo_institucional', source: '', version: '', updatedAt: '', notes: null, justification: '' });

export function ReferencesPage() {
  const institution = useInstitution();
  const versions = useConfigVersions();
  const session = useSession();
  const admin = useAdmin();
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [status, setStatus] = useState<ReferenceStatus>('vigente');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const canEdit = session.writable && session.can('config:references:edit');
  const canValidate = session.writable && session.can('config:references:validate');

  const save = useAdminMutation(async (d: { mode: Mode; draft: Draft; status: ReferenceStatus; rowVersion: number }) => {
    const { code, ...fields } = d.draft;
    if (d.mode.kind === 'create') return admin!.createReference({ code, ...fields });
    if (d.mode.kind === 'edit') return admin!.updateReference(d.mode.ref.id, { ...fields, rowVersion: d.rowVersion });
    return admin!.validateReference(d.mode.ref.id, { status: d.status, rowVersion: d.rowVersion, justification: d.draft.justification });
  });

  if (institution.isPending) return <LoadingState />;
  if (institution.isError) return <ErrorState onRetry={() => void institution.refetch()} />;
  const { references, config } = institution.data.data;
  const rowVersion = (id: string) => versions.data?.references.find((r) => r.id === id)?.row_version ?? 1;

  const open = (m: Mode) => {
    setSaved(null);
    setErrors({});
    setMode(m);
    if (m.kind === 'create') setDraft(empty());
    else setDraft({ code: '', title: m.ref.title, kind: m.ref.kind, source: m.ref.source, version: m.ref.version, updatedAt: m.ref.updatedAt, notes: m.ref.notes ?? null, justification: '' });
    if (m.kind === 'validate') setStatus(m.ref.status === 'vigente' ? 'revisao_necessaria' : 'vigente');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    const errs: Record<string, string | undefined> = { justification: justificationError(draft.justification) };
    if (mode.kind !== 'validate') {
      if (mode.kind === 'create' && !/^[a-z0-9-]{3,60}$/.test(draft.code)) errs.code = 'Use de 3 a 60 letras minúsculas, números ou hífen.';
      if (draft.title.trim().length < 3) errs.title = 'Informe o título.';
      if (draft.source.trim().length < 3) errs.source = 'Informe a fonte (órgão ou documento).';
      if (!draft.version.trim()) errs.version = 'Informe a versão ou edição.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.updatedAt)) errs.updatedAt = 'Informe a data de atualização.';
    }
    setErrors(errs);
    if (!Object.values(errs).some(Boolean)) setConfirm(true);
  };

  const doSave = () => {
    if (!mode) return;
    const rv = mode.kind === 'create' ? 1 : rowVersion(mode.ref.id);
    save.mutation.mutate(
      { mode, draft: { ...draft, justification: draft.justification.trim(), notes: draft.notes?.trim() || null }, status, rowVersion: rv },
      { onSettled: () => setConfirm(false), onSuccess: () => { setSaved(mode.kind === 'validate' ? 'Situação da referência atualizada.' : 'Referência salva. Ela precisa de validação para valer como regra.'); setMode(null); } },
    );
  };

  const columns: Column<ClinicalReference>[] = [
    { key: 'title', label: 'Referência', render: (r) => <span><b>{r.title}</b><br /><span className="ig-small ig-muted">{r.source}</span></span> },
    { key: 'kind', label: 'Tipo', value: (r) => KIND_LABEL[r.kind] },
    { key: 'version', label: 'Versão' },
    { key: 'updatedAt', label: 'Atualização', render: (r) => formatDate(r.updatedAt) },
    { key: 'validatedBy', label: 'Validação', value: (r) => r.validatedBy ?? '', render: (r) => (r.validatedBy ? `${r.validatedBy} em ${formatDate(r.validatedAt, config.timezone)}` : <ProvenanceTag kind="requer_validacao" />) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status === 'vigente' ? 'ok' : r.status === 'arquivado' ? 'neutral' : 'warn'}>{REFERENCE_STATUS_LABEL[r.status]}</StatusBadge> },
    { key: 'notes', label: 'Observação', hidden: true, sortable: false },
    ...(canEdit || canValidate
      ? [{
          key: 'action', label: 'Ações', sortable: false, exportable: false,
          render: (r: ClinicalReference) => (
            <span className="ig-row" style={{ gap: 6 }}>
              {canEdit ? <Button size="sm" onClick={() => open({ kind: 'edit', ref: r })} aria-label={`Editar ${r.title}`}>Editar</Button> : null}
              {canValidate ? <Button size="sm" onClick={() => open({ kind: 'validate', ref: r })} aria-label={`Validar ${r.title}`}>Validar</Button> : null}
            </span>
          ),
        } as Column<ClinicalReference>]
      : []),
  ];

  const fieldErr = (k: string) => errors[k] ?? save.fieldErrors[k] ?? null;

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <EditAvailability permissionLabel="Cadastrar ou validar referências" allowed={session.can('config:references:edit', 'config:references:validate')} />
      {saved ? <FormMessage tone="success">{saved}</FormMessage> : null}
      {mode ? (
        <Card
          title={mode.kind === 'create' ? 'Nova referência' : mode.kind === 'edit' ? `Editar — ${mode.ref.title}` : `Validar — ${mode.ref.title}`}
          subtitle={mode.kind === 'validate' ? 'A validação registra você como responsável. Só referências vigentes e validadas fundamentam regras.' : 'Qualquer alteração de conteúdo volta a referência para “Revisão necessária”.'}
        >
          <form className="ig-form" onSubmit={submit} noValidate>
            {save.formError ? <FormMessage tone="error">{save.formError}</FormMessage> : null}
            {mode.kind === 'validate' ? (
              <Field label="Nova situação" required>
                <select value={status} onChange={(e) => setStatus(e.target.value as ReferenceStatus)}>
                  {(Object.keys(REFERENCE_STATUS_LABEL) as ReferenceStatus[]).map((s) => <option key={s} value={s}>{REFERENCE_STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
            ) : (
              <>
                {mode.kind === 'create' ? (
                  <Field label="Código" required hint="Identificador estável, ex.: protocolo-cvc-2026." error={fieldErr('code')}>
                    <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase() })} />
                  </Field>
                ) : null}
                <Field label="Título" required error={fieldErr('title')}><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
                <div className="ig-form-row">
                  <Field label="Tipo" required>
                    <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ReferenceKind })}>
                      {(Object.keys(KIND_LABEL) as ReferenceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </Field>
                  <Field label="Versão ou edição" required error={fieldErr('version')}><input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></Field>
                  <Field label="Data de atualização" required error={fieldErr('updatedAt')}><input type="date" value={draft.updatedAt} onChange={(e) => setDraft({ ...draft, updatedAt: e.target.value })} /></Field>
                </div>
                <Field label="Fonte" required hint="Órgão emissor e documento (ex.: ANVISA — RDC nº …)." error={fieldErr('source')}><input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} /></Field>
                <Field label="Observação"><textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={2000} /></Field>
              </>
            )}
            <JustificationField value={draft.justification} onChange={(v) => setDraft({ ...draft, justification: v })} error={errors.justification ?? save.fieldErrors.justification} />
            <div className="ig-form-actions">
              <Button type="submit" variant="primary">{mode.kind === 'validate' ? 'Registrar situação' : 'Salvar referência'}</Button>
              <Button onClick={() => setMode(null)}>Cancelar</Button>
            </div>
          </form>
          <UnsavedChangesGuard when={draft.justification !== ''} />
        </Card>
      ) : null}
      <DataTable
        caption="Referências clínicas e regulatórias"
        columns={columns}
        rows={references}
        rowKey={(r) => r.id}
        searchable
        columnPicker
        toolbar={canEdit && !mode ? <Button size="sm" variant="primary" onClick={() => open({ kind: 'create' })}>Nova referência</Button> : null}
      />
      <ConfirmDialog open={confirm} title={mode?.kind === 'validate' ? 'Registrar a validação?' : 'Salvar a referência?'} confirmLabel="Confirmar" busy={save.mutation.isPending} onConfirm={doSave} onCancel={() => setConfirm(false)}>
        {mode?.kind === 'validate' && status === 'vigente'
          ? 'Você será registrado como responsável pela validação desta referência, que poderá fundamentar regras do sistema.'
          : 'A alteração fica registrada no log de auditoria com a justificativa informada.'}
      </ConfirmDialog>
    </div>
  );
}
