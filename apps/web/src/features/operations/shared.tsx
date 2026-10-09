import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, todayIn } from '@ccih/domain';
import { AlertBanner, ConfirmDialog, Field } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import type { OperationsPort } from '../../data/port';
import { justificationError, useAdminMutation } from '../admin/shared';
import { PageHeader, useOrg, useTimeZone } from '../clinical/shared';

export function useOps(): OperationsPort | undefined {
  return useDataSource().operations;
}

/** Query keys refreshed after any operational change (indicators and alerts depend on them). */
export const OPS_KEYS = ['bundles', 'hand-hygiene', 'quality', 'alerts', 'trainings', 'supplies', 'surveillance', 'surgery', 'facts'];

export function useOpsMutation<I, O = unknown>(run: (input: I) => Promise<O>) {
  return useAdminMutation<I, O>(run, OPS_KEYS);
}

export function RequireOps({ title, children }: { title: string; children: ReactNode }) {
  if (useOps()) return <>{children}</>;
  return (
    <div className="page">
      <PageHeader title={title} />
      <AlertBanner tone="info" title="Módulo disponível com o backend">
        Registros de qualidade, treinamentos, insumos e alertas exigem a API, com controle de acesso e auditoria (VITE_DATA_SOURCE=api).
      </AlertBanner>
    </div>
  );
}

/** URL-backed filters (shareable, survive reloads). */
export function useUrlFilters(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? defaults[k] ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'pagina') next.delete('pagina');
    setParams(next, { replace: true });
  };
  return { get, set, page: Number(params.get('pagina') ?? '1') || 1 };
}

/** Default period: last 30 days in the institution zone. */
export function useDefaultPeriod() {
  const tz = useTimeZone();
  const today = todayIn(tz);
  return { from: addDays(today, -30), to: today, today };
}

export function SectorFilter({ id, value, onChange, kinds = ['uti', 'internacao'] }: { id: string; value: string; onChange: (v: string) => void; kinds?: string[] }) {
  const org = useOrg();
  return (
    <div className="field">
      <label htmlFor={id}>Setor</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos os meus setores</option>
        {org.data?.sectors.filter((s) => kinds.includes(s.kind)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

/** Voiding instead of deleting: reason required, record stays visible and leaves the indicators. */
export function VoidDialog({ open, title, onVoid, onClose }: { open: boolean; title: string; onVoid: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useOpsMutation(onVoid);
  return (
    <ConfirmDialog open={open} title={title} confirmLabel="Anular registro" tone="danger" busy={m.mutation.isPending} onCancel={() => { setReason(''); setError(null); onClose(); }}
      onConfirm={() => {
        const e = justificationError(reason);
        if (e) { setError(e); return; }
        m.mutation.mutate(reason.trim(), { onSuccess: () => { setReason(''); onClose(); }, onError: () => setError(m.formError) });
      }}>
      <p style={{ marginTop: 0 }}>O registro continua visível, marcado como anulado, e deixa de contar nos indicadores.</p>
      <Field label="Motivo da anulação" required error={error ?? m.formError}><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
    </ConfirmDialog>
  );
}

export const pct = (num: number, den: number) => (den ? (num / den) * 100 : null);
