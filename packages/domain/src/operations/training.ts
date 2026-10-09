import { addDays, dayDiff, type IsoDate } from '../dates';

/**
 * Training coverage: each active professional × each mandatory training that targets their job role
 * is one "required training". It is covered when the latest attendance (present) is still valid on
 * the reference date. Validity and warning windows are institutional configuration.
 */
export interface CoverageProfessional { id: string; sectorId: string | null; jobRoleId: string | null; active: boolean }
export interface CoverageTraining { id: string; mandatory: boolean; validityMonths: number | null; targetJobRoleIds: string[] }
export interface CoverageAttendance { trainingId: string; professionalId: string; heldOn: IsoDate; present: boolean }

export type TrainingState = 'valido' | 'vencendo' | 'vencido' | 'pendente';

export const TRAINING_STATE_LABEL: Record<TrainingState, string> = { valido: 'Válido', vencendo: 'Vencendo', vencido: 'Vencido', pendente: 'Pendente' };

/** Expiry date of an attendance (null = no expiry). */
export function trainingExpiry(heldOn: IsoDate, validityMonths: number | null): IsoDate | null {
  if (validityMonths == null) return null;
  const y = Number(heldOn.slice(0, 4));
  const m = Number(heldOn.slice(5, 7)) - 1 + validityMonths;
  const d = new Date(Date.UTC(y, m, Number(heldOn.slice(8, 10))));
  return d.toISOString().slice(0, 10);
}

export interface RequiredTraining {
  professionalId: string;
  trainingId: string;
  sectorId: string | null;
  state: TrainingState;
  lastHeldOn: IsoDate | null;
  expiresOn: IsoDate | null;
}

export function requiredTrainings(input: {
  professionals: CoverageProfessional[]; trainings: CoverageTraining[]; attendances: CoverageAttendance[]; at: IsoDate; warningDays: number | undefined;
}): RequiredTraining[] {
  const last = new Map<string, IsoDate>();
  for (const a of input.attendances) {
    if (!a.present || a.heldOn > input.at) continue;
    const k = `${a.professionalId}|${a.trainingId}`;
    if ((last.get(k) ?? '') < a.heldOn) last.set(k, a.heldOn);
  }
  const out: RequiredTraining[] = [];
  for (const t of input.trainings) {
    if (!t.mandatory) continue;
    for (const p of input.professionals) {
      if (!p.active || !p.jobRoleId || !t.targetJobRoleIds.includes(p.jobRoleId)) continue;
      const held = last.get(`${p.id}|${t.id}`) ?? null;
      const expiresOn = held ? trainingExpiry(held, t.validityMonths) : null;
      let state: TrainingState = 'pendente';
      if (held) {
        if (expiresOn && expiresOn <= input.at) state = 'vencido';
        else if (expiresOn && input.warningDays != null && dayDiff(input.at, expiresOn) <= input.warningDays) state = 'vencendo';
        else state = 'valido';
      }
      out.push({ professionalId: p.id, trainingId: t.id, sectorId: p.sectorId, state, lastHeldOn: held, expiresOn });
    }
  }
  return out;
}

/** Covered = valid or about to expire (still valid on the date). */
export function coverageBySector(rows: RequiredTraining[]): Map<string, { publico: number; concluidos: number }> {
  const out = new Map<string, { publico: number; concluidos: number }>();
  for (const r of rows) {
    if (!r.sectorId) continue;
    const c = out.get(r.sectorId) ?? { publico: 0, concluidos: 0 };
    c.publico++;
    if (r.state === 'valido' || r.state === 'vencendo') c.concluidos++;
    out.set(r.sectorId, c);
  }
  return out;
}

export const nextDay = (d: IsoDate) => addDays(d, 1);
