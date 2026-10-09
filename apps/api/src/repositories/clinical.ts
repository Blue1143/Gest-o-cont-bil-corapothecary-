import { sql, type Kysely, type Transaction } from 'kysely';
import type {
  AdmissionDto, CriterionSnapshot, CultureOutcome, CultureSummary, DeviceType, InvestigationStatus, IrasCaseSummary, NoteDto, PatientRef,
  PatientSummary, ResistanceProfile, SurgerySummary,
} from '@ccih/domain';
import type { DB } from '../db/types';
import type { AuthContext } from '../http/auth';
import { HttpError, notFound } from '../http/errors';
import type { SectorScope } from './institution';

/**
 * Clinical reads shared by the routes. Every lookup is restricted to the user's institution and
 * sector scope; records outside it answer 404 (no hint that they exist).
 */
export type Db = Kysely<DB> | Transaction<DB>;

const NO_SECTOR = '00000000-0000-0000-0000-000000000000';
export const scopeIds = (scope: SectorScope): string[] => (scope && scope.length ? scope : [NO_SECTOR]);

/** Admission ids with at least one stay in the scope (subquery). */
export function admissionsInScope(db: Db, scope: string[]) {
  return db.selectFrom('admission_movement').select('admission_id').where('sector_id', 'in', scope);
}

export async function institutionOrigin(db: Db, institutionId: string): Promise<'real' | 'demo'> {
  return (await db.selectFrom('institution').select('data_origin').where('id', '=', institutionId).executeTakeFirstOrThrow()).data_origin;
}

export async function findAdmission(db: Db, auth: AuthContext, admissionId: string) {
  let q = db.selectFrom('admission').selectAll().where('id', '=', admissionId).where('institution_id', '=', auth.institutionId);
  if (auth.scope) q = q.where('id', 'in', admissionsInScope(db, scopeIds(auth.scope)));
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Internação');
  return row;
}

export async function findPatient(db: Db, auth: AuthContext, patientId: string) {
  let q = db.selectFrom('patient').selectAll().where('id', '=', patientId).where('institution_id', '=', auth.institutionId);
  if (auth.scope) q = q.where('id', 'in', db.selectFrom('admission').select('patient_id').where('id', 'in', admissionsInScope(db, scopeIds(auth.scope))));
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Paciente');
  return row;
}

/** A sector the user may write to: same institution, active, inside the scope. */
export async function assertSector(db: Db, auth: AuthContext, sectorId: string, path = 'sectorId') {
  const s = await db.selectFrom('sector').select(['id', 'kind']).where('id', '=', sectorId).where('institution_id', '=', auth.institutionId).where('active', '=', true).executeTakeFirst();
  if (!s || (auth.scope && !auth.scope.includes(s.id))) throw new HttpError(400, 'validacao', 'Setor inexistente ou fora do seu escopo.', [{ path, message: 'Setor inexistente ou fora do seu escopo.' }]);
  return s;
}

/** Bed of the sector, active and free (or occupied by `exceptAdmission`). */
export async function assertBed(db: Db, sectorId: string, bedId: string | null, exceptAdmission?: string) {
  if (!bedId) return;
  const bed = await db.selectFrom('bed').select('id').where('id', '=', bedId).where('sector_id', '=', sectorId).where('active', '=', true).executeTakeFirst();
  if (!bed) throw new HttpError(400, 'validacao', 'Leito inexistente ou inativo neste setor.', [{ path: 'bedId', message: 'Leito inexistente ou inativo neste setor.' }]);
  let busy = db.selectFrom('admission_movement').select('admission_id').where('bed_id', '=', bedId).where('end_at', 'is', null);
  if (exceptAdmission) busy = busy.where('admission_id', '!=', exceptAdmission);
  if (await busy.executeTakeFirst()) throw new HttpError(409, 'leito_ocupado', 'O leito está ocupado.', [{ path: 'bedId', message: 'Leito ocupado.' }]);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadAdmissions(db: Db, admissionIds: string[]): Promise<AdmissionDto[]> {
  if (!admissionIds.length) return [];
  const [admissions, moves, devices] = await Promise.all([
    db.selectFrom('admission').selectAll().where('id', 'in', admissionIds).orderBy('admitted_at', 'desc').execute(),
    db.selectFrom('admission_movement').leftJoin('bed', 'bed.id', 'admission_movement.bed_id')
      .select(['admission_movement.id', 'admission_movement.admission_id', 'admission_movement.sector_id', 'admission_movement.bed_id', 'bed.code as bed_code', 'admission_movement.start_at', 'admission_movement.end_at', 'admission_movement.reason'])
      .where('admission_movement.admission_id', 'in', admissionIds).orderBy('admission_movement.start_at').execute(),
    db.selectFrom('device_use').selectAll().where('admission_id', 'in', admissionIds).orderBy('inserted_at').execute(),
  ]);
  return admissions.map((a) => ({
    id: a.id, admittedAt: a.admitted_at.toISOString(), dischargedAt: iso(a.discharged_at), outcome: a.outcome, diagnosis: a.diagnosis, rowVersion: a.row_version,
    movements: moves.filter((m) => m.admission_id === a.id).map((m) => ({ id: m.id, sectorId: m.sector_id, bedId: m.bed_id, bedCode: m.bed_code, start: m.start_at.toISOString(), end: iso(m.end_at), reason: m.reason })),
    devices: devices.filter((d) => d.admission_id === a.id).map((d) => ({ id: d.id, admissionId: d.admission_id, type: d.device_type, site: d.site, indication: d.indication, insertedAt: d.inserted_at.toISOString(), removedAt: iso(d.removed_at), removalReason: d.removal_reason, rowVersion: d.row_version })),
  }));
}

export async function loadNotes(db: Db, where: { patientId?: string; caseId?: string }): Promise<NoteDto[]> {
  let q = db.selectFrom('ccih_note').selectAll();
  if (where.patientId) q = q.where('patient_id', '=', where.patientId);
  if (where.caseId) q = q.where('case_id', '=', where.caseId);
  const rows = await q.orderBy('created_at', 'desc').execute();
  const amendedBy = new Map(rows.filter((r) => r.amends_id).map((r) => [r.amends_id!, r.id]));
  return rows.map((n) => ({
    id: n.id, createdAt: n.created_at.toISOString(), authorName: n.author_name, kind: n.kind, body: n.body, admissionId: n.admission_id, caseId: n.case_id,
    amendsId: n.amends_id, justification: n.justification, amendedBy: amendedBy.get(n.id) ?? null,
  }));
}

/* ---------- IRAS ---------- */

export interface CaseFilter {
  institutionId: string;
  scope: SectorScope;
  ids?: string[];
  admissionIds?: string[];
  surgeryId?: string;
  status?: InvestigationStatus[];
  type?: string;
  sectorId?: string;
  from?: string;
  to?: string;
  deviceType?: DeviceType;
  q?: string;
}

function caseQuery(db: Db, f: CaseFilter) {
  let q = db
    .selectFrom('iras_case as c')
    .innerJoin('admission as a', 'a.id', 'c.admission_id')
    .innerJoin('patient as p', 'p.id', 'a.patient_id')
    .leftJoin('device_use as d', 'd.id', 'c.device_use_id')
    .where('c.institution_id', '=', f.institutionId);
  if (f.scope) q = q.where('c.sector_id', 'in', scopeIds(f.scope));
  if (f.ids) q = q.where('c.id', 'in', f.ids.length ? f.ids : [NO_SECTOR]);
  if (f.admissionIds) q = q.where('c.admission_id', 'in', f.admissionIds.length ? f.admissionIds : [NO_SECTOR]);
  if (f.surgeryId) q = q.where('c.surgery_id', '=', f.surgeryId);
  if (f.status?.length) q = q.where('c.status', 'in', f.status);
  if (f.type) q = q.where('c.iras_type', '=', f.type as IrasCaseSummary['type']);
  if (f.sectorId) q = q.where('c.sector_id', '=', f.sectorId);
  if (f.from) q = q.where('c.event_date', '>=', f.from);
  if (f.to) q = q.where('c.event_date', '<=', f.to);
  if (f.deviceType) q = q.where('d.device_type', '=', f.deviceType);
  if (f.q) q = q.where((eb) => eb.or([eb('p.record_number', 'ilike', `%${escapeLike(f.q!)}%`), eb('p.initials', '=', f.q!.toUpperCase())]));
  return q;
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function caseSummaries(db: Db, f: CaseFilter, page?: { limit: number; offset: number }): Promise<{ rows: IrasCaseSummary[]; total: number }> {
  let q = caseQuery(db, f)
    .select(['c.id', 'c.admission_id', 'c.iras_type', 'c.status', 'c.event_date', 'c.sector_id', 'c.device_associated', 'c.surgery_id', 'c.criterion_snapshot', 'c.created_at', 'c.updated_at', 'c.row_version', 'c.data_origin', 'd.device_type', 'p.id as patient_id', 'p.record_number', 'p.initials'])
    .orderBy('c.event_date', 'desc')
    .orderBy('c.created_at', 'desc');
  if (page) q = q.limit(page.limit).offset(page.offset);
  const [rows, total] = await Promise.all([q.execute(), page ? caseQuery(db, f).select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow() : Promise.resolve(null)]);
  return {
    rows: rows.map((r) => ({
      id: r.id, patient: { id: r.patient_id, recordNumber: r.record_number, initials: r.initials }, admissionId: r.admission_id, type: r.iras_type, status: r.status,
      eventDate: r.event_date, sectorId: r.sector_id, deviceAssociated: r.device_associated, deviceType: r.device_type, surgeryId: r.surgery_id,
      criterion: (r.criterion_snapshot as CriterionSnapshot | null) ?? null, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), rowVersion: r.row_version, origin: r.data_origin,
    })),
    total: total ? Number(total.n) : rows.length,
  };
}

/* ---------- Surgery ---------- */

export interface SurgeryFilter {
  institutionId: string;
  scope: SectorScope;
  ids?: string[];
  admissionIds?: string[];
  from?: Date;
  to?: Date;
  procedureId?: string;
  surgeonId?: string;
  woundClass?: string;
  q?: string;
}

function surgeryQuery(db: Db, f: SurgeryFilter) {
  let q = db
    .selectFrom('surgery as s')
    .innerJoin('admission as a', 'a.id', 's.admission_id')
    .innerJoin('patient as p', 'p.id', 'a.patient_id')
    .innerJoin('procedure_catalog as pc', 'pc.id', 's.procedure_id')
    .innerJoin('professional as pr', 'pr.id', 's.surgeon_id')
    .where('s.institution_id', '=', f.institutionId);
  if (f.scope) {
    const scope = scopeIds(f.scope);
    q = q.where((eb) => eb.or([eb('s.sector_id', 'in', scope), eb('s.admission_id', 'in', admissionsInScope(db, scope))]));
  }
  if (f.ids) q = q.where('s.id', 'in', f.ids.length ? f.ids : [NO_SECTOR]);
  if (f.admissionIds) q = q.where('s.admission_id', 'in', f.admissionIds.length ? f.admissionIds : [NO_SECTOR]);
  if (f.from) q = q.where('s.started_at', '>=', f.from);
  if (f.to) q = q.where('s.started_at', '<', f.to);
  if (f.procedureId) q = q.where('s.procedure_id', '=', f.procedureId);
  if (f.surgeonId) q = q.where('s.surgeon_id', '=', f.surgeonId);
  if (f.woundClass) q = q.where('s.wound_class', '=', f.woundClass as SurgerySummary['woundClass']);
  if (f.q) q = q.where((eb) => eb.or([eb('p.record_number', 'ilike', `%${escapeLike(f.q!)}%`), eb('p.initials', '=', f.q!.toUpperCase())]));
  return q;
}

export async function surgerySummaries(db: Db, f: SurgeryFilter, page?: { limit: number; offset: number }) {
  let q = surgeryQuery(db, f)
    .selectAll('s')
    .select(['p.id as patient_id', 'p.record_number', 'p.initials', 'pc.name as procedure_name', 'pc.specialty', 'pc.p75_minutes', 'pc.p75_source', 'pr.name as surgeon_name'])
    .orderBy('s.started_at', 'desc');
  if (page) q = q.limit(page.limit).offset(page.offset);
  const [rows, total] = await Promise.all([q.execute(), page ? surgeryQuery(db, f).select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow() : Promise.resolve(null)]);
  return {
    rows: rows.map((s) => ({
      summary: {
        id: s.id, patient: { id: s.patient_id, recordNumber: s.record_number, initials: s.initials } as PatientRef, admissionId: s.admission_id,
        procedure: { id: s.procedure_id, name: s.procedure_name, specialty: s.specialty }, surgeon: { id: s.surgeon_id, name: s.surgeon_name },
        sectorId: s.sector_id, room: s.room, startedAt: s.started_at.toISOString(), endedAt: iso(s.ended_at), woundClass: s.wound_class, asa: s.asa, implant: s.implant, urgency: s.urgency,
        prophylaxisIndicated: s.prophylaxis_indicated, prophylaxisDrug: s.prophylaxis_drug, prophylaxisDoseAt: iso(s.prophylaxis_dose_at),
        prophylaxisDurationH: s.prophylaxis_duration_h == null ? null : Number(s.prophylaxis_duration_h), redose: s.redose, rowVersion: s.row_version, origin: s.data_origin,
      } satisfies SurgerySummary,
      notes: s.notes, p75Minutes: s.p75_minutes, p75Source: s.p75_source,
    })),
    total: total ? Number(total.n) : rows.length,
  };
}

/* ---------- Cultures ---------- */

export interface CultureFilter {
  institutionId: string;
  scope: SectorScope;
  ids?: string[];
  admissionIds?: string[];
  from?: Date;
  to?: Date;
  sectorId?: string;
  material?: string;
  outcome?: CultureOutcome;
  resistant?: boolean;
  organism?: string;
  q?: string;
}

/** Condition on the latest result version of the culture (results are versioned, never overwritten). */
const latestResultWhere = (cond: ReturnType<typeof sql>) => sql<boolean>`c.id IN (
  SELECT cr.culture_id FROM culture_result cr LEFT JOIN isolate i ON i.result_id = cr.id
  WHERE cr.version = (SELECT max(x.version) FROM culture_result x WHERE x.culture_id = cr.culture_id) AND ${cond})`;

function cultureQuery(db: Db, f: CultureFilter) {
  let q = db
    .selectFrom('culture as c')
    .innerJoin('admission as a', 'a.id', 'c.admission_id')
    .innerJoin('patient as p', 'p.id', 'a.patient_id')
    .where('c.institution_id', '=', f.institutionId);
  if (f.scope) q = q.where('c.sector_id', 'in', scopeIds(f.scope));
  if (f.ids) q = q.where('c.id', 'in', f.ids.length ? f.ids : [NO_SECTOR]);
  if (f.admissionIds) q = q.where('c.admission_id', 'in', f.admissionIds.length ? f.admissionIds : [NO_SECTOR]);
  if (f.from) q = q.where('c.collected_at', '>=', f.from);
  if (f.to) q = q.where('c.collected_at', '<', f.to);
  if (f.sectorId) q = q.where('c.sector_id', '=', f.sectorId);
  if (f.material) q = q.where('c.material', '=', f.material);
  if (f.outcome === 'pendente') q = q.where(sql<boolean>`NOT EXISTS (SELECT 1 FROM culture_result cr WHERE cr.culture_id = c.id)`);
  else if (f.outcome) q = q.where(latestResultWhere(sql`cr.outcome = ${f.outcome}`));
  if (f.resistant) q = q.where(latestResultWhere(sql`i.resistance_profile IS NOT NULL`));
  if (f.organism) q = q.where(latestResultWhere(sql`i.organism ILIKE ${`%${escapeLike(f.organism)}%`}`));
  if (f.q) q = q.where((eb) => eb.or([eb('p.record_number', 'ilike', `%${escapeLike(f.q!)}%`), eb('p.initials', '=', f.q!.toUpperCase())]));
  return q;
}

/** Latest result version per culture with its isolates. */
export async function latestResults(db: Db, cultureIds: string[]) {
  if (!cultureIds.length) return new Map<string, { version: number; outcome: Exclude<CultureOutcome, 'pendente'>; isolates: Array<{ organism: string; profile: ResistanceProfile | null }> }>();
  const results = await db.selectFrom('culture_result').select(['id', 'culture_id', 'version', 'outcome']).where('culture_id', 'in', cultureIds).execute();
  const latest = new Map<string, (typeof results)[number]>();
  for (const r of results) if ((latest.get(r.culture_id)?.version ?? 0) < r.version) latest.set(r.culture_id, r);
  const ids = [...latest.values()].map((r) => r.id);
  const isolates = ids.length ? await db.selectFrom('isolate').select(['result_id', 'organism', 'resistance_profile']).where('result_id', 'in', ids).execute() : [];
  return new Map([...latest].map(([cultureId, r]) => [cultureId, { version: r.version, outcome: r.outcome, isolates: isolates.filter((i) => i.result_id === r.id).map((i) => ({ organism: i.organism, profile: i.resistance_profile })) }]));
}

export async function cultureSummaries(db: Db, f: CultureFilter, page?: { limit: number; offset: number }) {
  const base = cultureQuery(db, f);
  let q = base.select(['c.id', 'c.admission_id', 'c.sector_id', 'c.material', 'c.collected_at', 'c.data_origin', 'p.id as patient_id', 'p.record_number', 'p.initials']).orderBy('c.collected_at', 'desc');
  if (page) q = q.limit(page.limit).offset(page.offset);
  const [rows, total] = await Promise.all([q.execute(), page ? base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow() : Promise.resolve(null)]);
  const results = await latestResults(db, rows.map((r) => r.id));
  return {
    rows: rows.map((c): CultureSummary => {
      const r = results.get(c.id);
      return {
        id: c.id, patient: { id: c.patient_id, recordNumber: c.record_number, initials: c.initials }, admissionId: c.admission_id, sectorId: c.sector_id,
        material: c.material, collectedAt: c.collected_at.toISOString(), outcome: r?.outcome ?? 'pendente', organisms: r?.isolates.map((i) => i.organism) ?? [],
        resistance: [...new Set((r?.isolates ?? []).flatMap((i) => (i.profile ? [i.profile] : [])))], resultVersion: r?.version ?? null, origin: c.data_origin,
      };
    }),
    total: total ? Number(total.n) : rows.length,
  };
}

/* ---------- Patients ---------- */

export async function patientSummaries(db: Db, auth: AuthContext, patientIds: string[]): Promise<PatientSummary[]> {
  if (!patientIds.length) return [];
  const [patients, open] = await Promise.all([
    db.selectFrom('patient').selectAll().where('id', 'in', patientIds).execute(),
    db.selectFrom('admission as a')
      .leftJoin('admission_movement as m', (j) => j.onRef('m.admission_id', '=', 'a.id').on('m.end_at', 'is', null))
      .leftJoin('bed as b', 'b.id', 'm.bed_id')
      .select(['a.id', 'a.patient_id', 'a.admitted_at', 'm.sector_id', 'b.code as bed_code'])
      .where('a.patient_id', 'in', patientIds).where('a.discharged_at', 'is', null).execute(),
  ]);
  const openIds = open.map((o) => o.id);
  const [devices, cases] = await Promise.all([
    openIds.length ? db.selectFrom('device_use').select(['admission_id', 'device_type']).where('admission_id', 'in', openIds).where('removed_at', 'is', null).execute() : [],
    db.selectFrom('iras_case').innerJoin('admission', 'admission.id', 'iras_case.admission_id').select(['admission.patient_id', 'iras_case.sector_id'])
      .where('admission.patient_id', 'in', patientIds).where('iras_case.status', 'in', ['suspeita', 'em_investigacao']).execute(),
  ]);
  const order = new Map(patientIds.map((id, i) => [id, i]));
  return patients
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((p) => {
      const cur = open.find((o) => o.patient_id === p.id);
      return {
        id: p.id, recordNumber: p.record_number, initials: p.initials, sex: p.sex, birthDate: p.birth_date, hasFullName: p.full_name_enc != null, origin: p.data_origin,
        current: cur && cur.sector_id ? { admissionId: cur.id, admittedAt: cur.admitted_at.toISOString(), sectorId: cur.sector_id, bedCode: cur.bed_code } : null,
        activeDevices: cur ? [...new Set(devices.filter((d) => d.admission_id === cur.id).map((d) => d.device_type))] : [],
        openCases: cases.filter((c) => c.patient_id === p.id && (!auth.scope || auth.scope.includes(c.sector_id))).length,
      };
    });
}
