import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { ALERT_KIND_PERMISSION, type AlertDto, type AlertKind, type AlertSummary } from '@ccih/domain';
import type { DB } from '../db/types';
import { audit } from '../audit/audit';
import { actorOf, requireAuth, requirePermission, type AuthContext } from '../http/auth';
import { HttpError, conflict, notFound, parse } from '../http/errors';
import { Justification, PageQuery, RowVersion, Uuid } from '../http/schemas';
import { refreshAlerts, resetAlertThrottle } from '../services/alerts';

const ListQuery = z.object({ status: z.enum(['abertos', 'aberto', 'assumido', 'encerrado', 'todos']).default('abertos'), priority: z.enum(['alta', 'media', 'baixa']).optional(), kind: z.string().max(60).optional(), mine: z.enum(['1']).optional(), ...PageQuery }).strict();
const CloseBody = z.object({ resolution: Justification, rowVersion: RowVersion }).strict();
const AssumeBody = z.object({ rowVersion: RowVersion }).strict();

/** Alert kinds the user may see (each kind follows the permission of its module). */
const visibleKinds = (auth: AuthContext) => (Object.keys(ALERT_KIND_PERMISSION) as AlertKind[]).filter((k) => auth.permissions.includes(ALERT_KIND_PERMISSION[k]));

export async function alertRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  const view = { preHandler: requirePermission(db, 'alerts:view') };
  const manage = { preHandler: requirePermission(db, 'alerts:manage') };

  const base = (auth: AuthContext) => {
    const kinds = visibleKinds(auth);
    let q = db.selectFrom('alert').where('institution_id', '=', auth.institutionId).where('kind', 'in', kinds.length ? kinds : ['-']);
    if (auth.scope) {
      const scope = auth.scope.length ? auth.scope : ['00000000-0000-0000-0000-000000000000'];
      q = q.where((eb) => eb.or([eb('sector_id', 'is', null), eb('sector_id', 'in', scope)]));
    }
    return q;
  };

  const findAlert = async (auth: AuthContext, id: string) => {
    const row = await base(auth).selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Alerta');
    return row;
  };

  app.get('/alerts', view, async (req) => {
    const auth = requireAuth(req);
    const q = parse(ListQuery, req.query);
    await refreshAlerts(db, auth.institutionId);
    let list = base(auth);
    if (q.status === 'abertos') list = list.where('status', '<>', 'encerrado');
    else if (q.status !== 'todos') list = list.where('status', '=', q.status);
    if (q.priority) list = list.where('priority', '=', q.priority);
    if (q.kind) list = list.where('kind', '=', q.kind);
    if (q.mine) list = list.where('assigned_to', '=', auth.userId);
    const [rows, total] = await Promise.all([
      // Closed alerts are history: most recently closed first. Open work is ordered by priority.
      (q.status === 'encerrado'
        ? list.selectAll().orderBy('closed_at', 'desc')
        : list.selectAll().orderBy((eb) => eb.case().when('priority', '=', 'alta').then(0).when('priority', '=', 'media').then(1).else(2).end()))
        .orderBy('created_at', 'desc').limit(q.pageSize).offset((q.page - 1) * q.pageSize).execute(),
      list.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
    ]);
    return {
      rows: rows.map((a): AlertDto => ({
        id: a.id, kind: a.kind as AlertKind, priority: a.priority, status: a.status, title: a.title, detail: a.detail, entity: a.entity, entityId: a.entity_id, sectorId: a.sector_id,
        createdAt: a.created_at.toISOString(), lastSeenAt: a.last_seen_at.toISOString(), assignedName: a.assigned_name, assignedAt: a.assigned_at?.toISOString() ?? null,
        closedAt: a.closed_at?.toISOString() ?? null, closedByName: a.closed_by_name, resolution: a.resolution, rowVersion: a.row_version, link: a.link,
      })),
      total: Number(total.n), page: q.page, pageSize: q.pageSize,
    };
  });

  app.get('/alerts/summary', view, async (req): Promise<AlertSummary> => {
    const auth = requireAuth(req);
    await refreshAlerts(db, auth.institutionId);
    const rows = await base(auth).where('status', '<>', 'encerrado').select((eb) => ['priority', eb.fn.countAll<string>().as('n'), eb.fn.count<string>(eb.case().when('assigned_to', '=', auth.userId).then(1).end()).as('mine')]).groupBy('priority').execute();
    const byPriority = { alta: 0, media: 0, baixa: 0 };
    let mine = 0;
    for (const r of rows) { byPriority[r.priority] = Number(r.n); mine += Number(r.mine); }
    return { open: byPriority.alta + byPriority.media + byPriority.baixa, byPriority, assignedToMe: mine };
  });

  app.post('/alerts/refresh', manage, async (req) => {
    const auth = requireAuth(req);
    resetAlertThrottle(auth.institutionId);
    const r = await refreshAlerts(db, auth.institutionId, new Date(), true);
    await audit(db, actorOf(req), { action: 'update', entity: 'alert', entityId: null, context: { kind: 'atualizacao_manual', ...(r ?? {}) } });
    return { ok: true, ...(r ?? { created: 0, resolved: 0 }) };
  });

  app.post<{ Params: { id: string } }>('/alerts/:id/assume', manage, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(AssumeBody, req.body);
    const before = await findAlert(auth, id);
    if (before.row_version !== b.rowVersion) throw conflict();
    if (before.status === 'encerrado') throw new HttpError(409, 'alerta_encerrado', 'O alerta já foi encerrado.');
    const after = await db.updateTable('alert').set({ status: 'assumido', assigned_to: auth.userId, assigned_name: auth.displayName, assigned_at: new Date(), row_version: before.row_version + 1 }).where('id', '=', id).where('row_version', '=', b.rowVersion).returningAll().executeTakeFirst();
    if (!after) throw conflict();
    await audit(db, actorOf(req), { action: 'update', entity: 'alert', entityId: id, before: { status: before.status, assigned: before.assigned_name }, after: { status: after.status, assigned: after.assigned_name } });
    return { ok: true, rowVersion: after.row_version };
  });

  /** Closing requires a resolution (what was done); the same condition stays suppressed for the configured period. */
  app.post<{ Params: { id: string } }>('/alerts/:id/close', manage, async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const b = parse(CloseBody, req.body);
    const before = await findAlert(auth, id);
    if (before.row_version !== b.rowVersion) throw conflict();
    if (before.status === 'encerrado') throw new HttpError(409, 'alerta_encerrado', 'O alerta já foi encerrado.');
    const after = await db.updateTable('alert').set({ status: 'encerrado', closed_at: new Date(), closed_by_name: auth.displayName, resolution: b.resolution, row_version: before.row_version + 1 }).where('id', '=', id).where('row_version', '=', b.rowVersion).returningAll().executeTakeFirst();
    if (!after) throw conflict();
    await audit(db, actorOf(req), { action: 'update', entity: 'alert', entityId: id, before: { status: before.status }, after: { status: 'encerrado' }, context: { justification: b.resolution, kind: before.kind } });
    return { ok: true };
  });
}
