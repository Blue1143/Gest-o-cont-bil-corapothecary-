import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { PERMISSIONS, ROLE_LABEL } from '@ccih/domain';
import type { DB } from '../db/types';
import { audit, verifyAuditChain } from '../audit/audit';
import { actorOf, requireAuth, requirePermission } from '../http/auth';
import { HttpError, conflict, notFound, parse } from '../http/errors';

const AuditQuery = z
  .object({
    entity: z.string().max(60).optional(),
    action: z.string().max(40).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .strict();

const UserPatch = z
  .object({
    roles: z.array(z.string().max(40)).min(1).max(7),
    scopeAll: z.boolean(),
    sectorIds: z.array(z.string().uuid()).max(200),
    active: z.boolean(),
    rowVersion: z.number().int().min(1),
    justification: z.string().trim().min(10, 'Descreva o motivo (mínimo 10 caracteres).').max(500),
  })
  .strict();

export async function adminRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  /* ---------- Audit log ---------- */
  app.get('/audit', { preHandler: requirePermission(db, 'audit:view') }, async (req) => {
    const auth = requireAuth(req);
    const q = parse(AuditQuery, req.query);
    let base = db.selectFrom('audit_log').where('institution_id', '=', auth.institutionId);
    if (q.entity) base = base.where('entity', '=', q.entity);
    if (q.action) base = base.where('action', '=', q.action);
    const [rows, total] = await Promise.all([
      base.select(['id', 'occurred_at', 'user_login', 'action', 'entity', 'entity_id', 'before', 'after', 'ip', 'context']).orderBy('id', 'desc').limit(q.pageSize).offset((q.page - 1) * q.pageSize).execute(),
      base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
    ]);
    return { rows: rows.map((r) => ({ ...r, occurred_at: r.occurred_at.toISOString() })), total: Number(total.n), page: q.page, pageSize: q.pageSize };
  });

  app.get('/audit/verify', { preHandler: requirePermission(db, 'audit:view') }, async (req) => {
    const result = await verifyAuditChain(db);
    await audit(db, actorOf(req), { action: 'validate', entity: 'audit_log', entityId: null, context: { ok: result.ok, checked: result.checked } });
    return result;
  });

  /* ---------- Users and profiles ---------- */
  app.get('/roles', { preHandler: requirePermission(db, 'users:view') }, async (req) => {
    const auth = requireAuth(req);
    const roles = await db.selectFrom('role').select(['code', 'name', 'permissions']).where('institution_id', '=', auth.institutionId).orderBy('name').execute();
    return { roles, permissions: PERMISSIONS };
  });

  app.get('/users', { preHandler: requirePermission(db, 'users:view') }, async (req) => {
    const auth = requireAuth(req);
    const [users, roles, scopes] = await Promise.all([
      db.selectFrom('app_user').select(['id', 'login', 'display_name', 'active', 'scope_all', 'locked_until', 'last_login_at', 'row_version']).where('institution_id', '=', auth.institutionId).orderBy('login').execute(),
      db.selectFrom('user_role').select(['user_id', 'role_code']).where('institution_id', '=', auth.institutionId).execute(),
      db.selectFrom('user_scope').innerJoin('app_user', 'app_user.id', 'user_scope.user_id').select(['user_scope.user_id', 'user_scope.sector_id']).where('app_user.institution_id', '=', auth.institutionId).execute(),
    ]);
    return {
      users: users.map((u) => ({
        id: u.id, login: u.login, displayName: u.display_name, active: u.active, scopeAll: u.scope_all,
        lockedUntil: u.locked_until && u.locked_until.getTime() > Date.now() ? u.locked_until.toISOString() : null,
        lastLoginAt: u.last_login_at?.toISOString() ?? null, rowVersion: u.row_version,
        roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role_code),
        sectorIds: scopes.filter((s) => s.user_id === u.id).map((s) => s.sector_id),
      })),
      roleLabels: ROLE_LABEL,
    };
  });

  app.patch<{ Params: { id: string } }>('/users/:id', { preHandler: requirePermission(db, 'users:manage') }, async (req) => {
    const auth = requireAuth(req);
    const id = parse(z.string().uuid(), req.params.id);
    const b = parse(UserPatch, req.body);
    if (id === auth.userId && (!b.active || (!b.roles.includes('admin') && auth.roles.includes('admin')))) {
      throw new HttpError(400, 'auto_bloqueio', 'Você não pode remover o próprio acesso de administrador nem desativar a própria conta.');
    }
    return db.transaction().execute(async (trx) => {
      const user = await trx.selectFrom('app_user').select(['id', 'active', 'scope_all', 'row_version']).where('id', '=', id).where('institution_id', '=', auth.institutionId).forUpdate().executeTakeFirst();
      if (!user) throw notFound('Usuário');
      if (user.row_version !== b.rowVersion) throw conflict();
      const validRoles = await trx.selectFrom('role').select('code').where('institution_id', '=', auth.institutionId).where('code', 'in', b.roles).execute();
      if (validRoles.length !== new Set(b.roles).size) throw new HttpError(400, 'validacao', 'Perfil inexistente.', [{ path: 'roles', message: 'Perfil inexistente.' }]);
      const sectorIds = b.scopeAll ? [] : [...new Set(b.sectorIds)];
      if (!b.scopeAll && !sectorIds.length) throw new HttpError(400, 'validacao', 'Informe ao menos um setor ou acesso a todos.', [{ path: 'sectorIds', message: 'Selecione ao menos um setor.' }]);
      if (sectorIds.length) {
        const valid = await trx.selectFrom('sector').select('id').where('institution_id', '=', auth.institutionId).where('id', 'in', sectorIds).execute();
        if (valid.length !== sectorIds.length) throw new HttpError(400, 'validacao', 'Setor inexistente.', [{ path: 'sectorIds', message: 'Setor inexistente.' }]);
      }
      const before = {
        active: user.active, scopeAll: user.scope_all,
        roles: (await trx.selectFrom('user_role').select('role_code').where('user_id', '=', id).execute()).map((r) => r.role_code).sort(),
        sectorIds: (await trx.selectFrom('user_scope').select('sector_id').where('user_id', '=', id).execute()).map((r) => r.sector_id).sort(),
      };
      await trx.updateTable('app_user').set({ active: b.active, scope_all: b.scopeAll, row_version: user.row_version + 1 }).where('id', '=', id).execute();
      await trx.deleteFrom('user_role').where('user_id', '=', id).execute();
      await trx.insertInto('user_role').values([...new Set(b.roles)].map((code) => ({ user_id: id, institution_id: auth.institutionId, role_code: code }))).execute();
      await trx.deleteFrom('user_scope').where('user_id', '=', id).execute();
      if (sectorIds.length) await trx.insertInto('user_scope').values(sectorIds.map((sector_id) => ({ user_id: id, sector_id }))).execute();
      // Permission changes take effect immediately: end the user's open sessions.
      await trx.updateTable('session').set({ revoked_at: new Date(), revoked_reason: 'permissoes_alteradas' }).where('user_id', '=', id).where('revoked_at', 'is', null).where('id', '!=', auth.sessionId).execute();
      const after = { active: b.active, scopeAll: b.scopeAll, roles: [...new Set(b.roles)].sort(), sectorIds: [...sectorIds].sort() };
      await audit(trx, actorOf(req), { action: 'update', entity: 'app_user_access', entityId: id, before, after, context: { justification: b.justification } });
      return { ok: true, rowVersion: user.row_version + 1 };
    });
  });

  app.post<{ Params: { id: string } }>('/users/:id/unlock', { preHandler: requirePermission(db, 'users:manage') }, async (req) => {
    const auth = requireAuth(req);
    const id = parse(z.string().uuid(), req.params.id);
    const updated = await db.updateTable('app_user').set({ locked_until: null, failed_attempts: 0 }).where('id', '=', id).where('institution_id', '=', auth.institutionId).returning('id').executeTakeFirst();
    if (!updated) throw notFound('Usuário');
    await audit(db, actorOf(req), { action: 'unlock', entity: 'app_user', entityId: id });
    return { ok: true };
  });
}
