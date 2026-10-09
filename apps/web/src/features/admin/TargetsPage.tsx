import { useState, type FormEvent } from 'react';
import { CATEGORY_LABEL, INDICATORS, findTarget, formatDate, formatNumber, type IndicatorDefinition } from '@ccih/domain';
import { Button, Card, ConfirmDialog, DataTable, ErrorState, Field, FormMessage, LoadingState, ProvenanceTag, type Column } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import { useSession } from '../auth/session';
import { EditAvailability, JustificationField, ReferenceSelect, UnsavedChangesGuard, justificationError, useAdmin, useAdminMutation, useConfigVersions } from './shared';

interface Draft {
  value: string;
  warningBand: string;
  referenceId: string;
  justification: string;
}

const parseNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function TargetsPage() {
  const institution = useInstitution();
  const versions = useConfigVersions();
  const session = useSession();
  const admin = useAdmin();
  const [selected, setSelected] = useState<IndicatorDefinition | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirm, setConfirm] = useState<'save' | 'remove' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const canEdit = session.writable && session.can('config:targets:edit');

  const save = useAdminMutation((d: { id: string; input: Parameters<NonNullable<typeof admin>['saveTarget']>[1] }) => admin!.saveTarget(d.id, d.input));
  const remove = useAdminMutation((d: { id: string; justification: string }) => admin!.deleteTarget(d.id, d.justification));

  if (institution.isPending) return <LoadingState />;
  if (institution.isError) return <ErrorState onRetry={() => void institution.refetch()} />;
  const { config, references } = institution.data.data;

  const open = (def: IndicatorDefinition) => {
    const t = findTarget(config, def.id);
    setSelected(def);
    setSaved(null);
    setErrors({});
    setDraft({ value: t ? String(t.value) : '', warningBand: t?.warningBand != null ? String(t.warningBand) : '', referenceId: t?.referenceId ?? '', justification: '' });
  };
  const close = () => { setSelected(null); setDraft(null); };
  const dirty = !!draft && (draft.justification !== '' || draft.value !== (findTarget(config, selected?.id ?? '')?.value.toString() ?? ''));

  const validate = (): boolean => {
    if (!draft) return false;
    const e: Record<string, string | undefined> = {};
    const v = parseNum(draft.value);
    if (v == null || Number.isNaN(v)) e.value = 'Informe o valor da meta.';
    else if (v < 0) e.value = 'A meta não pode ser negativa.';
    const b = parseNum(draft.warningBand);
    if (b != null && (Number.isNaN(b) || b < 0)) e.warningBand = 'A faixa de atenção deve ser um número maior ou igual a zero.';
    e.justification = justificationError(draft.justification);
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (validate()) setConfirm('save');
  };

  const doSave = () => {
    if (!selected || !draft) return;
    const rowVersion = versions.data?.targets.find((t) => t.indicator_id === selected.id)?.row_version ?? null;
    save.mutation.mutate(
      { id: selected.id, input: { value: parseNum(draft.value)!, warningBand: parseNum(draft.warningBand), referenceId: draft.referenceId || null, rowVersion, justification: draft.justification.trim() } },
      { onSettled: () => setConfirm(null), onSuccess: () => { setSaved(`Meta de “${selected.name}” salva como meta institucional.`); close(); } },
    );
  };

  const doRemove = () => {
    if (!selected || !draft) return;
    const err = justificationError(draft.justification);
    if (err) { setErrors({ justification: err }); setConfirm(null); return; }
    remove.mutation.mutate({ id: selected.id, justification: draft.justification.trim() }, { onSettled: () => setConfirm(null), onSuccess: () => { setSaved(`Meta de “${selected.name}” removida.`); close(); } });
  };

  const columns: Column<IndicatorDefinition>[] = [
    { key: 'name', label: 'Indicador', render: (d) => <span><b>{d.name}</b><br /><span className="ig-small ig-muted">{CATEGORY_LABEL[d.category]} · {d.unit} · melhor quando {d.direction === 'lower' ? 'menor' : 'maior'}</span></span> },
    {
      key: 'target', label: 'Meta atual', value: (d) => findTarget(config, d.id)?.value ?? null,
      render: (d) => {
        const t = findTarget(config, d.id);
        if (!t) return <span className="ig-muted">Não configurada</span>;
        return (
          <span className="ig-row" style={{ gap: 6 }}>
            {t.direction === 'lower' ? '≤' : '≥'} {formatNumber(t.value, d.decimals)}{t.warningBand != null ? ` (atenção ±${formatNumber(t.warningBand, d.decimals)})` : ''}
            <ProvenanceTag kind={t.origin === 'demonstracao' ? 'meta_demo' : 'meta_institucional'} />
          </span>
        );
      },
    },
    { key: 'approved', label: 'Aprovada por', value: (d) => findTarget(config, d.id)?.approvedBy ?? '', render: (d) => { const t = findTarget(config, d.id); return t?.approvedBy ? `${t.approvedBy} · vigente desde ${formatDate(t.validFrom)}` : '—'; } },
    ...(canEdit ? [{ key: 'action', label: 'Ação', sortable: false, exportable: false, render: (d: IndicatorDefinition) => <Button size="sm" onClick={() => open(d)} aria-label={`Editar meta de ${d.name}`}>Editar</Button> } as Column<IndicatorDefinition>] : []),
  ];

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <EditAvailability permissionLabel="Editar metas de indicadores" allowed={session.can('config:targets:edit')} />
      {saved ? <FormMessage tone="success">{saved}</FormMessage> : null}
      {selected && draft ? (
        <Card title={`Meta — ${selected.name}`} subtitle={`${selected.description} Direção definida pelo catálogo: melhor quando ${selected.direction === 'lower' ? 'menor' : 'maior'}.`}>
          <form className="ig-form" onSubmit={submit} noValidate>
            {save.formError ? <FormMessage tone="error">{save.formError}</FormMessage> : null}
            <div className="ig-form-row">
              <Field label={`Meta (${selected.unit})`} required error={errors.value ?? save.fieldErrors.value ?? null}>
                <input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
              </Field>
              <Field label={`Faixa de atenção (${selected.unit})`} hint="Tolerância para o status “Atenção”. Sem faixa, o resultado é só Conforme ou Fora da meta." error={errors.warningBand ?? null}>
                <input inputMode="decimal" value={draft.warningBand} onChange={(e) => setDraft({ ...draft, warningBand: e.target.value })} />
              </Field>
            </div>
            <Field label="Referência que fundamenta a meta" hint="Protocolo institucional, série histórica ou referência regulatória cadastrada.">
              <ReferenceSelect references={references} value={draft.referenceId} onChange={(v) => setDraft({ ...draft, referenceId: v })} />
            </Field>
            <JustificationField value={draft.justification} onChange={(v) => setDraft({ ...draft, justification: v })} error={errors.justification ?? save.fieldErrors.justification} />
            <div className="ig-form-actions">
              <Button type="submit" variant="primary">Salvar meta</Button>
              <Button onClick={close}>Cancelar</Button>
              {findTarget(config, selected.id) ? <Button variant="danger" onClick={() => setConfirm('remove')}>Remover meta</Button> : null}
            </div>
          </form>
          <UnsavedChangesGuard when={dirty} />
        </Card>
      ) : null}
      <DataTable caption="Metas por indicador" columns={columns} rows={INDICATORS} rowKey={(d) => d.id} searchable searchPlaceholder="Pesquisar indicador" pageSize={12} />
      <ConfirmDialog open={confirm === 'save'} title="Salvar meta institucional?" confirmLabel="Salvar meta" busy={save.mutation.isPending} onConfirm={doSave} onCancel={() => setConfirm(null)}>
        A meta passa a valer como <b>meta institucional</b>, com você como aprovador. Os valores anterior e novo e a justificativa ficam no log de auditoria.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'remove'} title="Remover a meta?" confirmLabel="Remover meta" tone="danger" busy={remove.mutation.isPending} onConfirm={doRemove} onCancel={() => setConfirm(null)}>
        O indicador passará a mostrar “Sem meta configurada”. Informe a justificativa no formulário antes de confirmar.
      </ConfirmDialog>
    </div>
  );
}
