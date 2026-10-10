import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { UserNotificationDto } from '@ccih/domain';
import type { DB } from '../db/types';
import { requireAuth } from '../http/auth';
import { HttpError, parse } from '../http/errors';
import { Uuid } from '../http/schemas';

const ListQuery = z.object({ situacao: z.enum(['nao_lidas', 'todas']).default('nao_lidas'), limit: z.coerce.number().int().min(1).max(200).default(50) }).strict();

/** The signed-in user's own notifications: nobody else's are ever listed or changed. */
export async function notificationRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  app.get('/me/notifications', async (req): Promise<{ rows: UserNotificationDto[]; unread: number }> => {
    const auth = requireAuth(req);
    const q = parse(ListQuery, req.query);
    let rows = db.selectFrom('user_notification').selectAll().where('user_id', '=', auth.userId).where('institution_id', '=', auth.institutionId);
    if (q.situacao === 'nao_lidas') rows = rows.where('read_at', 'is', null);
    const [list, count] = await Promise.all([
      rows.orderBy('created_at', 'desc').limit(q.limit).execute(),
      db.selectFrom('user_notification').select((eb) => eb.fn.countAll<string>().as('n')).where('user_id', '=', auth.userId).where('institution_id', '=', auth.institutionId).where('read_at', 'is', null).executeTakeFirstOrThrow(),
    ]);
    return {
      unread: Number(count.n),
      rows: list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, detail: n.detail, entity: n.entity, entityId: n.entity_id, link: n.link, createdAt: n.created_at.toISOString(), readAt: n.read_at?.toISOString() ?? null, dataOrigin: n.data_origin })),
    };
  });

  app.post<{ Params: { id: string } }>('/me/notifications/:id/read', async (req) => {
    const auth = requireAuth(req);
    const id = parse(Uuid, req.params.id);
    const found = await db.selectFrom('user_notification').select(['id', 'read_at']).where('id', '=', id).where('user_id', '=', auth.userId).executeTakeFirst();
    if (!found) throw new HttpError(404, 'nao_encontrado', 'Notificação não encontrada.');
    if (!found.read_at) await db.updateTable('user_notification').set({ read_at: new Date() }).where('id', '=', id).where('read_at', 'is', null).execute();
    return { ok: true };
  });

  app.post('/me/notifications/read-all', async (req) => {
    const auth = requireAuth(req);
    await db.updateTable('user_notification').set({ read_at: new Date() }).where('user_id', '=', auth.userId).where('read_at', 'is', null).execute();
    return { ok: true };
  });
}
