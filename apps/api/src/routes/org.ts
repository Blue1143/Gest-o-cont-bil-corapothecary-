import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { OrgPayload } from '@ccih/domain';
import type { DB } from '../db/types';
import { audit } from '../audit/audit';
import { actorOf, requireAuth, requirePermission } from '../http/auth';
import { HttpError, conflict, notFound, parse } from '../http/errors';
import { Justification, RowVersion, Text, Uuid } from '../http/schemas';

const KIND = z.enum(['uti', 'internacao', 'centro_cirurgico', 'cme', 'apoio']);
const UnitCreate = z.object({ name: Text(120), justification: Justification }).strict();
const UnitUpdate = z.object({ name: Text(120), active: z.boolean(), rowVersion: RowVersion, justification: Justification }).strict();
const SectorCreate = z.object({ unitId: Uuid, code: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Use letras minúsculas, números e hífen.'), name: Text(120), kind: KIND, justification: Justification }).strict();
const SectorUpdate = z.object({ unitId: Uuid, name: Text(120), kind: KIND, active: z.boolean(), rowVersion: RowVersion, justification: Justification }).strict();
const BedsCreate = z.object({ codes: z.array(z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, 'Código de leito inválido.')).min(1).max(100), justification: Justification }).strict();
const BedUpdate = z.object({ active: z.boolean(), justification: Justification }).strict();

const duplicate = (path: string, message: string) => new HttpError(409, 'duplicado', message, [{ path, message }]);

export async function orgRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  /** Units, sectors and beds visible to the user (scope applies; admins with config:view see inactive ones too). */
  app.get('/org', async (req): Promise<OrgPayload> => {
    const auth = requireAuth(req);
    const all = auth.permissions.includes('config:view');
    const [units, sectors, beds, busy] = await Promise.all([
      db.selectFrom('unit').select(['id', 'name', 'active', 'row_version']).where('institution_id', '=', auth.institutionId).orderBy('name').execute(),
      db.selectFrom('sector').select(['id', 'code', 'name', 'unit_id', 'kind', 'active', 'row_version']).where('institution_id', '=', auth.institutionId).orderBy('name').execute(),
      db.selectFrom('bed').innerJoin('sector', 'sector.id', 'bed.sector_id').select(['bed.id', 'bed.code', 'bed.active', 'bed.sector_id']).where('sector.institution_id', '=', auth.institutionId).orderBy('bed.code').execute(),
      db.selectFrom('admission_movement').innerJoin('bed', 'bed.id', 'admission_movement.bed_id').select('bed.id').where('admission_movement.end_at', 'is', null).execute(),
    ]);
    const occupied = new Set(busy.map((b) => b.id));
    const visible = sectors.filter((s) => (all || s.active) && (!auth.scope || auth.scope.includes(s.id)));
    return {
      units: units.filter((u) => (all || u.active) && (all || visible.some((s) => s.unit_id === u.id))).map((u) => ({ id: u.id, name: u.name, active: u.active, rowVersion: u.row_version })),
      sectors: visible.map((s) => ({
        id: s.id, code: s.code, name: s.name, unitId: s.unit_id, kind: s.kind, active: s.active, rowVersion: s.row_version,
        beds: beds.filter((b) => b.sector_id === s.id && (all || b.active)).map((b) => ({ id: b.id, code: b.code, active: b.active, occupied: occupied.has(b.id) })),
      })),
    };
  });

  const edit = { preHandler: requirePermission(db, 'config:org:edit') };

  app.post('/org/units', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(UnitCreate, req.body);
    const row = await db.transaction().execute(async (trx) => {
      if (await trx.selectFrom('unit').select('id').where('institution_id', '=', auth.institutionId).where('name', '=', b.name).executeTakeFirst()) throw duplicate('name', 'Já existe uma unidade com este nome.');
      const created = await trx.insertInto('unit').values({ institution_id: auth.institutionId, name: b.name }).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'unit', entityId: created.id, after: created, context: { justification: b.justification } });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  app.put<{ Params: { id: string } }>('/org/units/:id', edit, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(UnitUpdate, req.body);
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('unit').selectAll().where('id', '=', id).where('institution_id', '=', auth.institutionId).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Unidade');
      if (before.row_version !== b.rowVersion) throw conflict();
      if (!b.active && (await trx.selectFrom('sector').select('id').where('unit_id', '=', id).where('active', '=', true).executeTakeFirst())) {
        throw new HttpError(400, 'validacao', 'Desative os setores da unidade antes de desativá-la.', [{ path: 'active', message: 'A unidade tem setores ativos.' }]);
      }
      const after = await trx.updateTable('unit').set({ name: b.name, active: b.active, row_version: before.row_version + 1 }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'unit', entityId: id, before, after, context: { justification: b.justification } });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  app.post('/org/sectors', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const b = parse(SectorCreate, req.body);
    const row = await db.transaction().execute(async (trx) => {
      if (!(await trx.selectFrom('unit').select('id').where('id', '=', b.unitId).where('institution_id', '=', auth.institutionId).executeTakeFirst())) throw new HttpError(400, 'validacao', 'Unidade inexistente.', [{ path: 'unitId', message: 'Unidade inexistente.' }]);
      if (await trx.selectFrom('sector').select('id').where('institution_id', '=', auth.institutionId).where('code', '=', b.code).executeTakeFirst()) throw duplicate('code', 'Já existe um setor com este código.');
      const created = await trx.insertInto('sector').values({ institution_id: auth.institutionId, unit_id: b.unitId, code: b.code, name: b.name, kind: b.kind }).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'create', entity: 'sector', entityId: created.id, after: created, context: { justification: b.justification } });
      return created;
    });
    reply.code(201);
    return { id: row.id };
  });

  app.put<{ Params: { id: string } }>('/org/sectors/:id', edit, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(SectorUpdate, req.body);
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('sector').selectAll().where('id', '=', id).where('institution_id', '=', auth.institutionId).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Setor');
      if (before.row_version !== b.rowVersion) throw conflict();
      if (!(await trx.selectFrom('unit').select('id').where('id', '=', b.unitId).where('institution_id', '=', auth.institutionId).executeTakeFirst())) throw new HttpError(400, 'validacao', 'Unidade inexistente.', [{ path: 'unitId', message: 'Unidade inexistente.' }]);
      if (!b.active && (await trx.selectFrom('admission_movement').select('id').where('sector_id', '=', id).where('end_at', 'is', null).executeTakeFirst())) {
        throw new HttpError(400, 'validacao', 'Há pacientes internados neste setor. Transfira-os antes de desativá-lo.', [{ path: 'active', message: 'Setor com pacientes internados.' }]);
      }
      const after = await trx.updateTable('sector').set({ unit_id: b.unitId, name: b.name, kind: b.kind, active: b.active, row_version: before.row_version + 1 }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'sector', entityId: id, before, after, context: { justification: b.justification } });
      return { ok: true, rowVersion: after.row_version };
    });
  });

  app.post<{ Params: { id: string } }>('/org/sectors/:id/beds', edit, async (req, reply) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(BedsCreate, req.body);
    const codes = [...new Set(b.codes)];
    await db.transaction().execute(async (trx) => {
      if (!(await trx.selectFrom('sector').select('id').where('id', '=', id).where('institution_id', '=', auth.institutionId).executeTakeFirst())) throw notFound('Setor');
      const existing = await trx.selectFrom('bed').select('code').where('sector_id', '=', id).where('code', 'in', codes).execute();
      if (existing.length) throw duplicate('codes', `Leito(s) já cadastrado(s): ${existing.map((e) => e.code).join(', ')}.`);
      const rows = await trx.insertInto('bed').values(codes.map((code) => ({ sector_id: id, code }))).returningAll().execute();
      await audit(trx, actorOf(req), { action: 'create', entity: 'bed', entityId: id, after: rows, context: { justification: b.justification } });
    });
    reply.code(201);
    return { ok: true, created: codes.length };
  });

  app.put<{ Params: { id: string } }>('/org/beds/:id', edit, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(BedUpdate, req.body);
    return db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('bed').innerJoin('sector', 'sector.id', 'bed.sector_id').selectAll('bed').where('bed.id', '=', id).where('sector.institution_id', '=', auth.institutionId).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Leito');
      if (!b.active && (await trx.selectFrom('admission_movement').select('id').where('bed_id', '=', id).where('end_at', 'is', null).executeTakeFirst())) {
        throw new HttpError(409, 'leito_ocupado', 'O leito está ocupado e não pode ser desativado.', [{ path: 'active', message: 'Leito ocupado.' }]);
      }
      const after = await trx.updateTable('bed').set({ active: b.active }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await audit(trx, actorOf(req), { action: 'update', entity: 'bed', entityId: id, before, after, context: { justification: b.justification } });
      return { ok: true };
    });
  });
}
