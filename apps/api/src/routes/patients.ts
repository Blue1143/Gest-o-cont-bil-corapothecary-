import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import {
  addDays, initialsFromName, normalizeInitials, rulesFromParameters, todayIn, censusOfDay, censusOfRange, zonedInstant, addMonths,
  type CensusMonthPayload, type CensusPayload, type CensusRow, type PatientDetail, type Paged, type PatientSummary,
} from '@ccih/domain';
import type { DB } from '../db/types';
import { audit } from '../audit/audit';
import { actorOf, requireAuth, requirePermission, type AuthContext } from '../http/auth';
import { HttpError, conflict, notFound, parse } from '../http/errors';
import { Instant, IsoDate, Justification, MonthStart, OptionalText, PageQuery, RowVersion, Text, Uuid, notFuture } from '../http/schemas';
import { patientNameContext, type FieldCipher } from '../security/field-crypto';
import {
  admissionsInScope, assertBed, assertSector, caseSummaries, cultureSummaries, escapeLike, findAdmission, findPatient, institutionOrigin,
  loadAdmissions, loadNotes, patientSummaries, scopeIds, surgerySummaries,
} from '../repositories/clinical';
import { loadCensusAdmissions } from '../repositories/consolidation';

const SEX = z.enum(['F', 'M', 'NI']);
const DEVICE = z.enum(['CVC', 'PICC', 'VM', 'SVD', 'PAI', 'DRENO', 'OUTRO']);
const RecordNumber = z.string().trim().regex(/^[A-Za-z0-9./-]{1,30}$/, 'Use até 30 letras, números, ponto, barra ou hífen.');
const FullName = z.string().trim().min(3).max(200);

const AdmissionInput = z.object({ admittedAt: Instant, sectorId: Uuid, bedId: Uuid.nullable(), diagnosis: OptionalText(300) }).strict();
const PatientCreate = z
  .object({ recordNumber: RecordNumber, initials: z.string().max(40), fullName: FullName.nullable(), birthDate: IsoDate.nullable(), sex: SEX, admission: AdmissionInput.nullable() })
  .strict();
const PatientUpdate = z
  .object({ initials: z.string().max(40), birthDate: IsoDate.nullable(), sex: SEX, fullName: FullName.nullable().optional(), rowVersion: RowVersion, justification: Justification })
  .strict();
const Reveal = z.object({ reason: Justification }).strict();
const Transfer = z.object({ at: Instant, sectorId: Uuid, bedId: Uuid.nullable(), reason: OptionalText(200), rowVersion: RowVersion }).strict();
const Discharge = z.object({ at: Instant, outcome: z.enum(['alta', 'obito', 'transferencia_externa']), rowVersion: RowVersion }).strict();
const DeviceCreate = z.object({ type: DEVICE, site: OptionalText(120), indication: OptionalText(300), insertedAt: Instant }).strict();
const DeviceRemove = z.object({ removedAt: Instant, reason: Text(200), rowVersion: RowVersion }).strict();
const NoteCreate = z.object({ kind: z.enum(['avaliacao', 'conduta', 'recomendacao', 'acompanhamento']), body: Text(4000), admissionId: Uuid.nullable(), caseId: Uuid.nullable() }).strict();
const NoteAmend = z.object({ body: Text(4000), justification: Justification }).strict();
const PatientsQuery = z.object({ q: z.string().trim().max(40).optional(), sectorId: Uuid.optional(), status: z.enum(['internados', 'todos']).default('internados'), ...PageQuery }).strict();

const fieldError = (path: string, message: string) => new HttpError(400, 'validacao', message, [{ path, message }]);
/** Never put the ciphertext (or anything identifying) in the audit trail. */
const auditable = <T extends { full_name_enc?: string | null }>(row: T) => ({ ...row, full_name_enc: row.full_name_enc ? '[cifrado]' : null });

async function timezoneOf(db: Kysely<DB> | Transaction<DB>, institutionId: string) {
  return (await db.selectFrom('institution').select('timezone').where('id', '=', institutionId).executeTakeFirstOrThrow()).timezone;
}

async function censusHourOf(db: Kysely<DB>, institutionId: string) {
  const params = await db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', institutionId).execute();
  return rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id }))).admissions.censusHour?.value ?? null;
}

export async function patientRoutes(app: FastifyInstance, { db, cipher }: { db: Kysely<DB>; cipher: FieldCipher | null }) {
  const view = { preHandler: requirePermission(db, 'patient:view') };
  const edit = { preHandler: requirePermission(db, 'patient:edit') };

  const encryptName = (auth: AuthContext, patientId: string, name: string | null) => {
    if (name == null) return null;
    if (!cipher) throw fieldError('fullName', 'O armazenamento do nome completo está desabilitado nesta instalação (sem chave de cifragem). Use iniciais e prontuário.');
    return cipher.encrypt(name, patientNameContext(auth.institutionId, patientId));
  };

  async function openAdmission(trx: Transaction<DB>, auth: AuthContext, patientId: string, input: z.infer<typeof AdmissionInput>, origin: 'real' | 'demo') {
    if (!notFuture(input.admittedAt)) throw fieldError('admission.admittedAt', 'A data de admissão não pode estar no futuro.');
    await assertSector(trx, auth, input.sectorId, 'admission.sectorId');
    await assertBed(trx, input.sectorId, input.bedId);
    if (await trx.selectFrom('admission').select('id').where('patient_id', '=', patientId).where('discharged_at', 'is', null).executeTakeFirst()) {
      throw new HttpError(409, 'internacao_aberta', 'O paciente já tem uma internação em aberto.');
    }
    const last = await trx.selectFrom('admission').select('discharged_at').where('patient_id', '=', patientId).orderBy('discharged_at', 'desc').executeTakeFirst();
    if (last?.discharged_at && last.discharged_at >= input.admittedAt) throw fieldError('admission.admittedAt', 'A admissão deve ser posterior à última alta.');
    const adm = await trx
      .insertInto('admission')
      .values({ institution_id: auth.institutionId, patient_id: patientId, admitted_at: input.admittedAt, diagnosis: input.diagnosis, data_origin: origin, created_by: auth.userId, updated_at: new Date(), discharged_at: null, outcome: null })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mov = await trx.insertInto('admission_movement').values({ admission_id: adm.id, sector_id: input.sectorId, bed_id: input.bedId, start_at: input.admittedAt, reason: 'Admissão', created_by: auth.userId }).returningAll().executeTakeFirstOrThrow();
    return { adm, mov };
  }

  /* ---------- Patients ---------- */

  app.get('/patients', view, async (req): Promise<Paged<PatientSummary>> => {
    const auth = requireAuth(req);
    const q = parse(PatientsQuery, req.query);
    let base = db.selectFrom('patient as p').where('p.institution_id', '=', auth.institutionId);
    if (q.q) {
      const term = q.q;
      base = base.where((eb) => eb.or([eb('p.record_number', 'ilike', `%${escapeLike(term)}%`), eb('p.initials', '=', term.toUpperCase())]));
    }
    // Sector filter and scope: "internados" looks at the current stay; "todos" at any stay.
    const sectors = q.sectorId ? (auth.scope && !auth.scope.includes(q.sectorId) ? scopeIds([]) : [q.sectorId]) : auth.scope ? scopeIds(auth.scope) : null;
    if (q.status === 'internados') {
      let open = db.selectFrom('admission as a').innerJoin('admission_movement as m', 'm.admission_id', 'a.id').select('a.patient_id').where('a.discharged_at', 'is', null).where('m.end_at', 'is', null);
      if (sectors) open = open.where('m.sector_id', 'in', sectors);
      base = base.where('p.id', 'in', open);
    } else if (sectors) {
      base = base.where('p.id', 'in', db.selectFrom('admission').select('patient_id').where('id', 'in', admissionsInScope(db, sectors)));
    }
    const [ids, total] = await Promise.all([
      base.select('p.id').orderBy('p.record_number').limit(q.pageSize).offset((q.page - 1) * q.pageSize).execute(),
      base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
    ]);
    return { rows: await patientSummaries(db, auth, ids.map((r) => r.id)), total: Number(total.n), page: q.page, pageSize: q.pageSize };
  });

  app.post('/patients', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(PatientCreate, req.body);
    const initials = normalizeInitials(b.initials) ?? (b.fullName ? initialsFromName(b.fullName) : null);
    if (!initials) throw fieldError('initials', 'Informe as iniciais (1 a 6 letras).');
    if (b.birthDate && b.birthDate > todayIn(await timezoneOf(db, auth.institutionId))) throw fieldError('birthDate', 'A data de nascimento não pode estar no futuro.');
    if (!b.admission) {
      // A patient without an admission would be invisible to sector-scoped users.
      if (auth.scope) throw fieldError('admission', 'Informe a internação no seu setor.');
    }
    const id = randomUUID();
    const created = await db.transaction().execute(async (trx) => {
      if (await trx.selectFrom('patient').select('id').where('institution_id', '=', auth.institutionId).where('record_number', '=', b.recordNumber).executeTakeFirst()) {
        throw new HttpError(409, 'duplicado', 'Já existe um paciente com este prontuário.', [{ path: 'recordNumber', message: 'Prontuário já cadastrado.' }]);
      }
      const origin = await institutionOrigin(trx, auth.institutionId);
      const patient = await trx
        .insertInto('patient')
        .values({ id, institution_id: auth.institutionId, record_number: b.recordNumber, initials, full_name_enc: encryptName(auth, id, b.fullName), birth_date: b.birthDate, sex: b.sex, data_origin: origin, updated_at: new Date() })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'patient', entityId: id, after: auditable(patient) });
      if (b.admission) {
        const { adm, mov } = await openAdmission(trx, auth, id, b.admission, origin);
        await audit(trx, actorOf(req), { action: 'create', entity: 'admission', entityId: adm.id, after: { ...adm, movement: mov } });
      }
      return patient;
    });
    reply.code(201);
    return { id: created.id };
  });

  app.get<{ Params: { id: string } }>('/patients/:id', view, async (req): Promise<PatientDetail> => {
    const auth = requireAuth(req);
    const p = await findPatient(db, auth, parse(Uuid, req.params.id));
    const admissionIds = (await db.selectFrom('admission').select('id').where('patient_id', '=', p.id).execute()).map((a) => a.id);
    const canSurgery = auth.permissions.includes('surgery:view');
    const canMicro = auth.permissions.includes('micro:view');
    const canIras = auth.permissions.includes('iras:view');
    const [summary] = await patientSummaries(db, auth, [p.id]);
    const [admissions, surgeries, cultures, cases, notes] = await Promise.all([
      loadAdmissions(db, admissionIds),
      canSurgery ? surgerySummaries(db, { institutionId: auth.institutionId, scope: auth.scope, admissionIds }) : null,
      canMicro ? cultureSummaries(db, { institutionId: auth.institutionId, scope: auth.scope, admissionIds }) : null,
      canIras ? caseSummaries(db, { institutionId: auth.institutionId, scope: auth.scope, admissionIds }) : null,
      loadNotes(db, { patientId: p.id }),
    ]);
    return {
      ...summary!, rowVersion: p.row_version, admissions, surgeries: surgeries?.rows.map((s) => s.summary) ?? [], cultures: cultures?.rows ?? [], cases: cases?.rows ?? [],
      notes: canIras ? notes : notes.filter((n) => !n.caseId),
    };
  });

  /** Identified data: specific permission, mandatory reason, always audited. */
  app.post<{ Params: { id: string } }>('/patients/:id/reveal', { preHandler: requirePermission(db, 'patient:view_identified') }, async (req) => {
    const auth = requireAuth(req);
    const p = await findPatient(db, auth, parse(Uuid, req.params.id));
    const { reason } = parse(Reveal, req.body);
    const fullName = p.full_name_enc && cipher ? cipher.decrypt(p.full_name_enc, patientNameContext(auth.institutionId, p.id)) : null;
    await audit(db, actorOf(req), { action: 'view_identified', entity: 'patient', entityId: p.id, context: { reason, field: 'full_name', available: fullName != null } });
    return { fullName, available: fullName != null, reason: fullName == null ? (p.full_name_enc ? 'Chave de cifragem indisponível nesta instalação.' : 'Nome completo não cadastrado.') : null };
  });

  app.put<{ Params: { id: string } }>('/patients/:id', edit, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(PatientUpdate, req.body);
    const initials = normalizeInitials(b.initials);
    if (!initials) throw fieldError('initials', 'Informe as iniciais (1 a 6 letras).');
    await findPatient(db, auth, id);
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('patient').selectAll().where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      if (before.row_version !== b.rowVersion) throw conflict();
      const full = b.fullName === undefined ? before.full_name_enc : encryptName(auth, id, b.fullName);
      const after = await trx.updateTable('patient').set({ initials, birth_date: b.birthDate, sex: b.sex, full_name_enc: full, updated_at: new Date(), row_version: before.row_version + 1 }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'patient', entityId: id, before: auditable(before), after: auditable(after), context: { justification: b.justification, fullNameChanged: b.fullName !== undefined } });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  /* ---------- Admissions, transfers, discharge ---------- */

  app.post<{ Params: { id: string } }>('/patients/:id/admissions', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(AdmissionInput, req.body);
    // Readmission: the patient must exist in the institution (scope is checked on the target sector).
    const exists = await db.selectFrom('patient').select('id').where('id', '=', id).where('institution_id', '=', auth.institutionId).executeTakeFirst();
    if (!exists) throw notFound('Paciente');
    const created = await db.transaction().execute(async (trx) => {
      const { adm, mov } = await openAdmission(trx, auth, id, b, await institutionOrigin(trx, auth.institutionId));
      await audit(trx, actorOf(req), { action: 'create', entity: 'admission', entityId: adm.id, after: { ...adm, movement: mov } });
      return adm;
    });
    reply.code(201);
    return { id: created.id };
  });

  app.post<{ Params: { id: string } }>('/admissions/:id/transfer', edit, async (req) => {
    const auth = requireAuth(req);
    const adm = await findAdmission(db, auth, parse(Uuid, req.params.id));
    const b = parse(Transfer, req.body);
    if (!notFuture(b.at)) throw fieldError('at', 'A transferência não pode estar no futuro.');
    return db.transaction().execute(async (trx) => {
      const locked = await trx.selectFrom('admission').selectAll().where('id', '=', adm.id).forUpdate().executeTakeFirstOrThrow();
      if (locked.row_version !== b.rowVersion) throw conflict();
      if (locked.discharged_at) throw new HttpError(409, 'internacao_encerrada', 'A internação já foi encerrada.');
      await assertSector(trx, auth, b.sectorId);
      await assertBed(trx, b.sectorId, b.bedId, adm.id);
      const current = await trx.selectFrom('admission_movement').selectAll().where('admission_id', '=', adm.id).where('end_at', 'is', null).executeTakeFirstOrThrow();
      if (b.at <= current.start_at) throw fieldError('at', 'A transferência deve ser posterior à entrada no setor atual.');
      if (current.sector_id === b.sectorId && current.bed_id === b.bedId) throw fieldError('bedId', 'Selecione um setor ou leito diferente do atual.');
      await trx.updateTable('admission_movement').set({ end_at: b.at }).where('id', '=', current.id).execute();
      const mov = await trx.insertInto('admission_movement').values({ admission_id: adm.id, sector_id: b.sectorId, bed_id: b.bedId, start_at: b.at, reason: b.reason ?? 'Transferência', created_by: auth.userId }).returningAll().executeTakeFirstOrThrow();
      const after = await trx.updateTable('admission').set({ updated_at: new Date(), row_version: locked.row_version + 1 }).where('id', '=', adm.id).returning('row_version').executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'admission_movement', entityId: adm.id, before: current, after: mov, context: { kind: 'transferencia' } });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  app.post<{ Params: { id: string } }>('/admissions/:id/discharge', edit, async (req) => {
    const auth = requireAuth(req);
    const adm = await findAdmission(db, auth, parse(Uuid, req.params.id));
    const b = parse(Discharge, req.body);
    if (!notFuture(b.at)) throw fieldError('at', 'A alta não pode estar no futuro.');
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('admission').selectAll().where('id', '=', adm.id).forUpdate().executeTakeFirstOrThrow();
      if (before.row_version !== b.rowVersion) throw conflict();
      if (before.discharged_at) throw new HttpError(409, 'internacao_encerrada', 'A internação já foi encerrada.');
      const current = await trx.selectFrom('admission_movement').selectAll().where('admission_id', '=', adm.id).where('end_at', 'is', null).executeTakeFirstOrThrow();
      if (b.at <= current.start_at) throw fieldError('at', 'A alta deve ser posterior à entrada no setor atual.');
      const lastDevice = await trx.selectFrom('device_use').select((eb) => eb.fn.max('inserted_at').as('m')).where('admission_id', '=', adm.id).executeTakeFirst();
      if (lastDevice?.m && new Date(lastDevice.m) >= b.at) throw fieldError('at', 'A alta deve ser posterior à última inserção de dispositivo.');
      await trx.updateTable('admission_movement').set({ end_at: b.at }).where('id', '=', current.id).execute();
      // Devices still in place end with the discharge (recorded and audited).
      const closed = await trx.updateTable('device_use').set({ removed_at: b.at, removal_reason: 'Encerrado na saída do paciente', row_version: (eb) => eb('row_version', '+', 1) }).where('admission_id', '=', adm.id).where('removed_at', 'is', null).returning(['id', 'device_type']).execute();
      const after = await trx.updateTable('admission').set({ discharged_at: b.at, outcome: b.outcome, updated_at: new Date(), row_version: before.row_version + 1 }).where('id', '=', adm.id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'admission', entityId: adm.id, before, after, context: { kind: 'saida', devicesClosed: closed } });
      return { ok: true, rowVersion: after.row_version, devicesClosed: closed.length };
    });
  });

  /* ---------- Devices ---------- */

  app.post<{ Params: { id: string } }>('/admissions/:id/devices', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const adm = await findAdmission(db, auth, parse(Uuid, req.params.id));
    const b = parse(DeviceCreate, req.body);
    if (adm.discharged_at) throw new HttpError(409, 'internacao_encerrada', 'A internação já foi encerrada.');
    if (!notFuture(b.insertedAt)) throw fieldError('insertedAt', 'A inserção não pode estar no futuro.');
    if (b.insertedAt < adm.admitted_at) throw fieldError('insertedAt', 'A inserção deve ser posterior à admissão.');
    const row = await db.transaction().execute(async (trx) => {
      const open = await trx.selectFrom('device_use').select('id').where('admission_id', '=', adm.id).where('device_type', '=', b.type).where('removed_at', 'is', null).executeTakeFirst();
      if (open && (b.type === 'VM' || b.type === 'SVD')) throw new HttpError(409, 'dispositivo_ativo', 'Já existe um dispositivo deste tipo em uso. Registre a retirada antes.');
      const created = await trx
        .insertInto('device_use')
        .values({ institution_id: auth.institutionId, admission_id: adm.id, device_type: b.type, site: b.site, indication: b.indication, inserted_at: b.insertedAt, data_origin: adm.data_origin, created_by: auth.userId, removed_at: null, removal_reason: null })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'device_use', entityId: created.id, after: created });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  app.post<{ Params: { id: string } }>('/devices/:id/remove', edit, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(DeviceRemove, req.body);
    const device = await db.selectFrom('device_use').select(['admission_id']).where('id', '=', id).where('institution_id', '=', auth.institutionId).executeTakeFirst();
    if (!device) throw notFound('Dispositivo');
    await findAdmission(db, auth, device.admission_id);
    if (!notFuture(b.removedAt)) throw fieldError('removedAt', 'A retirada não pode estar no futuro.');
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('device_use').selectAll().where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      if (before.row_version !== b.rowVersion) throw conflict();
      if (before.removed_at) throw new HttpError(409, 'dispositivo_retirado', 'A retirada deste dispositivo já foi registrada.');
      if (b.removedAt <= before.inserted_at) throw fieldError('removedAt', 'A retirada deve ser posterior à inserção.');
      const after = await trx.updateTable('device_use').set({ removed_at: b.removedAt, removal_reason: b.reason, row_version: before.row_version + 1 }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'device_use', entityId: id, before, after });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  /* ---------- CCIH notes (append-only) ---------- */

  app.post<{ Params: { id: string } }>('/patients/:id/notes', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const p = await findPatient(db, auth, parse(Uuid, req.params.id));
    const b = parse(NoteCreate, req.body);
    if (b.admissionId) {
      const adm = await findAdmission(db, auth, b.admissionId);
      if (adm.patient_id !== p.id) throw fieldError('admissionId', 'A internação não pertence a este paciente.');
    }
    if (b.caseId) {
      const c = await db.selectFrom('iras_case').innerJoin('admission', 'admission.id', 'iras_case.admission_id').select('admission.patient_id').where('iras_case.id', '=', b.caseId).where('iras_case.institution_id', '=', auth.institutionId).executeTakeFirst();
      if (!c || c.patient_id !== p.id) throw fieldError('caseId', 'O caso não pertence a este paciente.');
    }
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('ccih_note')
        .values({ institution_id: auth.institutionId, patient_id: p.id, admission_id: b.admissionId, case_id: b.caseId, kind: b.kind, body: b.body, amends_id: null, justification: null, author_id: auth.userId, author_name: auth.displayName, data_origin: p.data_origin })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'ccih_note', entityId: created.id, after: created });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  /** Corrections never edit the original: a "retificação" note points to it, with a justification. */
  app.post<{ Params: { id: string } }>('/notes/:id/amend', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(NoteAmend, req.body);
    const original = await db.selectFrom('ccih_note').selectAll().where('id', '=', id).where('institution_id', '=', auth.institutionId).executeTakeFirst();
    if (!original) throw notFound('Evolução');
    await findPatient(db, auth, original.patient_id);
    const row = await db.transaction().execute(async (trx) => {
      if (await trx.selectFrom('ccih_note').select('id').where('amends_id', '=', id).executeTakeFirst()) throw new HttpError(409, 'ja_retificada', 'Esta evolução já foi retificada. Retifique a versão mais recente.');
      const created = await trx
        .insertInto('ccih_note')
        .values({ institution_id: auth.institutionId, patient_id: original.patient_id, admission_id: original.admission_id, case_id: original.case_id, kind: 'retificacao', body: b.body, amends_id: id, justification: b.justification, author_id: auth.userId, author_name: auth.displayName, data_origin: original.data_origin })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'ccih_note', entityId: created.id, before: original, after: created, context: { justification: b.justification, kind: 'retificacao' } });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  /* ---------- Census ---------- */

  const censusAccess = { preHandler: requirePermission(db, 'patient:view', 'indicators:view') };

  async function censusRows(auth: AuthContext, counts: Map<string, { pacientes: number; cvc: number; vm: number; svd: number; byDevice: CensusRow['byDevice'] }>): Promise<CensusRow[]> {
    const sectors = await db.selectFrom('sector').select(['id', 'kind']).where('institution_id', '=', auth.institutionId).where('active', '=', true).where('kind', 'in', ['uti', 'internacao']).execute();
    const beds = await db.selectFrom('bed').select(['sector_id']).where('active', '=', true).where('sector_id', 'in', sectors.length ? sectors.map((s) => s.id) : scopeIds([])).execute();
    return sectors
      .filter((s) => !auth.scope || auth.scope.includes(s.id))
      .map((s) => {
        const c = counts.get(s.id);
        return { sectorId: s.id, beds: beds.filter((b) => b.sector_id === s.id).length, pacientes: c?.pacientes ?? 0, cvc: c?.cvc ?? 0, vm: c?.vm ?? 0, svd: c?.svd ?? 0, byDevice: c?.byDevice ?? {} };
      });
  }

  app.get('/census', censusAccess, async (req): Promise<CensusPayload> => {
    const auth = requireAuth(req);
    const tz = await timezoneOf(db, auth.institutionId);
    const { date } = parse(z.object({ date: IsoDate.optional() }).strict(), req.query);
    const day = date ?? todayIn(tz);
    if (day > todayIn(tz)) throw fieldError('date', 'Escolha uma data até hoje.');
    const hour = await censusHourOf(db, auth.institutionId);
    if (hour == null) return { date: day, hour: null, instant: null, rows: await censusRows(auth, new Map()), ruleMissing: true };
    const instant = zonedInstant(day, hour, tz);
    const admissions = await loadCensusAdmissions(db, auth.institutionId, instant, new Date(instant.getTime() + 1), auth.scope);
    return { date: day, hour, instant: instant.toISOString(), rows: await censusRows(auth, censusOfDay(admissions, day, hour, tz)), ruleMissing: false };
  });

  app.get('/census/month', censusAccess, async (req): Promise<CensusMonthPayload> => {
    const auth = requireAuth(req);
    const tz = await timezoneOf(db, auth.institutionId);
    const { month } = parse(z.object({ month: MonthStart }).strict(), req.query);
    const today = todayIn(tz);
    if (month > today) throw fieldError('month', 'Escolha um mês até o atual.');
    const hour = await censusHourOf(db, auth.institutionId);
    if (hour == null) return { month, hour: null, rows: await censusRows(auth, new Map()), ruleMissing: true };
    const last = addDays(addMonths(month, 1), -1);
    // Only days whose census instant has already passed.
    const until = last < today ? last : zonedInstant(today, hour, tz).getTime() <= Date.now() ? today : addDays(today, -1);
    const admissions = await loadCensusAdmissions(db, auth.institutionId, zonedInstant(month, 0, tz), zonedInstant(addDays(until, 1), 0, tz), auth.scope);
    return { month, hour, rows: await censusRows(auth, until < month ? new Map() : censusOfRange(admissions, month, until, hour, tz)), ruleMissing: false };
  });

  /* ---------- Reference lists for the forms ---------- */

  app.get('/professionals', { preHandler: requirePermission(db, 'surgery:view', 'surgery:edit') }, async (req) => {
    const auth = requireAuth(req);
    const rows = await db.selectFrom('professional').leftJoin('job_role', 'job_role.id', 'professional.job_role_id').select(['professional.id', 'professional.name', 'job_role.name as job']).where('professional.institution_id', '=', auth.institutionId).where('professional.active', '=', true).orderBy('professional.name').execute();
    return { professionals: rows.map((r) => ({ id: r.id, name: r.name, jobRole: r.job })) };
  });

  app.get('/procedures', { preHandler: requirePermission(db, 'surgery:view', 'surgery:edit') }, async (req) => {
    const auth = requireAuth(req);
    const rows = await db.selectFrom('procedure_catalog').selectAll().where('institution_id', '=', auth.institutionId).where('active', '=', true).orderBy('name').execute();
    return { procedures: rows.map((p) => ({ id: p.id, code: p.code, name: p.name, specialty: p.specialty, p75Minutes: p.p75_minutes, p75Source: p.p75_source })) };
  });
}
