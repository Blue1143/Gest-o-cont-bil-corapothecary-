import { useState, type FormEvent } from 'react';
import { TEST_TYPE_LABEL, requiresValidation, type SterilizationTestType } from '@ccih/domain';
import { Button, Card, ConfirmDialog, ErrorState, Field, FormMessage, LoadingState, ProvenanceTag } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import { useSession } from '../auth/session';
import { EditAvailability, JustificationField, ReferenceSelect, UnsavedChangesGuard, justificationError, useAdmin, useAdminMutation, useConfigVersions } from './shared';

const LOAD_TESTS = (Object.keys(TEST_TYPE_LABEL) as SterilizationTestType[]).filter((t) => t !== 'BOWIE_DICK');

export function CmePolicyPage() {
  const institution = useInstitution();
  const versions = useConfigVersions();
  const session = useSession();
  const admin = useAdmin();
  const canEdit = session.writable && session.can('config:cme_policy:edit');
  const [draft, setDraft] = useState<{ tests: SterilizationTestType[]; bd: boolean; hold: boolean; referenceId: string; justification: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useAdminMutation((input: Parameters<NonNullable<typeof admin>['savePolicy']>[0]) => admin!.savePolicy(input));

  if (institution.isPending) return <LoadingState />;
  if (institution.isError) return <ErrorState onRetry={() => void institution.refetch()} />;
  const { loadReleasePolicy: policy, references } = institution.data.data;
  const ref = references.find((r) => r.id === policy?.referenceId);

  const startEdit = () => {
    if (!policy) return;
    setSaved(false);
    setErrors({});
    setDraft({ tests: [...policy.requiredLoadTests], bd: policy.requireDailyBowieDick, hold: policy.holdImplantsUntilBiological, referenceId: policy.referenceId ?? '', justification: '' });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const errs = { tests: draft.tests.length ? undefined : 'Selecione ao menos um teste obrigatório por carga.', justification: justificationError(draft.justification) };
    setErrors(errs);
    if (!Object.values(errs).some(Boolean)) setConfirm(true);
  };

  const doSave = () => {
    if (!draft) return;
    save.mutation.mutate(
      { requiredLoadTests: draft.tests, requireDailyBowieDick: draft.bd, holdImplantsUntilBiological: draft.hold, referenceId: draft.referenceId || null, rowVersion: versions.data?.policy?.row_version ?? 1, justification: draft.justification.trim() },
      { onSettled: () => setConfirm(false), onSuccess: () => { setDraft(null); setSaved(true); } },
    );
  };

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <EditAvailability permissionLabel="Editar a política de liberação de cargas da CME" allowed={session.can('config:cme_policy:edit')} />
      {saved ? <FormMessage tone="success">Política de liberação atualizada.</FormMessage> : null}
      <Card title="Política de liberação de cargas" subtitle="Aplicada pelo motor de regras da CME. Sem política, o sistema exibe os testes mas não decide a liberação." actions={canEdit && !draft && policy ? <Button size="sm" onClick={startEdit}>Editar política</Button> : null}>
        {!policy ? (
          <p className="ig-muted">Nenhuma política configurada.</p>
        ) : !draft ? (
          <dl className="def-list">
            <dt>Testes obrigatórios por carga</dt><dd>{policy.requiredLoadTests.map((t) => TEST_TYPE_LABEL[t]).join(', ')}</dd>
            <dt>Bowie-Dick diário do equipamento</dt><dd>{policy.requireDailyBowieDick ? 'Exigido antes da primeira carga' : 'Não exigido'}</dd>
            <dt>Cargas com implantável</dt><dd>{policy.holdImplantsUntilBiological ? 'Retidas até o resultado do indicador biológico' : 'Sem retenção específica'}</dd>
            <dt>Referência</dt><dd>{ref?.title ?? 'Sem referência'}{requiresValidation(ref) ? <ProvenanceTag kind="requer_validacao" /> : null}</dd>
          </dl>
        ) : (
          <form className="ig-form" onSubmit={submit} noValidate>
            {save.formError ? <FormMessage tone="error">{save.formError}</FormMessage> : null}
            <fieldset className="ig-checks" aria-describedby={errors.tests ? 'tests-error' : undefined}>
              <legend>Testes obrigatórios por carga *</legend>
              {LOAD_TESTS.map((t) => (
                <label key={t}>
                  <input type="checkbox" checked={draft.tests.includes(t)} onChange={(e) => setDraft({ ...draft, tests: e.target.checked ? [...draft.tests, t] : draft.tests.filter((x) => x !== t) })} />
                  {TEST_TYPE_LABEL[t]}
                </label>
              ))}
            </fieldset>
            {errors.tests ? <p id="tests-error" className="ig-field-error" role="alert">{errors.tests}</p> : null}
            <fieldset className="ig-checks">
              <legend>Regras adicionais</legend>
              <label><input type="checkbox" checked={draft.bd} onChange={(e) => setDraft({ ...draft, bd: e.target.checked })} />Exigir Bowie-Dick aprovado no dia</label>
              <label><input type="checkbox" checked={draft.hold} onChange={(e) => setDraft({ ...draft, hold: e.target.checked })} />Reter implantáveis até o indicador biológico</label>
            </fieldset>
            <Field label="Referência que fundamenta a política">
              <ReferenceSelect references={references} value={draft.referenceId} onChange={(v) => setDraft({ ...draft, referenceId: v })} />
            </Field>
            <JustificationField value={draft.justification} onChange={(v) => setDraft({ ...draft, justification: v })} error={errors.justification ?? save.fieldErrors.justification} />
            <div className="ig-form-actions">
              <Button type="submit" variant="primary">Salvar política</Button>
              <Button onClick={() => setDraft(null)}>Cancelar</Button>
            </div>
            <UnsavedChangesGuard when={draft.justification !== ''} />
          </form>
        )}
      </Card>
      <ConfirmDialog open={confirm} title="Alterar a política de liberação?" confirmLabel="Salvar política" busy={save.mutation.isPending} onConfirm={doSave} onCancel={() => setConfirm(false)}>
        A política vale para as próximas decisões de liberação. Decisões já registradas não são alteradas. A mudança fica no log de auditoria.
      </ConfirmDialog>
    </div>
  );
}
