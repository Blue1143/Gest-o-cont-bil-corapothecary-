import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import {
  dateInZone, evaluateProphylaxis, rulesFromParameters, surgicalRiskIndex, surveillanceEnd, zonedInstant, addDays,
  todayIn,
  type CultureDetail, type Paged, type SurgeryDetail, type SurgerySummary, type CultureSummary, type SurveillanceRow,
} from '@ccih/domain';
import { surgeryMaterials } from '../repositories/cme';
import type { DB } from '../db/types';
import { audit } from '../audit/audit';
import { actorOf, requireAuth, requirePermission, type AuthContext } from '../http/auth';
import { HttpError, conflict, notFound, parse } from '../http/errors';
import { Instant, IsoDate, Justification, OptionalText, PageQuery, RowVersion, Text, Uuid, notFuture } from '../http/schemas';
import { admissionsInScope, assertSector, caseSummaries, cultureSummaries, findAdmission, scopeIds, surgerySummaries } from '../repositories/clinical';

const WOUND = z.enum(['limpa', 'potencialmente_contaminada', 'contaminada', 'infectada']);
const SurgeryFields = {
  procedureId: Uuid, surgeonId: Uuid, sectorId: Uuid, room: OptionalText(40), startedAt: Instant, endedAt: Instant.nullable(),
  woundClass: WOUND.nullable(), asa: z.number().int().min(1).max(6).nullable(), implant: z.boolean(), urgency: z.boolean(),
  prophylaxisIndicated: z.boolean().nullable(), prophylaxisDrug: OptionalText(80), prophylaxisDoseAt: Instant.nullable(),
  prophylaxisDurationH: z.number().min(0).max(720).nullable(), redose: z.boolean().nullable(), notes: OptionalText(2000),
};
const SurgeryCreate = z.object({ admissionId: Uuid, ...SurgeryFields }).strict();
const SurgeryUpdate = z.object({ ...SurgeryFields, rowVersion: RowVersion, justification: Justification }).strict();
const SurgeryQuery = z
  .object({ from: IsoDate.optional(), to: IsoDate.optional(), procedureId: Uuid.optional(), surgeonId: Uuid.optional(), woundClass: WOUND.optional(), q: z.string().trim().max(40).optional(), ...PageQuery })
  .strict();

const MATERIAL = z.enum(['sangue', 'urina', 'secrecao_traqueal', 'lavado_broncoalveolar', 'ponta_cateter', 'ferida_operatoria', 'liquor', 'liquido_pleural', 'swab_vigilancia', 'outro']);
const CultureCreate = z.object({ admissionId: Uuid, sectorId: Uuid, material: MATERIAL, collectedAt: Instant }).strict();
const IsolateInput = z
  .object({
    organism: Text(120), quantity: OptionalText(60), resistanceProfile: z.enum(['MDR', 'XDR', 'PDR']).nullable(), mechanism: OptionalText(200),
    susceptibility: z.array(z.object({ antimicrobial: Text(80), mic: OptionalText(20), interpretation: z.enum(['S', 'I', 'R']) }).strict()).max(60),
  })
  .strict();
const ResultCreate = z
  .object({
    outcome: z.enum(['negativa', 'positiva', 'contaminada']), reportedAt: Instant, breakpointVersion: OptionalText(120), notes: OptionalText(2000),
    isolates: z.array(IsolateInput).max(5), justification: Justification.nullable(),
  })
  .strict();
const CultureQuery = z
  .object({
    from: IsoDate.optional(), to: IsoDate.optional(), sectorId: Uuid.optional(), material: MATERIAL.optional(),
    outcome: z.enum(['pendente', 'negativa', 'positiva', 'contaminada']).optional(), resistant: z.enum(['true']).optional(), organism: z.string().trim().max(80).optional(),
    q: z.string().trim().max(40).optional(), ...PageQuery,
  })
  .strict();

const FollowupCreate = z
  .object({ contactedOn: IsoDate, method: z.enum(['telefone', 'ambulatorio', 'retorno', 'mensagem', 'outro']), outcome: z.enum(['sem_sinais', 'suspeita', 'nao_localizado']), notes: OptionalText(1000), openCase: z.boolean() })
  .strict();

const fieldError = (path: string, message: string) => new HttpError(400, 'validacao', message, [{ path, message }]);

export async function surgeryMicroRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  const tzOf = async (institutionId: string) => (await db.selectFrom('institution').select('timezone').where('id', '=', institutionId).executeTakeFirstOrThrow()).timezone;
  const range = async (auth: AuthContext, from?: string, to?: string) => {
    const tz = await tzOf(auth.institutionId);
    return { from: from ? zonedInstant(from, 0, tz) : undefined, to: to ? zonedInstant(addDays(to, 1), 0, tz) : undefined };
  };

  /* ---------- Surgeries ---------- */

  async function validateSurgery(auth: AuthContext, admission: { admitted_at: Date }, b: z.infer<typeof SurgeryCreate> | z.infer<typeof SurgeryUpdate>) {
    const [proc, surgeon] = await Promise.all([
      db.selectFrom('procedure_catalog').select('id').where('id', '=', b.procedureId).where('institution_id', '=', auth.institutionId).executeTakeFirst(),
      db.selectFrom('professional').select('id').where('id', '=', b.surgeonId).where('institution_id', '=', auth.institutionId).where('active', '=', true).executeTakeFirst(),
    ]);
    if (!proc) throw fieldError('procedureId', 'Procedimento inexistente.');
    if (!surgeon) throw fieldError('surgeonId', 'Profissional inexistente ou inativo.');
    const sector = await assertSector(db, auth, b.sectorId);
    if (sector.kind !== 'centro_cirurgico') throw fieldError('sectorId', 'Selecione um setor do tipo centro cirúrgico.');
    if (!notFuture(b.startedAt)) throw fieldError('startedAt', 'O início não pode estar no futuro.');
    if (b.startedAt < admission.admitted_at) throw fieldError('startedAt', 'O início deve ser posterior à admissão.');
    if (b.endedAt && b.endedAt <= b.startedAt) throw fieldError('endedAt', 'O término deve ser posterior ao início.');
    if (b.prophylaxisIndicated !== true && (b.prophylaxisDrug || b.prophylaxisDoseAt)) throw fieldError('prophylaxisDrug', 'Registre fármaco e horário apenas quando a profilaxia for indicada.');
  }

  app.get('/surgeries', { preHandler: requirePermission(db, 'surgery:view') }, async (req): Promise<Paged<SurgerySummary>> => {
    const auth = requireAuth(req);
    const q = parse(SurgeryQuery, req.query);
    const r = await surgerySummaries(db, { institutionId: auth.institutionId, scope: auth.scope, ...(await range(auth, q.from, q.to)), procedureId: q.procedureId, surgeonId: q.surgeonId, woundClass: q.woundClass, q: q.q }, { limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
    return { rows: r.rows.map((x) => x.summary), total: r.total, page: q.page, pageSize: q.pageSize };
  });

  app.get<{ Params: { id: string } }>('/surgeries/:id', { preHandler: requirePermission(db, 'surgery:view') }, async (req): Promise<SurgeryDetail> => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const found = (await surgerySummaries(db, { institutionId: auth.institutionId, scope: auth.scope, ids: [id] })).rows[0];
    if (!found) throw notFound('Cirurgia');
    const s = found.summary;
    const [params, tz, cases] = await Promise.all([
      db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', auth.institutionId).execute(),
      tzOf(auth.institutionId),
      auth.permissions.includes('iras:view') ? caseSummaries(db, { institutionId: auth.institutionId, scope: undefined, surgeryId: id }) : null,
    ]);
    const rules = rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id })));
    const durationMin = s.endedAt ? Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000) : null;
    return {
      ...s, notes: found.notes, p75Minutes: found.p75Minutes, p75Source: found.p75Source,
      risk: surgicalRiskIndex({ asa: s.asa, woundClass: s.woundClass, durationMin, p75Min: found.p75Minutes }),
      prophylaxis: evaluateProphylaxis(
        { indicated: s.prophylaxisIndicated, drug: s.prophylaxisDrug, minutesBeforeIncision: s.prophylaxisDoseAt ? Math.round((Date.parse(s.startedAt) - Date.parse(s.prophylaxisDoseAt)) / 60_000) : null, durationHours: s.prophylaxisDurationH },
        { windowMin: rules.surgery.prophylaxisWindowMin?.value, windowByDrugMin: rules.surgery.prophylaxisWindowByDrugMin?.value, maxDurationH: rules.surgery.prophylaxisMaxDurationH?.value },
      ),
      surveillance: surveillanceEnd(dateInZone(new Date(s.startedAt), tz), s.implant, { days: rules.surgery.surveillanceDays?.value, daysWithImplant: rules.surgery.surveillanceDaysWithImplant?.value }),
      cases: cases?.rows ?? [],
      dischargedAt: (await db.selectFrom('admission').select('discharged_at').where('id', '=', s.admissionId).executeTakeFirstOrThrow()).discharged_at?.toISOString() ?? null,
      materials: await surgeryMaterials(db, id),
      followups: (await db.selectFrom('ssi_followup').selectAll().where('surgery_id', '=', id).orderBy('contacted_on', 'desc').execute()).map((f) => ({ id: f.id, contactedOn: f.contacted_on, method: f.method, outcome: f.outcome, notes: f.notes, caseId: f.case_id, by: f.recorded_by_name })),
    };
  });

  /** Open post-operative surveillance windows (SSI), with contact status. */
  app.get('/surgeries/surveillance', { preHandler: requirePermission(db, 'surgery:view') }, async (req): Promise<{ rows: SurveillanceRow[]; ruleMissing: boolean }> => {
    const auth = requireAuth(req);
    const { pending } = parse(z.object({ pending: z.enum(['1']).optional() }).strict(), req.query);
    const tz = await tzOf(auth.institutionId);
    const today = todayIn(tz);
    const params = await db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', auth.institutionId).execute();
    const rules = rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id })));
    const rule = { days: rules.surgery.surveillanceDays?.value, daysWithImplant: rules.surgery.surveillanceDaysWithImplant?.value };
    if (rule.days == null && rule.daysWithImplant == null) return { rows: [], ruleMissing: true };
    const maxDays = Math.max(rule.days ?? 0, rule.daysWithImplant ?? 0);
    let q = db.selectFrom('surgery as s').innerJoin('admission as a', 'a.id', 's.admission_id').innerJoin('patient as p', 'p.id', 'a.patient_id').innerJoin('procedure_catalog as pc', 'pc.id', 's.procedure_id')
      .select(['s.id', 's.started_at', 's.implant', 'a.discharged_at', 'pc.name', 'p.id as patient_id', 'p.initials', 'p.record_number'])
      .where('s.institution_id', '=', auth.institutionId).where('s.started_at', '>=', zonedInstant(addDays(today, -maxDays), 0, tz));
    if (auth.scope) {
      const scope = scopeIds(auth.scope);
      q = q.where((eb) => eb.or([eb('s.sector_id', 'in', scope), eb('s.admission_id', 'in', admissionsInScope(db, scope))]));
    }
    const rows = await q.orderBy('s.started_at').execute();
    const follow = rows.length ? await db.selectFrom('ssi_followup').select(['surgery_id', 'contacted_on', 'outcome']).where('surgery_id', 'in', rows.map((r) => r.id)).execute() : [];
    const out = rows.flatMap((s): SurveillanceRow[] => {
      const end = surveillanceEnd(dateInZone(s.started_at, tz), s.implant, rule);
      if (!end || end.end < today) return [];
      const mine = follow.filter((f) => f.surgery_id === s.id).sort((a, b) => b.contacted_on.localeCompare(a.contacted_on));
      return [{ surgeryId: s.id, patient: { id: s.patient_id, recordNumber: s.record_number, initials: s.initials }, procedure: s.name, surgeryDate: s.started_at.toISOString(), dischargedAt: s.discharged_at?.toISOString() ?? null, windowEnd: end.end, implant: s.implant, lastContact: mine[0]?.contacted_on ?? null, contacts: mine.length, suspicion: mine.some((f) => f.outcome === 'suspeita') }];
    });
    return { rows: pending ? out.filter((r) => r.dischargedAt && !r.contacts) : out, ruleMissing: false };
  });

  /** Post-discharge contact; a suspicion can open an SSI case (IRAS workflow) linked to the surgery. */
  app.post<{ Params: { id: string } }>('/surgeries/:id/followups', { preHandler: requirePermission(db, 'surgery:edit') }, async (req, reply) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(FollowupCreate, req.body);
    const found = (await surgerySummaries(db, { institutionId: auth.institutionId, scope: auth.scope, ids: [id] })).rows[0];
    if (!found) throw notFound('Cirurgia');
    const tz = await tzOf(auth.institutionId);
    if (b.contactedOn > todayIn(tz)) throw fieldError('contactedOn', 'O contato não pode estar no futuro.');
    if (b.contactedOn < dateInZone(new Date(found.summary.startedAt), tz)) throw fieldError('contactedOn', 'O contato deve ser posterior à cirurgia.');
    if (b.openCase && b.outcome !== 'suspeita') throw fieldError('openCase', 'Só é possível abrir caso quando há suspeita de ISC.');
    if (b.openCase && !auth.permissions.includes('iras:edit')) throw new HttpError(403, 'sem_permissao', 'Seu perfil não pode registrar suspeitas de IRAS.');
    const row = await db.transaction().execute(async (trx) => {
      let caseId: string | null = null;
      if (b.openCase) {
        const lastSector = await trx.selectFrom('admission_movement').select('sector_id').where('admission_id', '=', found.summary.admissionId).orderBy('start_at', 'desc').executeTakeFirstOrThrow();
        const adm = await trx.selectFrom('admission').select('data_origin').where('id', '=', found.summary.admissionId).executeTakeFirstOrThrow();
        const created = await trx.insertInto('iras_case').values({
          institution_id: auth.institutionId, admission_id: found.summary.admissionId, iras_type: 'ISC', status: 'suspeita', event_date: b.contactedOn, sector_id: lastSector.sector_id,
          device_associated: null, device_use_id: null, surgery_id: id, criterion_reference_id: null, criterion_snapshot: null, description: `Suspeita identificada na vigilância pós-alta. ${b.notes ?? ''}`.trim(),
          data_origin: adm.data_origin, created_by: auth.userId, updated_at: new Date(),
        }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('iras_case_status').values({ case_id: created.id, from_status: null, to_status: 'suspeita', justification: 'Suspeita de ISC na vigilância pós-alta.', decided_by: auth.userId, decided_by_name: auth.displayName, at: new Date() }).execute();
        await audit(trx, actorOf(req), { action: 'create', entity: 'iras_case', entityId: created.id, after: created, context: { origin: 'vigilancia_pos_alta' } });
        caseId = created.id;
      }
      const f = await trx.insertInto('ssi_followup').values({ surgery_id: id, contacted_on: b.contactedOn, method: b.method, outcome: b.outcome, notes: b.notes, case_id: caseId, recorded_by: auth.userId, recorded_by_name: auth.displayName }).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'ssi_followup', entityId: f.id, after: f });
      return f;
    });
    reply.code(201);
    return { id: row.id, caseId: row.case_id };
  });

  const surgeryValues = (b: z.infer<typeof SurgeryCreate> | z.infer<typeof SurgeryUpdate>) => ({
    procedure_id: b.procedureId, surgeon_id: b.surgeonId, sector_id: b.sectorId, room: b.room, started_at: b.startedAt, ended_at: b.endedAt, wound_class: b.woundClass,
    asa: b.asa, implant: b.implant, urgency: b.urgency, prophylaxis_indicated: b.prophylaxisIndicated, prophylaxis_drug: b.prophylaxisDrug?.toLowerCase() ?? null,
    prophylaxis_dose_at: b.prophylaxisDoseAt, prophylaxis_duration_h: b.prophylaxisDurationH, redose: b.redose, notes: b.notes,
  });

  app.post('/surgeries', { preHandler: requirePermission(db, 'surgery:edit') }, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(SurgeryCreate, req.body);
    const adm = await findAdmission(db, auth, b.admissionId);
    await validateSurgery(auth, adm, b);
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx.insertInto('surgery').values({ ...surgeryValues(b), institution_id: auth.institutionId, admission_id: adm.id, data_origin: adm.data_origin, created_by: auth.userId, updated_at: new Date() }).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'surgery', entityId: created.id, after: created });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  app.put<{ Params: { id: string } }>('/surgeries/:id', { preHandler: requirePermission(db, 'surgery:edit') }, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(SurgeryUpdate, req.body);
    const current = await db.selectFrom('surgery').select('admission_id').where('id', '=', id).where('institution_id', '=', auth.institutionId).executeTakeFirst();
    if (!current) throw notFound('Cirurgia');
    const adm = await findAdmission(db, auth, current.admission_id);
    await validateSurgery(auth, adm, b);
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('surgery').selectAll().where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      if (before.row_version !== b.rowVersion) throw conflict();
      const after = await trx.updateTable('surgery').set({ ...surgeryValues(b), updated_at: new Date(), row_version: before.row_version + 1 }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'surgery', entityId: id, before, after, context: { justification: b.justification } });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  /* ---------- Cultures ---------- */

  app.get('/cultures', { preHandler: requirePermission(db, 'micro:view') }, async (req): Promise<Paged<CultureSummary>> => {
    const auth = requireAuth(req);
    const q = parse(CultureQuery, req.query);
    const r = await cultureSummaries(
      db,
      { institutionId: auth.institutionId, scope: auth.scope, ...(await range(auth, q.from, q.to)), sectorId: q.sectorId, material: q.material, outcome: q.outcome, resistant: q.resistant === 'true', organism: q.organism, q: q.q },
      { limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
    );
    return { rows: r.rows, total: r.total, page: q.page, pageSize: q.pageSize };
  });

  app.get<{ Params: { id: string } }>('/cultures/:id', { preHandler: requirePermission(db, 'micro:view') }, async (req): Promise<CultureDetail> => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const summary = (await cultureSummaries(db, { institutionId: auth.institutionId, scope: auth.scope, ids: [id] })).rows[0];
    if (!summary) throw notFound('Cultura');
    const results = await db.selectFrom('culture_result').selectAll().where('culture_id', '=', id).orderBy('version', 'desc').execute();
    const isolates = results.length ? await db.selectFrom('isolate').selectAll().where('result_id', 'in', results.map((r) => r.id)).execute() : [];
    const tests = isolates.length ? await db.selectFrom('susceptibility').selectAll().where('isolate_id', 'in', isolates.map((i) => i.id)).orderBy('antimicrobial').execute() : [];
    const cases = await db.selectFrom('iras_case_culture').select('case_id').where('culture_id', '=', id).execute();
    return {
      ...summary,
      caseIds: cases.map((c) => c.case_id),
      results: results.map((r) => ({
        id: r.id, version: r.version, outcome: r.outcome, reportedAt: r.reported_at.toISOString(), breakpointVersion: r.breakpoint_version, notes: r.notes, justification: r.justification, recordedBy: r.recorded_by_name,
        isolates: isolates.filter((i) => i.result_id === r.id).map((i) => ({
          id: i.id, organism: i.organism, quantity: i.quantity, resistanceProfile: i.resistance_profile, mechanism: i.mechanism,
          susceptibility: tests.filter((t) => t.isolate_id === i.id).map((t) => ({ antimicrobial: t.antimicrobial, mic: t.mic, interpretation: t.interpretation })),
        })),
      })),
    };
  });

  app.post('/cultures', { preHandler: requirePermission(db, 'micro:edit') }, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(CultureCreate, req.body);
    const adm = await findAdmission(db, auth, b.admissionId);
    await assertSector(db, auth, b.sectorId);
    if (!notFuture(b.collectedAt)) throw fieldError('collectedAt', 'A coleta não pode estar no futuro.');
    if (b.collectedAt < adm.admitted_at) throw fieldError('collectedAt', 'A coleta deve ser posterior à admissão.');
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx.insertInto('culture').values({ institution_id: auth.institutionId, admission_id: adm.id, sector_id: b.sectorId, material: b.material, collected_at: b.collectedAt, origin: 'manual', data_origin: adm.data_origin, created_by: auth.userId }).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'culture', entityId: created.id, after: created });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  /** A result is never overwritten: each record is a new version; corrections require a justification. */
  app.post<{ Params: { id: string } }>('/cultures/:id/results', { preHandler: requirePermission(db, 'micro:edit') }, async (req, reply) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(ResultCreate, req.body);
    const culture = (await cultureSummaries(db, { institutionId: auth.institutionId, scope: auth.scope, ids: [id] })).rows[0];
    if (!culture) throw notFound('Cultura');
    if (!notFuture(b.reportedAt)) throw fieldError('reportedAt', 'A liberação do resultado não pode estar no futuro.');
    if (b.reportedAt < new Date(culture.collectedAt)) throw fieldError('reportedAt', 'O resultado deve ser posterior à coleta.');
    if (b.outcome === 'positiva' && !b.isolates.length) throw fieldError('isolates', 'Informe ao menos um microrganismo para cultura positiva.');
    if (b.outcome !== 'positiva' && b.isolates.length) throw fieldError('isolates', 'Microrganismos só podem ser informados em cultura positiva.');
    const result = await db.transaction().execute(async (trx) => {
      await trx.selectFrom('culture').select('id').where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      const last = await trx.selectFrom('culture_result').select(['version']).where('culture_id', '=', id).orderBy('version', 'desc').executeTakeFirst();
      const version = (last?.version ?? 0) + 1;
      if (version > 1 && !b.justification) throw fieldError('justification', 'Informe o motivo da correção do resultado.');
      const row = await trx
        .insertInto('culture_result')
        .values({ culture_id: id, version, outcome: b.outcome, reported_at: b.reportedAt, breakpoint_version: b.breakpointVersion, notes: b.notes, justification: version > 1 ? b.justification : null, recorded_by: auth.userId, recorded_by_name: auth.displayName })
        .returningAll()
        .executeTakeFirstOrThrow();
      for (const iso of b.isolates) {
        const isolate = await trx.insertInto('isolate').values({ result_id: row.id, organism: iso.organism, quantity: iso.quantity, resistance_profile: iso.resistanceProfile, mechanism: iso.mechanism }).returning('id').executeTakeFirstOrThrow();
        if (iso.susceptibility.length) await trx.insertInto('susceptibility').values(iso.susceptibility.map((t) => ({ isolate_id: isolate.id, antimicrobial: t.antimicrobial, mic: t.mic, interpretation: t.interpretation }))).execute();
      }
      await audit(trx, actorOf(req), { action: version > 1 ? 'update' : 'create', entity: 'culture_result', entityId: id, after: { ...row, isolates: b.isolates }, context: { version, ...(b.justification ? { justification: b.justification } : {}) } });
      return row;
    });
    reply.code(201);
    return { id: result.id, version: result.version };
  });
}
