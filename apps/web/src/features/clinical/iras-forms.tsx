import { useState } from 'react';
import {
  IRAS_TYPES, IRAS_TYPE_ORDER, MATERIAL_LABEL, REFERENCE_STATUS_LABEL, TRANSITION_LABEL, DEVICE_ASSOCIATED_TYPES, dateInZone, formatDate, todayIn,
  type AdmissionDto, type CultureMaterial, type CultureSummary, type InvestigationStatus, type IrasCaseDetail, type IrasType, type SurgerySummary,
} from '@ccih/domain';
import { AlertBanner, ConfirmDialog, Field } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import { JustificationField, justificationError } from '../admin/shared';
import { FormCard } from './patient-forms';
import { useClinical, useClinicalMutation, useOrg, useTimeZone } from './shared';

interface CaseFormProps {
  admission: AdmissionDto;
  surgeries: SurgerySummary[];
  cultures: CultureSummary[];
  existing?: IrasCaseDetail;
  onDone: (id?: string) => void;
}

/** Suspicion (create) or investigation data (edit while open). Status changes are separate. */
export function CaseForm({ admission, surgeries, cultures, existing, onDone }: CaseFormProps) {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
  const sectorsOfStay = [...new Set(admission.movements.map((m) => m.sectorId))];
  const [d, setD] = useState({
    type: (existing?.type ?? 'IPCS') as IrasType,
    eventDate: existing?.eventDate ?? todayIn(tz),
    sectorId: existing?.sectorId ?? admission.movements.at(-1)?.sectorId ?? '',
    description: existing?.description ?? '',
    deviceUseId: existing?.deviceUseId ?? '',
    surgeryId: existing?.surgeryId ?? '',
    cultureIds: existing?.cultureIds ?? ([] as string[]),
    justification: '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const m = useClinicalMutation(async (): Promise<string | undefined> => {
    const links = { deviceUseId: d.deviceUseId || null, surgeryId: d.surgeryId || null, cultureIds: d.cultureIds };
    const base = { type: d.type, eventDate: d.eventDate, sectorId: d.sectorId, description: d.description.trim() || null, justification: d.justification.trim(), ...links };
    if (existing) {
      await clinical.updateCase(existing.id, { ...base, rowVersion: existing.rowVersion });
      return existing.id;
    }
    return (await clinical.createCase({ ...base, admissionId: admission.id })).id;
  });
  const relevant = IRAS_TYPES[d.type].devices;
  const devices = admission.devices.filter((x) => !relevant.length || relevant.includes(x.type));
  const err = (k: string) => errors[k] ?? m.fieldErrors[k] ?? null;
  const submit = () => {
    const e = {
      eventDate: d.eventDate ? undefined : 'Informe a data do evento.',
      sectorId: d.sectorId ? undefined : 'Selecione o setor de atribuição.',
      justification: justificationError(d.justification),
    };
    setErrors(e);
    if (!Object.values(e).some(Boolean)) m.mutation.mutate(undefined, { onSuccess: (id) => onDone(id) });
  };
  return (
    <FormCard
      title={existing ? 'Dados da investigação' : 'Registrar suspeita de IRAS'}
      subtitle="O sistema mostra a elegibilidade pelos parâmetros configurados, mas a classificação é decisão da CCIH."
      error={m.formError} onSubmit={submit} onCancel={() => onDone()} busy={m.mutation.isPending} submitLabel={existing ? 'Salvar dados' : 'Registrar suspeita'}
    >
      <div className="ig-form-row">
        <Field label="Tipo de IRAS" required>
          <select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as IrasType, deviceUseId: '' })}>
            {IRAS_TYPE_ORDER.map((t) => <option key={t} value={t}>{IRAS_TYPES[t].sigla} — {IRAS_TYPES[t].name}</option>)}
          </select>
        </Field>
        <Field label="Data do evento" required error={err('eventDate')}>
          <input type="date" value={d.eventDate} min={dateInZone(new Date(admission.admittedAt), tz)} max={todayIn(tz)} onChange={(e) => setD({ ...d, eventDate: e.target.value })} />
        </Field>
        <Field label="Setor de atribuição" required error={err('sectorId')}>
          <select value={d.sectorId} onChange={(e) => setD({ ...d, sectorId: e.target.value })}>
            <option value="">Selecione</option>
            {sectorsOfStay.map((sid) => <option key={sid} value={sid}>{org.data?.sectors.find((s) => s.id === sid)?.name ?? 'Setor'}</option>)}
          </select>
        </Field>
      </div>
      <div className="ig-form-row">
        <Field label="Dispositivo relacionado" hint={relevant.length ? `Tipos relevantes: ${relevant.join(', ')}` : undefined} error={err('deviceUseId')}>
          <select value={d.deviceUseId} onChange={(e) => setD({ ...d, deviceUseId: e.target.value })}>
            <option value="">Nenhum</option>
            {devices.map((x) => <option key={x.id} value={x.id}>{x.type} · inserido {formatDate(x.insertedAt, tz)}{x.removedAt ? ` · retirado ${formatDate(x.removedAt, tz)}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Cirurgia relacionada" error={err('surgeryId')}>
          <select value={d.surgeryId} onChange={(e) => setD({ ...d, surgeryId: e.target.value })}>
            <option value="">Nenhuma</option>
            {surgeries.map((s) => <option key={s.id} value={s.id}>{s.procedure.name} · {formatDate(s.startedAt, tz)}</option>)}
          </select>
        </Field>
      </div>
      {cultures.length ? (
        <fieldset className="ig-checks">
          <legend>Culturas vinculadas</legend>
          {cultures.map((c) => (
            <label key={c.id}>
              <input type="checkbox" checked={d.cultureIds.includes(c.id)} onChange={(e) => setD({ ...d, cultureIds: e.target.checked ? [...d.cultureIds, c.id] : d.cultureIds.filter((x) => x !== c.id) })} />
              {MATERIAL_LABEL[c.material as CultureMaterial] ?? c.material} · {formatDate(c.collectedAt, tz)}{c.organisms.length ? ` · ${c.organisms.join(', ')}` : ''}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Field label="Descrição clínica e achados"><textarea value={d.description} maxLength={4000} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
      <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={err('justification') ?? undefined} />
    </FormCard>
  );
}

/** Moves the case through the workflow; confirmation records the criterion (frozen) and the device decision. */
export function StatusForm({ detail, to, onDone }: { detail: IrasCaseDetail; to: InvestigationStatus; onDone: () => void }) {
  const clinical = useClinical()!;
  const institution = useInstitution();
  const references = institution.data?.data.references ?? [];
  const [d, setD] = useState({ justification: '', criterionReferenceId: detail.criterionReferenceId ?? '', deviceAssociated: '' as '' | 'sim' | 'nao' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirm, setConfirm] = useState(false);
  const m = useClinicalMutation(() => clinical.changeCaseStatus(detail.id, {
    to, justification: d.justification.trim(), criterionReferenceId: d.criterionReferenceId || null,
    deviceAssociated: d.deviceAssociated === '' ? null : d.deviceAssociated === 'sim', rowVersion: detail.rowVersion,
  }));
  const confirming = to === 'confirmada';
  const deviceDecision = confirming && DEVICE_ASSOCIATED_TYPES.includes(detail.type);
  const ref = references.find((r) => r.id === d.criterionReferenceId);
  const err = (k: string) => errors[k] ?? m.fieldErrors[k] ?? null;
  const submit = () => {
    const e = {
      justification: justificationError(d.justification),
      criterionReferenceId: confirming && !d.criterionReferenceId ? 'Informe o critério diagnóstico aplicado.' : undefined,
      deviceAssociated: deviceDecision && !d.deviceAssociated ? 'Informe se a IRAS é associada ao dispositivo.' : undefined,
      deviceUseId: deviceDecision && d.deviceAssociated === 'sim' && !detail.deviceUseId ? 'Vincule o dispositivo nos dados da investigação antes de confirmar.' : undefined,
      surgeryId: confirming && detail.type === 'ISC' && !detail.surgeryId ? 'Vincule a cirurgia nos dados da investigação antes de confirmar.' : undefined,
    };
    setErrors(e);
    if (!Object.values(e).some(Boolean)) setConfirm(true);
  };
  return (
    <>
      <FormCard title={TRANSITION_LABEL[to]} error={m.formError} onSubmit={submit} onCancel={onDone} busy={m.mutation.isPending} submitLabel={TRANSITION_LABEL[to]}>
        {err('deviceUseId') || err('surgeryId') ? <AlertBanner tone="warn" title="Vínculo pendente">{err('deviceUseId') ?? err('surgeryId')}</AlertBanner> : null}
        {confirming || to === 'descartada' ? (
          <Field label="Critério diagnóstico aplicado" required={confirming} hint="A versão e a situação de validação da referência ficam congeladas nesta decisão." error={err('criterionReferenceId')}>
            <select value={d.criterionReferenceId} onChange={(e) => setD({ ...d, criterionReferenceId: e.target.value })}>
              <option value="">Selecione</option>
              {references.map((r) => <option key={r.id} value={r.id}>{r.title} — {REFERENCE_STATUS_LABEL[r.status]}{r.validatedBy ? '' : ' (requer validação)'}</option>)}
            </select>
          </Field>
        ) : null}
        {ref && !ref.validatedBy ? <AlertBanner tone="warn" title="Critério sem validação institucional">A decisão será registrada com a marcação “Requer validação institucional”.</AlertBanner> : null}
        {deviceDecision ? (
          <fieldset className="ig-checks">
            <legend>Associada ao dispositivo?</legend>
            <label><input type="radio" name="assoc" checked={d.deviceAssociated === 'sim'} onChange={() => setD({ ...d, deviceAssociated: 'sim' })} /> Sim (entra na densidade de incidência)</label>
            <label><input type="radio" name="assoc" checked={d.deviceAssociated === 'nao'} onChange={() => setD({ ...d, deviceAssociated: 'nao' })} /> Não</label>
            {err('deviceAssociated') ? <p className="ig-field-error" role="alert">{err('deviceAssociated')}</p> : null}
          </fieldset>
        ) : null}
        <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={err('justification') ?? undefined} />
      </FormCard>
      <ConfirmDialog open={confirm} title={`${TRANSITION_LABEL[to]}?`} confirmLabel={TRANSITION_LABEL[to]} tone={to === 'descartada' ? 'danger' : 'primary'} busy={m.mutation.isPending}
        onCancel={() => setConfirm(false)} onConfirm={() => m.mutation.mutate(undefined, { onSettled: () => setConfirm(false), onSuccess: onDone })}>
        A mudança de situação, com sua justificativa, entra no histórico do caso (que não pode ser alterado) e no log de auditoria.
      </ConfirmDialog>
    </>
  );
}
