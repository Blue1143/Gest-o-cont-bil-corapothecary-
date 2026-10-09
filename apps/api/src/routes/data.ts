import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DB } from '../db/types';
import { audit } from '../audit/audit';
import { actorOf, requireAuth, requirePermission } from '../http/auth';
import { HttpError, parse } from '../http/errors';
import { loadFacts, loadInstitutionData } from '../repositories/institution';
import { consolidateMonths } from '../repositories/consolidation';
import { addMonths, monthStart, todayIn } from '@ccih/domain';

const MonthStart = z.string().regex(/^\d{4}-\d{2}-01$/, 'Use o primeiro dia do mês (AAAA-MM-01).');
const FactsQuery = z.object({ from: MonthStart, to: MonthStart }).strict().refine((q) => q.from <= q.to, { message: 'Período inicial depois do final.', path: ['from'] });

const ConsolidateBody = z.object({ months: z.array(MonthStart).min(1).max(12) }).strict();

const ExportEvent = z
  .object({
    resource: z.string().min(1).max(120),
    rows: z.number().int().min(0).max(1_000_000),
    filters: z.record(z.string().max(60), z.string().max(200)).optional(),
  })
  .strict();

export async function dataRoutes(app: FastifyInstance, { db }: { db: Kysely<DB> }) {
  app.get('/institution', async (req) => {
    const auth = requireAuth(req);
    return loadInstitutionData(db, auth.institutionId, auth.scope);
  });

  app.get('/facts', { preHandler: requirePermission(db, 'dashboard:view', 'indicators:view') }, async (req) => {
    const auth = requireAuth(req);
    const q = parse(FactsQuery, req.query);
    const { rows, provenance } = await loadFacts(db, auth.institutionId, auth.scope, q.from, q.to);
    return { data: { rows }, provenance };
  });

  /** Recomputes the clinical metrics of the chosen months from the records (audited). */
  app.post('/facts/consolidate', { preHandler: requirePermission(db, 'indicators:consolidate') }, async (req) => {
    const auth = requireAuth(req);
    const { months } = parse(ConsolidateBody, req.body);
    const inst = await db.selectFrom('institution').select('timezone').where('id', '=', auth.institutionId).executeTakeFirstOrThrow();
    const current = monthStart(todayIn(inst.timezone));
    if (months.some((m) => m > current)) throw new HttpError(400, 'validacao', 'Não é possível consolidar meses futuros.', [{ path: 'months', message: 'Mês futuro.' }]);
    if (months.some((m) => m < addMonths(current, -36))) throw new HttpError(400, 'validacao', 'Consolide no máximo os últimos 36 meses.', [{ path: 'months', message: 'Mês muito antigo.' }]);
    const summary = await db.transaction().execute(async (trx) => {
      const r = await consolidateMonths(trx, auth.institutionId, months);
      await audit(trx, actorOf(req), { action: 'consolidate', entity: 'indicator_fact', entityId: months.join(','), context: { rows: r.rows, metrics: r.metrics, skipped: r.skipped, partial: months.includes(current) } });
      return r;
    });
    return { ...summary, partialMonth: months.includes(current) };
  });

  /** Aggregated exports are generated in the browser; the server records who exported what. */
  app.post('/audit/events/export', { preHandler: requirePermission(db, 'export:aggregate') }, async (req) => {
    const body = parse(ExportEvent, req.body);
    await audit(db, actorOf(req), { action: 'export', entity: 'aggregate', entityId: body.resource, context: { rows: body.rows, filters: body.filters ?? {}, identified: false } });
    return { ok: true };
  });
}
