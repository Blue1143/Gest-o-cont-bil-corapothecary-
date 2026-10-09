import { useState, type FormEvent, type ReactNode } from 'react';
import { DEVICE_LABEL, MATERIAL_LABEL, NOTE_KIND_LABEL, OUTCOME_LABEL, type AdmissionDto, type DeviceDto, type DeviceType, type NoteDto } from '@ccih/domain';
import { Button, Card, ConfirmDialog, Field, FormMessage } from '@ccih/ui';
import { JustificationField, justificationError } from '../admin/shared';
import { localToIso, nowLocal, useClinical, useClinicalMutation, useOrg, useTimeZone } from './shared';

/** Shared frame for the small clinical forms (one action at a time, cancel always available). */
export function FormCard({ title, subtitle, error, onSubmit, onCancel, busy, submitLabel, children }: {
  title: string; subtitle?: ReactNode; error: string | null; onSubmit: () => void; onCancel: () => void; busy: boolean; submitLabel: string; children: ReactNode;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      <form className="ig-form" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {children}
        <div className="ig-form-actions">
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</Button>
          <Button onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

const required = (v: string, message: string) => (v ? undefined : message);
const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);

export function AdmissionForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
  const [d, setD] = useState({ admittedAt: nowLocal(tz), sectorId: '', bedId: '', diagnosis: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useClinicalMutation((input: Parameters<typeof clinical.admit>[1]) => clinical.admit(patientId, input));
  const wards = org.data?.sectors.filter((s) => s.kind === 'uti' || s.kind === 'internacao') ?? [];
  const beds = wards.find((s) => s.id === d.sectorId)?.beds.filter((b) => b.active && !b.occupied) ?? [];
  const submit = () => {
    const e = { sectorId: required(d.sectorId, 'Selecione o setor.'), admittedAt: required(d.admittedAt, 'Informe data e hora.') };
    setErrors(e);
    if (!hasErrors(e)) m.mutation.mutate({ admittedAt: localToIso(d.admittedAt, tz)!, sectorId: d.sectorId, bedId: d.bedId || null, diagnosis: d.diagnosis.trim() || null }, { onSuccess: onDone });
  };
  return (
    <FormCard title="Nova internação" error={m.formError} onSubmit={submit} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Registrar internação">
      <div className="ig-form-row">
        <Field label="Admissão" required hint={`Horário de ${tz}.`} error={errors.admittedAt ?? m.fieldErrors['admission.admittedAt'] ?? null}>
          <input type="datetime-local" value={d.admittedAt} max={nowLocal(tz)} onChange={(e) => setD({ ...d, admittedAt: e.target.value })} />
        </Field>
        <Field label="Setor" required error={errors.sectorId ?? m.fieldErrors['admission.sectorId'] ?? null}>
          <select value={d.sectorId} onChange={(e) => setD({ ...d, sectorId: e.target.value, bedId: '' })}>
            <option value="">Selecione</option>
            {wards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Leito" error={m.fieldErrors.bedId ?? null}>
          <select value={d.bedId} onChange={(e) => setD({ ...d, bedId: e.target.value })} disabled={!d.sectorId}>
            <option value="">Sem leito definido</option>
            {beds.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Diagnóstico de internação"><input value={d.diagnosis} maxLength={300} onChange={(e) => setD({ ...d, diagnosis: e.target.value })} /></Field>
    </FormCard>
  );
}

export function TransferForm({ admission, onDone }: { admission: AdmissionDto; onDone: () => void }) {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
  const [d, setD] = useState({ at: nowLocal(tz), sectorId: '', bedId: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useClinicalMutation((input: Parameters<typeof clinical.transfer>[1]) => clinical.transfer(admission.id, input));
  const wards = org.data?.sectors.filter((s) => s.kind === 'uti' || s.kind === 'internacao') ?? [];
  const beds = wards.find((s) => s.id === d.sectorId)?.beds.filter((b) => b.active && !b.occupied) ?? [];
  const submit = () => {
    const e = { sectorId: required(d.sectorId, 'Selecione o setor de destino.'), at: required(d.at, 'Informe data e hora.') };
    setErrors(e);
    if (!hasErrors(e)) m.mutation.mutate({ at: localToIso(d.at, tz)!, sectorId: d.sectorId, bedId: d.bedId || null, reason: d.reason.trim() || null, rowVersion: admission.rowVersion }, { onSuccess: onDone });
  };
  return (
    <FormCard title="Transferir paciente" subtitle="Encerra a permanência atual e abre a nova no mesmo horário (paciente-dia vai para o setor onde o paciente está no horário do censo)." error={m.formError} onSubmit={submit} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Transferir">
      <div className="ig-form-row">
        <Field label="Data e hora" required error={errors.at ?? m.fieldErrors.at ?? null}><input type="datetime-local" value={d.at} max={nowLocal(tz)} onChange={(e) => setD({ ...d, at: e.target.value })} /></Field>
        <Field label="Setor de destino" required error={errors.sectorId ?? m.fieldErrors.sectorId ?? null}>
          <select value={d.sectorId} onChange={(e) => setD({ ...d, sectorId: e.target.value, bedId: '' })}>
            <option value="">Selecione</option>
            {wards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Leito" error={m.fieldErrors.bedId ?? null}>
          <select value={d.bedId} onChange={(e) => setD({ ...d, bedId: e.target.value })} disabled={!d.sectorId}>
            <option value="">Sem leito definido</option>
            {beds.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Motivo"><input value={d.reason} maxLength={200} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>
    </FormCard>
  );
}

export function DischargeForm({ admission, onDone }: { admission: AdmissionDto; onDone: () => void }) {
  const clinical = useClinical()!;
  const tz = useTimeZone();
  const [d, setD] = useState({ at: nowLocal(tz), outcome: 'alta' as const as 'alta' | 'obito' | 'transferencia_externa' });
  const [confirm, setConfirm] = useState(false);
  const m = useClinicalMutation((input: Parameters<typeof clinical.discharge>[1]) => clinical.discharge(admission.id, input));
  const open = admission.devices.filter((x) => !x.removedAt);
  return (
    <>
      <FormCard title="Registrar saída" subtitle={open.length ? `${open.length} dispositivo(s) em uso serão encerrados no mesmo horário.` : undefined} error={m.formError} onSubmit={() => setConfirm(true)} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Registrar saída">
        <div className="ig-form-row">
          <Field label="Data e hora" required error={m.fieldErrors.at ?? null}><input type="datetime-local" value={d.at} max={nowLocal(tz)} onChange={(e) => setD({ ...d, at: e.target.value })} /></Field>
          <Field label="Desfecho" required>
            <select value={d.outcome} onChange={(e) => setD({ ...d, outcome: e.target.value as typeof d.outcome })}>
              {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
      </FormCard>
      <ConfirmDialog open={confirm} title="Encerrar a internação?" confirmLabel="Registrar saída" busy={m.mutation.isPending} onCancel={() => setConfirm(false)}
        onConfirm={() => m.mutation.mutate({ at: localToIso(d.at, tz)!, outcome: d.outcome, rowVersion: admission.rowVersion }, { onSettled: () => setConfirm(false), onSuccess: onDone })}>
        A saída ({OUTCOME_LABEL[d.outcome]}) fica registrada no log de auditoria. Uma nova internação poderá ser aberta depois.
      </ConfirmDialog>
    </>
  );
}

const DEVICE_TYPES = Object.keys(DEVICE_LABEL) as DeviceType[];

export function DeviceForm({ admission, onDone }: { admission: AdmissionDto; onDone: () => void }) {
  const clinical = useClinical()!;
  const tz = useTimeZone();
  const [d, setD] = useState({ type: 'CVC' as DeviceType, site: '', indication: '', insertedAt: nowLocal(tz) });
  const m = useClinicalMutation((input: Parameters<typeof clinical.addDevice>[1]) => clinical.addDevice(admission.id, input));
  return (
    <FormCard title="Inserir dispositivo" error={m.formError} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Registrar inserção"
      onSubmit={() => m.mutation.mutate({ type: d.type, site: d.site.trim() || null, indication: d.indication.trim() || null, insertedAt: localToIso(d.insertedAt, tz)! }, { onSuccess: onDone })}>
      <div className="ig-form-row">
        <Field label="Tipo" required>
          <select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as DeviceType })}>
            {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t} — {DEVICE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Inserção" required error={m.fieldErrors.insertedAt ?? null}><input type="datetime-local" value={d.insertedAt} max={nowLocal(tz)} onChange={(e) => setD({ ...d, insertedAt: e.target.value })} /></Field>
      </div>
      <div className="ig-form-row">
        <Field label="Sítio / local"><input value={d.site} maxLength={120} onChange={(e) => setD({ ...d, site: e.target.value })} /></Field>
        <Field label="Indicação"><input value={d.indication} maxLength={300} onChange={(e) => setD({ ...d, indication: e.target.value })} /></Field>
      </div>
    </FormCard>
  );
}

export function RemoveDeviceForm({ device, onDone }: { device: DeviceDto; onDone: () => void }) {
  const clinical = useClinical()!;
  const tz = useTimeZone();
  const [d, setD] = useState({ removedAt: nowLocal(tz), reason: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useClinicalMutation((input: Parameters<typeof clinical.removeDevice>[1]) => clinical.removeDevice(device.id, input));
  const submit = () => {
    const e = { reason: required(d.reason.trim(), 'Informe o motivo da retirada.') };
    setErrors(e);
    if (!hasErrors(e)) m.mutation.mutate({ removedAt: localToIso(d.removedAt, tz)!, reason: d.reason.trim(), rowVersion: device.rowVersion }, { onSuccess: onDone });
  };
  return (
    <FormCard title={`Retirar ${device.type}`} subtitle={device.site ?? undefined} error={m.formError} onSubmit={submit} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Registrar retirada">
      <div className="ig-form-row">
        <Field label="Retirada" required error={m.fieldErrors.removedAt ?? null}><input type="datetime-local" value={d.removedAt} max={nowLocal(tz)} onChange={(e) => setD({ ...d, removedAt: e.target.value })} /></Field>
        <Field label="Motivo" required error={errors.reason ?? null}><input value={d.reason} maxLength={200} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>
      </div>
    </FormCard>
  );
}

export function NoteForm({ patientId, admissionId, caseOptions, amend, onDone }: {
  patientId: string; admissionId: string | null; caseOptions: Array<{ id: string; label: string }>; amend?: NoteDto; onDone: () => void;
}) {
  const clinical = useClinical()!;
  const [d, setD] = useState({ kind: 'avaliacao', body: amend?.body ?? '', caseId: '', justification: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useClinicalMutation(async () => {
    if (amend) await clinical.amendNote(amend.id, { body: d.body.trim(), justification: d.justification.trim() });
    else await clinical.addNote(patientId, { kind: d.kind, body: d.body.trim(), admissionId, caseId: d.caseId || null });
  });
  const submit = () => {
    const e = { body: required(d.body.trim(), 'Escreva a evolução.'), justification: amend ? justificationError(d.justification) : undefined };
    setErrors(e);
    if (!hasErrors(e)) m.mutation.mutate(undefined, { onSuccess: onDone });
  };
  return (
    <FormCard
      title={amend ? 'Retificar evolução' : 'Nova evolução CCIH'}
      subtitle={amend ? 'O registro original permanece visível; a retificação aponta para ele.' : 'Evoluções não podem ser editadas nem apagadas: correções são feitas por retificação.'}
      error={m.formError} onSubmit={submit} onCancel={onDone} busy={m.mutation.isPending} submitLabel={amend ? 'Registrar retificação' : 'Registrar evolução'}
    >
      {!amend ? (
        <div className="ig-form-row">
          <Field label="Tipo" required>
            <select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>
              {Object.entries(NOTE_KIND_LABEL).filter(([k]) => k !== 'retificacao').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {caseOptions.length ? (
            <Field label="Caso de IRAS relacionado">
              <select value={d.caseId} onChange={(e) => setD({ ...d, caseId: e.target.value })}>
                <option value="">Nenhum</option>
                {caseOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}
      <Field label="Texto" required error={errors.body ?? m.fieldErrors.body ?? null}><textarea value={d.body} maxLength={4000} onChange={(e) => setD({ ...d, body: e.target.value })} /></Field>
      {amend ? <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={errors.justification ?? m.fieldErrors.justification} /> : null}
    </FormCard>
  );
}

const MATERIALS = Object.entries(MATERIAL_LABEL);

export function CultureCollectForm({ admission, onDone }: { admission: AdmissionDto; onDone: () => void }) {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
  const lastSector = admission.movements.at(-1)?.sectorId ?? '';
  const [d, setD] = useState({ material: 'sangue', sectorId: lastSector, collectedAt: nowLocal(tz) });
  const m = useClinicalMutation((input: Parameters<typeof clinical.createCulture>[0]) => clinical.createCulture(input));
  return (
    <FormCard title="Registrar coleta de cultura" subtitle="O resultado é registrado depois, em Microbiologia, como uma versão (nunca sobrescrita)." error={m.formError} onCancel={onDone} busy={m.mutation.isPending} submitLabel="Registrar coleta"
      onSubmit={() => m.mutation.mutate({ admissionId: admission.id, sectorId: d.sectorId, material: d.material, collectedAt: localToIso(d.collectedAt, tz)! }, { onSuccess: onDone })}>
      <div className="ig-form-row">
        <Field label="Material" required><select value={d.material} onChange={(e) => setD({ ...d, material: e.target.value })}>{MATERIALS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Setor da coleta" required error={m.fieldErrors.sectorId ?? null}>
          <select value={d.sectorId} onChange={(e) => setD({ ...d, sectorId: e.target.value })}>
            {admission.movements.map((mv) => mv.sectorId).filter((v, i, a) => a.indexOf(v) === i).map((sid) => <option key={sid} value={sid}>{org.data?.sectors.find((s) => s.id === sid)?.name ?? 'Setor'}</option>)}
          </select>
        </Field>
        <Field label="Coleta" required error={m.fieldErrors.collectedAt ?? null}><input type="datetime-local" value={d.collectedAt} max={nowLocal(tz)} onChange={(e) => setD({ ...d, collectedAt: e.target.value })} /></Field>
      </div>
    </FormCard>
  );
}
