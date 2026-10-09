import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFERENCE_STATUS_LABEL, type ClinicalReference } from '@ccih/domain';
import { AlertBanner, ConfirmDialog, Field } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import { ApiError } from '../../data/api/http';
import type { AdminPort } from '../../data/port';
import { useSession } from '../auth/session';

export function useAdmin(): AdminPort | undefined {
  return useDataSource().admin;
}

export function useConfigVersions() {
  const admin = useAdmin();
  return useQuery({ queryKey: ['config-versions'], enabled: !!admin, queryFn: () => admin!.versions() });
}

export type FieldErrors = Record<string, string>;

/** Runs an admin change, refreshes configuration everywhere and maps API field errors. */
export function useAdminMutation<I, O = void>(run: (input: I) => Promise<O>, invalidate: string[] = ['institution', 'config-versions']) {
  const client = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: run,
    onMutate: () => setFieldErrors({}),
    onSuccess: async () => {
      await Promise.all(invalidate.map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
    onError: (e) => {
      if (e instanceof ApiError) setFieldErrors(Object.fromEntries(e.fields.map((f) => [f.path, f.message])));
    },
  });
  const formError = mutation.error ? (mutation.error instanceof ApiError ? mutation.error.message : 'Não foi possível salvar.') : null;
  return { mutation, fieldErrors, formError };
}

/** Explains why editing is unavailable (demo source or missing permission). */
export function EditAvailability({ permissionLabel, allowed }: { permissionLabel: string; allowed: boolean }) {
  const session = useSession();
  if (!session.writable) {
    return (
      <AlertBanner tone="info" title="Modo demonstração: configurações apenas exibidas">
        A edição, com controle de acesso e registro no log de auditoria, exige o backend (VITE_DATA_SOURCE=api).
      </AlertBanner>
    );
  }
  if (!allowed) return <AlertBanner tone="info" title="Somente leitura">Seu perfil não tem a permissão “{permissionLabel}”.</AlertBanner>;
  return null;
}

export function JustificationField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | undefined }) {
  return (
    <Field label="Justificativa da alteração" required hint="Fica registrada no log de auditoria junto com os valores anterior e novo." error={error ?? null}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} />
    </Field>
  );
}

export function justificationError(value: string): string | undefined {
  return value.trim().length < 10 ? 'Descreva o motivo (mínimo 10 caracteres).' : undefined;
}

export function ReferenceSelect({ references, value, onChange }: { references: ClinicalReference[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sem referência vinculada</option>
      {references.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title} — {REFERENCE_STATUS_LABEL[r.status]}{r.validatedBy ? '' : ' (requer validação)'}
        </option>
      ))}
    </select>
  );
}

/** Prevents losing edits: blocks in-app navigation and warns on tab close while `when` is true. */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Descartar alterações?"
      confirmLabel="Descartar e sair"
      tone="danger"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      Há alterações não salvas neste formulário. Se sair agora, elas serão perdidas.
    </ConfirmDialog>
  );
}
