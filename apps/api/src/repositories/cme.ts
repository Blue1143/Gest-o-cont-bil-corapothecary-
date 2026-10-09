import {
  bowieDickApplies, dateInZone, evaluateLoadRelease,
  type CmeTestDto, type ItemUseDto, type LoadReleaseEvaluation, type LoadReleasePolicy, type LoadTest, type PolicySnapshot,
  type SurgeryMaterialDto, type TraceRow,
} from '@ccih/domain';
import type { Selectable } from 'kysely';
import type { SterilizationTestTable } from '../db/types';
import type { AuthContext } from '../http/auth';
import { attachmentsFor } from '../services/attachments';
import type { Db } from './clinical';

export async function loadPolicy(db: Db, institutionId: string): Promise<{ policy: LoadReleasePolicy | undefined; snapshot: PolicySnapshot | null }> {
  const p = await db.selectFrom('load_release_policy').selectAll().where('institution_id', '=', institutionId).executeTakeFirst();
  if (!p) return { policy: undefined, snapshot: null };
  const policy: LoadReleasePolicy = { requiredLoadTests: p.required_tests as LoadReleasePolicy['requiredLoadTests'], requireDailyBowieDick: p.require_daily_bowie_dick, holdImplantsUntilBiological: p.hold_implants_until_biological, referenceId: p.reference_id };
  return { policy, snapshot: { version: p.row_version, ...policy } };
}

type TestRow = Selectable<SterilizationTestTable>;

/** Tests that have not been replaced by a reading or a correction. */
export function currentOnly<T extends { id: string; replaces_id: string | null }>(rows: T[]): T[] {
  const replaced = new Set(rows.map((r) => r.replaces_id).filter(Boolean));
  return rows.filter((r) => !replaced.has(r.id));
}

export async function testDtos(db: Db, rows: TestRow[]): Promise<CmeTestDto[]> {
  const current = new Set(currentOnly(rows).map((r) => r.id));
  const files = await attachmentsFor(db, 'sterilization_test', rows.map((r) => r.id));
  return rows.map((t) => ({
    id: t.id, type: t.type, result: t.result, performedAt: t.performed_at.toISOString(), indicatorLot: t.indicator_lot, indicatorExpiry: t.indicator_expiry,
    incubationStart: t.incubation_start?.toISOString() ?? null, readAt: t.read_at?.toISOString() ?? null, controlResult: t.control_result, notes: t.notes,
    recordedBy: t.recorded_by_name, sterilizerId: t.sterilizer_id, loadId: t.load_id, replacesId: t.replaces_id, justification: t.justification,
    current: current.has(t.id), attachments: files.get(t.id) ?? [],
  }));
}

export interface LoadEvaluation { evaluation: LoadReleaseEvaluation; bowieDickApplies: boolean; equipmentBowieDick: TestRow | null; tests: TestRow[] }

/** Policy evaluation of each load with its current tests, physical record and same-day Bowie-Dick. */
export async function evaluateLoads(db: Db, institutionId: string, loadIds: string[], tz: string, policy: LoadReleasePolicy | undefined): Promise<Map<string, LoadEvaluation>> {
  const out = new Map<string, LoadEvaluation>();
  if (!loadIds.length) return out;
  const loads = await db.selectFrom('sterilization_load as l').innerJoin('sterilizer as s', 's.id', 'l.sterilizer_id')
    .select(['l.id', 'l.sterilizer_id', 'l.started_at', 'l.physical_result', 'l.has_implant', 's.type'])
    .where('l.institution_id', '=', institutionId).where('l.id', 'in', loadIds).execute();
  const tests = await db.selectFrom('sterilization_test').selectAll().where('load_id', 'in', loadIds).orderBy('performed_at').execute();
  const started = loads.filter((l): l is typeof l & { started_at: Date } => l.started_at != null);
  const bd = started.length
    ? await db.selectFrom('sterilization_test').selectAll().where('institution_id', '=', institutionId).where('type', '=', 'BOWIE_DICK')
      .where('sterilizer_id', 'in', [...new Set(started.map((l) => l.sterilizer_id))]).where('performed_on', 'in', [...new Set(started.map((l) => dateInZone(l.started_at, tz)))]).orderBy('performed_at').execute()
    : [];
  const currentBd = currentOnly(bd);
  for (const l of loads) {
    const mine = tests.filter((t) => t.load_id === l.id);
    const current = currentOnly(mine);
    const applies = bowieDickApplies(l.type);
    if (!l.started_at) {
      // Assembly: nothing to evaluate until the cycle runs.
      out.set(l.id, { evaluation: { status: 'aguardando', reasons: ['Carga em montagem: o ciclo ainda não começou.'], policyApplied: !!policy }, bowieDickApplies: applies, equipmentBowieDick: null, tests: mine });
      continue;
    }
    const startedAt = l.started_at;
    const day = dateInZone(startedAt, tz);
    // Latest Bowie-Dick of the day before the cycle started (a test done later does not cover it).
    const equipment = currentBd.filter((t) => t.sterilizer_id === l.sterilizer_id && t.performed_on === day && t.performed_at <= startedAt).at(-1) ?? null;
    const loadTests: LoadTest[] = current.map((t) => ({ type: t.type, result: t.result }));
    if (l.physical_result) loadTests.push({ type: 'REGISTRO_FISICO', result: l.physical_result === 'conforme' ? 'aprovado' : 'reprovado' });
    out.set(l.id, {
      evaluation: evaluateLoadRelease({ tests: loadTests, hasImplant: l.has_implant, bowieDickApplies: applies, ...(equipment ? { equipmentBowieDick: equipment.result } : {}) }, policy),
      bowieDickApplies: applies, equipmentBowieDick: equipment, tests: mine,
    });
  }
  return out;
}

/** Patients are shown only to profiles that may see them, and only within their sector scope. */
const canSeePatient = (auth: AuthContext, surgerySector: string | null) =>
  auth.permissions.includes('patient:view') && (!auth.scope || (surgerySector != null && auth.scope.includes(surgerySector)));

type UseRow = { id: string; item_id: string; used_at: Date; sector_id: string; surgery_id: string | null; recorded_by_name: string };

export async function materialUseDtos(db: Db, auth: AuthContext, uses: UseRow[]): Promise<Map<string, ItemUseDto>> {
  const surgeryIds = [...new Set(uses.map((u) => u.surgery_id).filter((s): s is string => !!s))];
  const surgeries = surgeryIds.length
    ? await db.selectFrom('surgery as s').innerJoin('admission as a', 'a.id', 's.admission_id').innerJoin('patient as p', 'p.id', 'a.patient_id').innerJoin('procedure_catalog as pc', 'pc.id', 's.procedure_id')
      .select(['s.id', 's.sector_id', 'pc.name', 'p.id as patient_id', 'p.initials', 'p.record_number']).where('s.id', 'in', surgeryIds).execute()
    : [];
  const byId = new Map(surgeries.map((s) => [s.id, s]));
  return new Map(uses.map((u) => {
    const s = u.surgery_id ? byId.get(u.surgery_id) : undefined;
    const visible = !!s && canSeePatient(auth, s.sector_id);
    return [u.item_id, {
      id: u.id, usedAt: u.used_at.toISOString(), sectorId: u.sector_id, surgeryId: visible ? u.surgery_id : null,
      patient: visible && s ? { id: s.patient_id, initials: s.initials, recordNumber: s.record_number } : null,
      procedure: s?.name ?? null, recordedBy: u.recorded_by_name,
    }];
  }));
}

export interface TraceFilter { itemIds?: string[]; loadIds?: string[]; limit: number }

export async function traceRows(db: Db, auth: AuthContext, f: TraceFilter): Promise<{ rows: TraceRow[]; truncated: boolean }> {
  let q = db.selectFrom('load_item as i').innerJoin('sterilization_load as l', 'l.id', 'i.load_id').innerJoin('sterilizer as st', 'st.id', 'l.sterilizer_id')
    .leftJoin('instrument_set as k', 'k.id', 'i.set_id')
    .select((eb) => ['i.id', 'i.label_code', 'i.description', 'i.implant', 'i.expires_on', 'i.process_id', 'k.code as set_code', 'l.id as load_id', 'l.code as load_code', 'l.status', 'l.started_at', 'st.name as sterilizer',
      eb.selectFrom('load_release_decision as d').select((e) => e.fn.max('d.decided_at').as('at')).whereRef('d.load_id', '=', 'l.id').as('status_at')])
    .where('i.institution_id', '=', auth.institutionId);
  if (auth.scope) q = q.where('st.sector_id', 'in', auth.scope.length ? auth.scope : ['00000000-0000-0000-0000-000000000000']);
  if (f.itemIds) q = q.where('i.id', 'in', f.itemIds.length ? f.itemIds : ['00000000-0000-0000-0000-000000000000']);
  if (f.loadIds) q = q.where('l.id', 'in', f.loadIds.length ? f.loadIds : ['00000000-0000-0000-0000-000000000000']);
  const rows = await q.orderBy('l.started_at', 'desc').orderBy('i.position').limit(f.limit + 1).execute();
  const page = rows.slice(0, f.limit);
  const uses = page.length
    ? await db.selectFrom('material_use').select(['id', 'item_id', 'used_at', 'sector_id', 'surgery_id', 'recorded_by_name']).where('item_id', 'in', page.map((r) => r.id)).where('voided_at', 'is', null).execute()
    : [];
  const useMap = await materialUseDtos(db, auth, uses);
  return {
    truncated: rows.length > f.limit,
    rows: page.map((r) => ({
      itemId: r.id, labelCode: r.label_code, description: r.description, setCode: r.set_code, implant: r.implant, loadId: r.load_id, loadCode: r.load_code,
      loadStatus: r.status, cycleStartedAt: r.started_at?.toISOString() ?? null, sterilizerName: r.sterilizer, expiresOn: r.expires_on,
      statusAt: r.status_at ? new Date(r.status_at as Date).toISOString() : null, processId: r.process_id, use: useMap.get(r.id) ?? null,
    })),
  };
}

export async function surgeryMaterials(db: Db, surgeryId: string): Promise<SurgeryMaterialDto[]> {
  const rows = await db.selectFrom('material_use as u').innerJoin('load_item as i', 'i.id', 'u.item_id').innerJoin('sterilization_load as l', 'l.id', 'i.load_id').innerJoin('sterilizer as st', 'st.id', 'l.sterilizer_id')
    .select(['u.id', 'u.used_at', 'i.id as item_id', 'i.label_code', 'i.description', 'i.implant', 'l.id as load_id', 'l.code', 'l.status', 'l.started_at', 'st.name'])
    .where('u.surgery_id', '=', surgeryId).where('u.voided_at', 'is', null).orderBy('u.used_at').execute();
  return rows.map((r) => ({
    useId: r.id, itemId: r.item_id, labelCode: r.label_code, description: r.description, implant: r.implant, loadId: r.load_id, loadCode: r.code, loadStatus: r.status,
    sterilizerName: r.name, cycleStartedAt: r.started_at?.toISOString() ?? null, usedAt: r.used_at.toISOString(),
  }));
}
