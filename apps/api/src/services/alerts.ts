import { sql, type Kysely } from 'kysely';
import {
  IRAS_TYPES, addDays, buildAlertCandidates, dateInZone, rulesFromParameters, surveillanceEnd, todayIn,
  type AlertCandidate,
} from '@ccih/domain';
import type { DB } from '../db/types';
import { loadRequiredTrainings, loadSupplies } from '../routes/training-supplies';

/**
 * Alert generation: candidates from the records → one open alert per deduplication key. A closed
 * alert is not recreated within the configured suppression window; an open alert whose condition no
 * longer exists is closed automatically, so the list reflects current work only.
 */
const lastRun = new Map<string, number>();
export const REFRESH_INTERVAL_MS = 60_000;

export async function collectCandidates(db: Kysely<DB>, institutionId: string, now: Date): Promise<{ candidates: AlertCandidate[]; suppressHours: number | undefined }> {
  const [inst, params] = await Promise.all([
    db.selectFrom('institution').select('timezone').where('id', '=', institutionId).executeTakeFirstOrThrow(),
    db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', institutionId).execute(),
  ]);
  const tz = inst.timezone;
  const today = todayIn(tz, now);
  const rules = rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id })));
  const label = (p: { initials: string; record_number: string }) => `${p.initials} · ${p.record_number}`;

  const [cases, devices, mdr, required, supplies, actions, surgeries] = await Promise.all([
    db.selectFrom('iras_case as c').innerJoin('admission as a', 'a.id', 'c.admission_id').innerJoin('patient as p', 'p.id', 'a.patient_id')
      .select(['c.id', 'c.iras_type', 'c.created_at', 'c.sector_id', 'p.initials', 'p.record_number'])
      .where('c.institution_id', '=', institutionId).where('c.status', 'in', ['suspeita', 'em_investigacao']).execute(),
    db.selectFrom('device_use as d').innerJoin('admission as a', 'a.id', 'd.admission_id').innerJoin('patient as p', 'p.id', 'a.patient_id')
      .leftJoin('admission_movement as m', (j) => j.onRef('m.admission_id', '=', 'a.id').on('m.end_at', 'is', null))
      .select(['d.id', 'd.device_type', 'd.inserted_at', 'm.sector_id', 'p.id as patient_id', 'p.initials', 'p.record_number'])
      .where('d.institution_id', '=', institutionId).where('d.removed_at', 'is', null).where('a.discharged_at', 'is', null).execute(),
    db.selectFrom('isolate as i').innerJoin('culture_result as r', 'r.id', 'i.result_id').innerJoin('culture as c', 'c.id', 'r.culture_id')
      .innerJoin('admission as a', 'a.id', 'c.admission_id').innerJoin('patient as p', 'p.id', 'a.patient_id')
      .select(['i.id', 'i.organism', 'c.id as culture_id', 'c.sector_id', 'c.collected_at', 'p.initials', 'p.record_number'])
      .where('c.institution_id', '=', institutionId).where('i.resistance_profile', 'is not', null)
      .where('c.collected_at', '>=', new Date(now.getTime() - 7 * 86_400_000))
      .where('r.version', '=', (eb) => eb.selectFrom('culture_result as x').select((e) => e.fn.max('x.version').as('v')).whereRef('x.culture_id', '=', 'r.culture_id'))
      .execute(),
    loadRequiredTrainings(db, institutionId, today, rules.training.expiryWarningDays?.value),
    loadSupplies(db, institutionId, today, tz, { defaultMinCoverageDays: rules.supplies.defaultMinCoverageDays?.value, expiryWarningDays: rules.supplies.expiryWarningDays?.value }),
    db.selectFrom('action_plan as x').innerJoin('nonconformity as n', 'n.id', 'x.nonconformity_id')
      .select(['x.id', 'x.what', 'x.due_on', 'n.id as nc_id', 'n.sector_id'])
      .where('n.institution_id', '=', institutionId).where('x.status', 'in', ['pendente', 'em_andamento']).where('n.status', 'not in', ['encerrada', 'cancelada']).where('x.due_on', '<', today).execute(),
    db.selectFrom('surgery as s').innerJoin('admission as a', 'a.id', 's.admission_id').innerJoin('patient as p', 'p.id', 'a.patient_id').innerJoin('procedure_catalog as pc', 'pc.id', 's.procedure_id')
      .select(['s.id', 's.started_at', 's.implant', 'pc.name', 'p.initials', 'p.record_number'])
      .where('s.institution_id', '=', institutionId).where('a.discharged_at', 'is not', null)
      .where('s.started_at', '>=', new Date(now.getTime() - 800 * 86_400_000))
      .where(({ not, exists, selectFrom }) => not(exists(selectFrom('ssi_followup as f').select('f.id').whereRef('f.surgery_id', '=', 's.id'))))
      .execute(),
  ]);

  const gaps = new Map<string, { trainingId: string; trainingTitle: string; sectorId: string; overdue: number }>();
  for (const r of required.rows) {
    if (!r.sectorId || (r.state !== 'vencido' && r.state !== 'pendente')) continue;
    const k = `${r.trainingId}|${r.sectorId}`;
    const g = gaps.get(k) ?? { trainingId: r.trainingId, trainingTitle: required.trainings.find((t) => t.id === r.trainingId)?.title ?? 'Treinamento', sectorId: r.sectorId, overdue: 0 };
    g.overdue++;
    gaps.set(k, g);
  }
  const surveillanceRule = { days: rules.surgery.surveillanceDays?.value, daysWithImplant: rules.surgery.surveillanceDaysWithImplant?.value };
  const pendingFollowups = surgeries.flatMap((s) => {
    const end = surveillanceEnd(dateInZone(s.started_at, tz), s.implant, surveillanceRule);
    return end && end.end >= today && end.end <= addDays(today, 7) ? [{ surgeryId: s.id, procedure: s.name, patientLabel: label(s), windowEnd: end.end }] : [];
  });

  const candidates = buildAlertCandidates({
    today,
    rules: { investigationOverdueDays: rules.alerts.investigationOverdueDays?.value, deviceReviewDays: rules.alerts.deviceReviewDays?.value },
    openCases: cases.map((c) => ({ id: c.id, typeLabel: IRAS_TYPES[c.iras_type].sigla, patientLabel: label(c), openedOn: dateInZone(c.created_at, tz), sectorId: c.sector_id })),
    openDevices: devices.map((d) => ({ id: d.id, type: d.device_type, patientId: d.patient_id, patientLabel: label(d), insertedOn: dateInZone(d.inserted_at, tz), sectorId: d.sector_id })),
    newMdr: mdr.map((m) => ({ isolateId: m.id, cultureId: m.culture_id, organism: m.organism, patientLabel: label(m), sectorId: m.sector_id, collectedOn: dateInZone(m.collected_at, tz) })),
    trainingGaps: [...gaps.values()],
    supplies: supplies.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, evaluation: s.evaluation })),
    overdueActions: actions.map((a) => ({ id: a.id, ncId: a.nc_id, what: a.what, dueOn: a.due_on, sectorId: a.sector_id })),
    pendingFollowups,
  });
  return { candidates, suppressHours: rules.alerts.suppressHours?.value };
}

const inflight = new Map<string, Promise<{ created: number; resolved: number }>>();

/**
 * Throttled refresh. Concurrent callers wait for the run in progress, so a list requested at the
 * same time as the counter never reads the table before the alerts are generated.
 */
export async function refreshAlerts(db: Kysely<DB>, institutionId: string, now = new Date(), force = false): Promise<{ created: number; resolved: number } | null> {
  const running = inflight.get(institutionId);
  if (running) return running;
  if (!force && now.getTime() - (lastRun.get(institutionId) ?? 0) < REFRESH_INTERVAL_MS) return null;
  lastRun.set(institutionId, now.getTime());
  const run = generate(db, institutionId, now).finally(() => inflight.delete(institutionId));
  inflight.set(institutionId, run);
  return run;
}

async function generate(db: Kysely<DB>, institutionId: string, now: Date): Promise<{ created: number; resolved: number }> {
  const { candidates, suppressHours } = await collectCandidates(db, institutionId, now);
  return db.transaction().execute(async (trx) => {
    // Serializes concurrent refreshes of the same institution.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`alerts:${institutionId}`}))`.execute(trx);
    const open = await trx.selectFrom('alert').select(['id', 'dedup_key']).where('institution_id', '=', institutionId).where('status', '<>', 'encerrado').execute();
    const openKeys = new Map(open.map((a) => [a.dedup_key, a.id]));
    const since = new Date(now.getTime() - (suppressHours ?? 0) * 3_600_000);
    const suppressed = new Set(
      suppressHours
        ? (await trx.selectFrom('alert').select('dedup_key').where('institution_id', '=', institutionId).where('status', '=', 'encerrado').where('closed_at', '>=', since).execute()).map((a) => a.dedup_key)
        : [],
    );
    let created = 0;
    const seen = new Set<string>();
    for (const c of candidates) {
      seen.add(c.dedupKey);
      const id = openKeys.get(c.dedupKey);
      if (id) {
        await trx.updateTable('alert').set({ last_seen_at: now, title: c.title, detail: c.detail, priority: c.priority }).where('id', '=', id).execute();
      } else if (!suppressed.has(c.dedupKey)) {
        await trx.insertInto('alert').values({ institution_id: institutionId, kind: c.kind, dedup_key: c.dedupKey, priority: c.priority, status: 'aberto', title: c.title, detail: c.detail, entity: c.entity, entity_id: c.entityId, sector_id: c.sectorId, link: c.link, last_seen_at: now }).execute();
        created++;
      }
    }
    const gone = open.filter((a) => !seen.has(a.dedup_key)).map((a) => a.id);
    if (gone.length) {
      await trx.updateTable('alert').set({ status: 'encerrado', closed_at: now, closed_by_name: 'Sistema', resolution: 'Condição resolvida no registro de origem.', row_version: (eb) => eb('row_version', '+', 1) }).where('id', 'in', gone).execute();
    }
    return { created, resolved: gone.length };
  });
}

/** Tests and the refresh endpoint reset the throttle. */
export const resetAlertThrottle = (institutionId: string) => lastRun.delete(institutionId);
