import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WOUND_CLASS_LABEL, evaluateProphylaxis, toLocalInput, type ProphylaxisEvaluation, type SurgeryDetail, type WoundClass } from '@ccih/domain';
import { AlertBanner, Field, StatusBadge, type StatusBadgeProps } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import { JustificationField, justificationError } from '../admin/shared';
import type { SurgeryInput } from '../../data/port';
import { FormCard } from './patient-forms';
import { localToIso, nowLocal, useClinical, useClinicalMutation, useOrg, useTimeZone } from './shared';

export const PROPHYLAXIS_BADGE: Record<ProphylaxisEvaluation['result'], [StatusBadgeProps['status'], string]> = {
  conforme: ['ok', 'Profilaxia conforme'],
  nao_conforme: ['crit', 'Profilaxia não conforme'],
  incompleto: ['neutral', 'Dados incompletos'],
  nao_indicada: ['neutral', 'Profilaxia não indicada'],
  sem_regra: ['neutral', 'Sem regra configurada'],
};

export function ProphylaxisBadge({ evaluation }: { evaluation: ProphylaxisEvaluation }) {
  const [tone, label] = PROPHYLAXIS_BADGE[evaluation.result];
  return <StatusBadge status={tone}>{label}</StatusBadge>;
}

const triState = (v: boolean | null) => (v == null ? '' : v ? 'sim' : 'nao');
const fromTri = (v: string) => (v === '' ? null : v === 'sim');

export function SurgeryForm({ admissionId, existing, onDone }: { admissionId: string; existing?: SurgeryDetail; onDone: (id?: string) => void }) {
  const clinical = useClinical()!;
  const org = useOrg();
  const tz = useTimeZone();
  const institution = useInstitution();
  const rules = institution.data?.data.config.rules;
  const procedures = useQuery({ queryKey: ['procedures'], queryFn: () => clinical.procedures(), staleTime: 10 * 60_000 });
  const professionals = useQuery({ queryKey: ['professionals'], queryFn: () => clinical.professionals(), staleTime: 10 * 60_000 });
  const theaters = org.data?.sectors.filter((s) => s.kind === 'centro_cirurgico') ?? [];
  const [d, setD] = useState({
    procedureId: existing?.procedure.id ?? '', surgeonId: existing?.surgeon.id ?? '', sectorId: existing?.sectorId ?? theaters[0]?.id ?? '', room: existing?.room ?? '',
    startedAt: existing ? toLocalInput(existing.startedAt, tz) : nowLocal(tz), endedAt: existing?.endedAt ? toLocalInput(existing.endedAt, tz) : '',
    woundClass: (existing?.woundClass ?? '') as WoundClass | '', asa: existing?.asa != null ? String(existing.asa) : '', implant: existing?.implant ?? false, urgency: existing?.urgency ?? false,
    indicated: triState(existing?.prophylaxisIndicated ?? null), drug: existing?.prophylaxisDrug ?? '', doseAt: existing?.prophylaxisDoseAt ? toLocalInput(existing.prophylaxisDoseAt, tz) : '',
    durationH: existing?.prophylaxisDurationH != null ? String(existing.prophylaxisDurationH) : '', redose: triState(existing?.redose ?? null), notes: existing?.notes ?? '', justification: '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const input = (): SurgeryInput => ({
    procedureId: d.procedureId, surgeonId: d.surgeonId, sectorId: d.sectorId || theaters[0]?.id || '', room: d.room.trim() || null,
    startedAt: localToIso(d.startedAt, tz)!, endedAt: localToIso(d.endedAt, tz), woundClass: d.woundClass || null, asa: d.asa ? Number(d.asa) : null,
    implant: d.implant, urgency: d.urgency, prophylaxisIndicated: fromTri(d.indicated), prophylaxisDrug: d.indicated === 'sim' ? d.drug.trim() || null : null,
    prophylaxisDoseAt: d.indicated === 'sim' ? localToIso(d.doseAt, tz) : null, prophylaxisDurationH: d.indicated === 'sim' && d.durationH !== '' ? Number(d.durationH.replace(',', '.')) : null,
    redose: d.indicated === 'sim' ? fromTri(d.redose) : null, notes: d.notes.trim() || null,
  });
  const m = useClinicalMutation(async (): Promise<string> => {
    if (existing) {
      await clinical.updateSurgery(existing.id, { ...input(), rowVersion: existing.rowVersion, justification: d.justification.trim() });
      return existing.id;
    }
    return (await clinical.createSurgery({ ...input(), admissionId })).id;
  });
  const preview = (() => {
    if (!rules) return null;
    const start = localToIso(d.startedAt, tz);
    const dose = localToIso(d.doseAt, tz);
    return evaluateProphylaxis(
      { indicated: fromTri(d.indicated), drug: d.drug || null, minutesBeforeIncision: start && dose ? Math.round((Date.parse(start) - Date.parse(dose)) / 60_000) : null, durationHours: d.durationH !== '' ? Number(d.durationH.replace(',', '.')) : null },
      { windowMin: rules.surgery.prophylaxisWindowMin?.value, windowByDrugMin: rules.surgery.prophylaxisWindowByDrugMin?.value, maxDurationH: rules.surgery.prophylaxisMaxDurationH?.value },
    );
  })();
  const err = (k: string) => errors[k] ?? m.fieldErrors[k] ?? null;
  const submit = () => {
    const e = {
      procedureId: d.procedureId ? undefined : 'Selecione o procedimento.',
      surgeonId: d.surgeonId ? undefined : 'Selecione o cirurgião.',
      startedAt: d.startedAt ? undefined : 'Informe o início.',
      justification: existing ? justificationError(d.justification) : undefined,
    };
    setErrors(e);
    if (!Object.values(e).some(Boolean)) m.mutation.mutate(undefined, { onSuccess: (id) => onDone(id) });
  };
  return (
    <FormCard title={existing ? 'Editar registro cirúrgico' : 'Registrar cirurgia'} subtitle={`Horários de ${tz}.`} error={m.formError} onSubmit={submit} onCancel={() => onDone()} busy={m.mutation.isPending} submitLabel={existing ? 'Salvar alterações' : 'Registrar cirurgia'}>
      <div className="ig-form-row">
        <Field label="Procedimento" required error={err('procedureId')}>
          <select value={d.procedureId} onChange={(e) => setD({ ...d, procedureId: e.target.value })}>
            <option value="">Selecione</option>
            {procedures.data?.procedures.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.specialty})</option>)}
          </select>
        </Field>
        <Field label="Cirurgião" required error={err('surgeonId')}>
          <select value={d.surgeonId} onChange={(e) => setD({ ...d, surgeonId: e.target.value })}>
            <option value="">Selecione</option>
            {professionals.data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.name}{p.jobRole ? ` — ${p.jobRole}` : ''}</option>)}
          </select>
        </Field>
      </div>
      <div className="ig-form-row">
        <Field label="Centro cirúrgico" required error={err('sectorId')}>
          <select value={d.sectorId} onChange={(e) => setD({ ...d, sectorId: e.target.value })}>
            {theaters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Sala"><input value={d.room} maxLength={40} onChange={(e) => setD({ ...d, room: e.target.value })} /></Field>
        <Field label="Início (incisão)" required error={err('startedAt')}><input type="datetime-local" value={d.startedAt} max={nowLocal(tz)} onChange={(e) => setD({ ...d, startedAt: e.target.value })} /></Field>
        <Field label="Término" error={err('endedAt')}><input type="datetime-local" value={d.endedAt} onChange={(e) => setD({ ...d, endedAt: e.target.value })} /></Field>
      </div>
      <div className="ig-form-row">
        <Field label="Potencial de contaminação">
          <select value={d.woundClass} onChange={(e) => setD({ ...d, woundClass: e.target.value as WoundClass | '' })}>
            <option value="">Não informado</option>
            {Object.entries(WOUND_CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="ASA">
          <select value={d.asa} onChange={(e) => setD({ ...d, asa: e.target.value })}>
            <option value="">Não informado</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>ASA {n}</option>)}
          </select>
        </Field>
        <fieldset className="ig-checks" style={{ alignSelf: 'end' }}>
          <legend className="ig-sr-only">Características</legend>
          <label><input type="checkbox" checked={d.implant} onChange={(e) => setD({ ...d, implant: e.target.checked })} /> Implante</label>
          <label><input type="checkbox" checked={d.urgency} onChange={(e) => setD({ ...d, urgency: e.target.checked })} /> Urgência</label>
        </fieldset>
      </div>
      <div className="ig-form-row">
        <Field label="Antibioticoprofilaxia indicada?">
          <select value={d.indicated} onChange={(e) => setD({ ...d, indicated: e.target.value })}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Field>
        {d.indicated === 'sim' ? (
          <>
            <Field label="Fármaco" error={err('prophylaxisDrug')}><input value={d.drug} maxLength={80} onChange={(e) => setD({ ...d, drug: e.target.value })} placeholder="Ex.: cefazolina" /></Field>
            <Field label="Horário da dose"><input type="datetime-local" value={d.doseAt} onChange={(e) => setD({ ...d, doseAt: e.target.value })} /></Field>
            <Field label="Duração total (h)" hint="0 = dose única."><input inputMode="decimal" value={d.durationH} onChange={(e) => setD({ ...d, durationH: e.target.value })} /></Field>
          </>
        ) : null}
      </div>
      {d.indicated === 'sim' ? (
        <Field label="Redose intraoperatória">
          <select value={d.redose} onChange={(e) => setD({ ...d, redose: e.target.value })}>
            <option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option>
          </select>
        </Field>
      ) : null}
      {preview ? (
        <AlertBanner tone={preview.result === 'conforme' ? 'ok' : preview.result === 'nao_conforme' ? 'crit' : 'info'} title={<>Prévia pela regra institucional: <ProphylaxisBadge evaluation={preview} /></>}>
          {preview.appliedWindowMin != null ? `Janela aplicada: ${preview.appliedWindowMin} min antes da incisão. ` : ''}{preview.reasons.join(' ')}
        </AlertBanner>
      ) : null}
      <Field label="Observações e intercorrências"><textarea value={d.notes} maxLength={2000} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      {existing ? <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={err('justification') ?? undefined} /> : null}
    </FormCard>
  );
}
