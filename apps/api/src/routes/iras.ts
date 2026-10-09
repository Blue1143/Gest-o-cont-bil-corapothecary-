import type { FastifyInstance } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import {
  checkTransition, dateInZone, irasContext, isOpenStatus, rulesFromParameters, todayIn, transitionPermission,
  type CriterionSnapshot, type InvestigationStatus, type IrasCaseDetail, type Paged, type IrasCaseSummary,
} from '@ccih/domain';
import type { DB } from '../db/types';
import { audit } from '../audit/audit';
import { actorOf, requireAuth, requirePermission, type AuthContext } from '../http/auth';
import { HttpError, conflict, forbidden, notFound, parse } from '../http/errors';
import { IsoDate, Justification, OptionalText, PageQuery, RowVersion, Uuid } from '../http/schemas';
import { assertSector, caseSummaries, cultureSummaries, findAdmission, loadAdmissions, loadNotes, surgerySummaries } from '../repositories/clinical';

const TYPE = z.enum(['IPCS', 'PAV', 'ITU-AC', 'ISC', 'OUTRA']);
const STATUS = z.enum(['suspeita', 'em_investigacao', 'confirmada', 'descartada']);
const Links = { deviceUseId: Uuid.nullable(), surgeryId: Uuid.nullable(), cultureIds: z.array(Uuid).max(20) };
const CaseCreate = z.object({ admissionId: Uuid, type: TYPE, eventDate: IsoDate, sectorId: Uuid, description: OptionalText(4000), ...Links, justification: Justification }).strict();
const CaseUpdate = z.object({ type: TYPE, eventDate: IsoDate, sectorId: Uuid, description: OptionalText(4000), ...Links, rowVersion: RowVersion, justification: Justification }).strict();
const StatusChange = z.object({ to: STATUS, justification: Justification, criterionReferenceId: Uuid.nullable(), deviceAssociated: z.boolean().nullable(), rowVersion: RowVersion }).strict();
const ListQuery = z
  .object({
    status: z.string().max(80).optional(), type: TYPE.optional(), sectorId: Uuid.optional(), from: IsoDate.optional(), to: IsoDate.optional(),
    deviceType: z.enum(['CVC', 'PICC', 'VM', 'SVD', 'PAI', 'DRENO', 'OUTRO']).optional(), q: z.string().trim().max(40).optional(), ...PageQuery,
  })
  .strict();

const fieldError = (path: string, message: string) => new HttpError(400, 'validacao', message, [{ path, message }]);

/** Links must belong to the same admission (no cross-patient references). */
async function assertLinks(trx: Transaction<DB>, admissionId: string, links: { deviceUseId: string | null; surgeryId: string | null; cultureIds: string[] }) {
  if (links.deviceUseId && !(await trx.selectFrom('device_use').select('id').where('id', '=', links.deviceUseId).where('admission_id', '=', admissionId).executeTakeFirst())) {
    throw fieldError('deviceUseId', 'O dispositivo não pertence a esta internação.');
  }
  if (links.surgeryId && !(await trx.selectFrom('surgery').select('id').where('id', '=', links.surgeryId).where('admission_id', '=', admissionId).executeTakeFirst())) {
    throw fieldError('surgeryId', 'A cirurgia não pertence a esta internação.');
  }
  const ids = [...new Set(links.cultureIds)];
  if (ids.length) {
    const found = await trx.selectFrom('culture').select('id').where('id', 'in', ids).where('admission_id', '=', admissionId).execute();
    if (found.length !== ids.length) throw fieldError('cultureIds', 'Há culturas que não pertencem a esta internação.');
  }
  return ids;
}

async function rulesOf(db: Kysely<DB>, institutionId: string) {
  const params = await db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', institutionId).execute();
  return rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id })));
}

export async function irasRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  async function findCase(auth: AuthContext, id: string) {
    let q = db.selectFrom('iras_case').selectAll().where('id', '=', id).where('institution_id', '=', auth.institutionId);
    if (auth.scope) q = q.where('sector_id', 'in', auth.scope.length ? auth.scope : ['00000000-0000-0000-0000-000000000000']);
    const row = await q.executeTakeFirst();
    if (!row) throw notFound('Caso');
    return row;
  }

  app.get('/iras', { preHandler: requirePermission(db, 'iras:view') }, async (req): Promise<Paged<IrasCaseSummary> & { counts: Record<InvestigationStatus, number> }> => {
    const auth = requireAuth(req);
    const q = parse(ListQuery, req.query);
    const status = q.status ? q.status.split(',').map((s) => parse(STATUS, s)) : undefined;
    const filter = { institutionId: auth.institutionId, scope: auth.scope, status, type: q.type, sectorId: q.sectorId, from: q.from, to: q.to, deviceType: q.deviceType, q: q.q };
    const [page, all] = await Promise.all([
      caseSummaries(db, filter, { limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
      caseSummaries(db, { ...filter, status: undefined }),
    ]);
    const counts = { suspeita: 0, em_investigacao: 0, confirmada: 0, descartada: 0 };
    for (const c of all.rows) counts[c.status]++;
    return { rows: page.rows, total: page.total, page: q.page, pageSize: q.pageSize, counts };
  });

  app.get<{ Params: { id: string } }>('/iras/:id', { preHandler: requirePermission(db, 'iras:view') }, async (req): Promise<IrasCaseDetail> => {
    const auth = requireAuth(req);
    const c = await findCase(auth, parse(Uuid, req.params.id));
    const [summary] = (await caseSummaries(db, { institutionId: auth.institutionId, scope: auth.scope, ids: [c.id] })).rows;
    const [admission] = await loadAdmissions(db, [c.admission_id]);
    const [history, links, notes, rules, inst] = await Promise.all([
      db.selectFrom('iras_case_status').selectAll().where('case_id', '=', c.id).orderBy('at').execute(),
      db.selectFrom('iras_case_culture').select('culture_id').where('case_id', '=', c.id).execute(),
      loadNotes(db, { caseId: c.id }),
      rulesOf(db, auth.institutionId),
      db.selectFrom('institution').select('timezone').where('id', '=', auth.institutionId).executeTakeFirstOrThrow(),
    ]);
    const cultureIds = links.map((l) => l.culture_id);
    // Linked records are shown even outside the user's sector scope: they belong to this case.
    const [cultures, surgery] = await Promise.all([
      auth.permissions.includes('micro:view') && cultureIds.length ? cultureSummaries(db, { institutionId: auth.institutionId, scope: undefined, ids: cultureIds }) : null,
      auth.permissions.includes('surgery:view') && c.surgery_id ? surgerySummaries(db, { institutionId: auth.institutionId, scope: undefined, ids: [c.surgery_id] }) : null,
    ]);
    const tz = inst.timezone;
    return {
      ...summary!, description: c.description, deviceUseId: c.device_use_id, cultureIds, criterionReferenceId: c.criterion_reference_id,
      history: history.map((h) => ({ id: h.id, from: h.from_status as InvestigationStatus | null, to: h.to_status as InvestigationStatus, at: h.at.toISOString(), by: h.decided_by_name, justification: h.justification })),
      admission: admission!, cultures: cultures?.rows ?? [], surgery: surgery?.rows[0]?.summary ?? null, notes,
      context: irasContext({
        type: c.iras_type, admittedOn: dateInZone(new Date(admission!.admittedAt), tz), eventDate: c.event_date, rules,
        devices: admission!.devices.map((d) => ({ id: d.id, type: d.type, insertedOn: dateInZone(new Date(d.insertedAt), tz), removedOn: d.removedAt ? dateInZone(new Date(d.removedAt), tz) : null })),
      }),
    };
  });

  app.post('/iras', { preHandler: requirePermission(db, 'iras:edit') }, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(CaseCreate, req.body);
    const adm = await findAdmission(db, auth, b.admissionId);
    await assertSector(db, auth, b.sectorId);
    const tz = (await db.selectFrom('institution').select('timezone').where('id', '=', auth.institutionId).executeTakeFirstOrThrow()).timezone;
    if (b.eventDate > todayIn(tz)) throw fieldError('eventDate', 'A data do evento não pode estar no futuro.');
    if (b.eventDate < dateInZone(adm.admitted_at, tz)) throw fieldError('eventDate', 'A data do evento deve ser posterior à admissão.');
    const created = await db.transaction().execute(async (trx) => {
      const cultureIds = await assertLinks(trx, adm.id, b);
      const now = new Date();
      const row = await trx
        .insertInto('iras_case')
        .values({
          institution_id: auth.institutionId, admission_id: adm.id, iras_type: b.type, status: 'suspeita', event_date: b.eventDate, sector_id: b.sectorId,
          device_associated: null, device_use_id: b.deviceUseId, surgery_id: b.surgeryId, criterion_reference_id: null, criterion_snapshot: null,
          description: b.description, data_origin: adm.data_origin, created_by: auth.userId, updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (cultureIds.length) await trx.insertInto('iras_case_culture').values(cultureIds.map((culture_id) => ({ case_id: row.id, culture_id }))).execute();
      await trx.insertInto('iras_case_status').values({ case_id: row.id, from_status: null, to_status: 'suspeita', justification: b.justification, decided_by: auth.userId, decided_by_name: auth.displayName, at: now }).execute();
      await audit(trx, actorOf(req), { action: 'create', entity: 'iras_case', entityId: row.id, after: { ...row, cultureIds }, context: { justification: b.justification } });
      return row;
    });
    reply.code(201);
    return { id: created.id };
  });

  app.put<{ Params: { id: string } }>('/iras/:id', { preHandler: requirePermission(db, 'iras:edit') }, async (req) => {
    const auth = requireAuth(req);
    const c = await findCase(auth, parse(Uuid, req.params.id));
    const b = parse(CaseUpdate, req.body);
    if (!isOpenStatus(c.status)) throw new HttpError(409, 'caso_concluido', 'Caso concluído não pode ser editado. Reabra a investigação para alterá-lo.');
    await assertSector(db, auth, b.sectorId);
    const adm = await findAdmission(db, auth, c.admission_id);
    const tz = (await db.selectFrom('institution').select('timezone').where('id', '=', auth.institutionId).executeTakeFirstOrThrow()).timezone;
    if (b.eventDate > todayIn(tz) || b.eventDate < dateInZone(adm.admitted_at, tz)) throw fieldError('eventDate', 'A data do evento deve estar entre a admissão e hoje.');
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('iras_case').selectAll().where('id', '=', c.id).forUpdate().executeTakeFirstOrThrow();
      if (before.row_version !== b.rowVersion) throw conflict();
      const cultureIds = await assertLinks(trx, c.admission_id, b);
      const beforeCultures = (await trx.selectFrom('iras_case_culture').select('culture_id').where('case_id', '=', c.id).execute()).map((r) => r.culture_id).sort();
      const after = await trx
        .updateTable('iras_case')
        .set({ iras_type: b.type, event_date: b.eventDate, sector_id: b.sectorId, description: b.description, device_use_id: b.deviceUseId, surgery_id: b.surgeryId, updated_at: new Date(), row_version: before.row_version + 1 })
        .where('id', '=', c.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx.deleteFrom('iras_case_culture').where('case_id', '=', c.id).execute();
      if (cultureIds.length) await trx.insertInto('iras_case_culture').values(cultureIds.map((culture_id) => ({ case_id: c.id, culture_id }))).execute();
      await audit(trx, actorOf(req), { action: 'update', entity: 'iras_case', entityId: c.id, before: { ...before, cultureIds: beforeCultures }, after: { ...after, cultureIds: [...cultureIds].sort() }, context: { justification: b.justification } });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  /** Status transitions: concluding or reopening needs iras:decide; history rows are append-only. */
  app.post<{ Params: { id: string } }>('/iras/:id/status', { preHandler: requirePermission(db, 'iras:edit', 'iras:decide') }, async (req) => {
    const auth = requireAuth(req);
    const c = await findCase(auth, parse(Uuid, req.params.id));
    const b = parse(StatusChange, req.body);
    const needed = transitionPermission(c.status, b.to);
    if (!auth.permissions.includes(needed)) {
      await audit(db, actorOf(req), { action: 'access_denied', entity: 'iras_case', entityId: c.id, context: { required: [needed], transition: `${c.status}->${b.to}` } });
      throw forbidden();
    }
    const problems = checkTransition(c.status, b.to, { type: c.iras_type, justification: b.justification, criterionReferenceId: b.criterionReferenceId, deviceAssociated: b.deviceAssociated, deviceUseId: c.device_use_id, surgeryId: c.surgery_id });
    if (problems.length) throw new HttpError(400, 'validacao', 'Não é possível concluir esta etapa. Revise os campos indicados.', problems);
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('iras_case').selectAll().where('id', '=', c.id).forUpdate().executeTakeFirstOrThrow();
      if (before.row_version !== b.rowVersion || before.status !== c.status) throw conflict();
      let snapshot: CriterionSnapshot | null = null;
      if (b.criterionReferenceId) {
        const ref = await trx.selectFrom('clinical_reference').selectAll().where('id', '=', b.criterionReferenceId).where('institution_id', '=', auth.institutionId).executeTakeFirst();
        if (!ref) throw fieldError('criterionReferenceId', 'Referência inexistente.');
        // Frozen at decision time: later edits of the reference do not rewrite past decisions.
        snapshot = { code: ref.code, title: ref.title, version: ref.doc_version, source: ref.source, validated: ref.status === 'vigente' && ref.validated_by != null };
      }
      const concluding = b.to === 'confirmada' || b.to === 'descartada';
      const now = new Date();
      const after = await trx
        .updateTable('iras_case')
        .set({
          status: b.to,
          criterion_reference_id: concluding ? b.criterionReferenceId : null,
          criterion_snapshot: concluding && snapshot ? JSON.stringify(snapshot) : null,
          device_associated: b.to === 'confirmada' ? b.deviceAssociated : concluding ? before.device_associated : null,
          updated_at: now,
          row_version: before.row_version + 1,
        })
        .where('id', '=', c.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx.insertInto('iras_case_status').values({ case_id: c.id, from_status: before.status, to_status: b.to, justification: b.justification, decided_by: auth.userId, decided_by_name: auth.displayName, at: now }).execute();
      await audit(trx, actorOf(req), { action: 'status_change', entity: 'iras_case', entityId: c.id, before, after, context: { justification: b.justification, from: before.status, to: b.to, criterionValidated: snapshot?.validated ?? null } });
      return { ok: true, rowVersion: after.row_version, criterionValidated: snapshot?.validated ?? null };
    });
  });
}
