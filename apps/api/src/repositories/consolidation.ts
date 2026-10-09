import type { Kysely, Transaction } from 'kysely';
import {
  addDays, addMonths, consolidateClinicalFacts, consolidateOperationalFacts, dateInZone, rulesFromParameters, zonedInstant, OPERATIONAL_METRICS,
  type CensusAdmission, type ConsolidationCase, type InvestigationStatus, type MetricKey,
} from '@ccih/domain';
import type { DB } from '../db/types';

type Db = Kysely<DB> | Transaction<DB>;

/** Admissions (with stays and devices) that overlap [from, to). */
export async function loadCensusAdmissions(db: Db, institutionId: string, from: Date, to: Date, sectorScope?: string[]): Promise<CensusAdmission[]> {
  let q = db
    .selectFrom('admission')
    .select('id')
    .where('institution_id', '=', institutionId)
    .where('admitted_at', '<', to)
    .where((eb) => eb.or([eb('discharged_at', 'is', null), eb('discharged_at', '>', from)]));
  if (sectorScope) q = q.where('id', 'in', db.selectFrom('admission_movement').select('admission_id').where('sector_id', 'in', sectorScope.length ? sectorScope : ['00000000-0000-0000-0000-000000000000']));
  const ids = (await q.execute()).map((r) => r.id);
  if (!ids.length) return [];
  const byId = new Map<string, CensusAdmission>(ids.map((id) => [id, { id, stays: [], devices: [] }]));
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const [moves, devices] = await Promise.all([
      db.selectFrom('admission_movement').select(['admission_id', 'sector_id', 'start_at', 'end_at']).where('admission_id', 'in', chunk).execute(),
      db.selectFrom('device_use').select(['admission_id', 'device_type', 'inserted_at', 'removed_at']).where('admission_id', 'in', chunk).execute(),
    ]);
    for (const m of moves) byId.get(m.admission_id)!.stays.push({ sectorId: m.sector_id, start: m.start_at.toISOString(), end: m.end_at?.toISOString() ?? null });
    for (const d of devices) byId.get(d.admission_id)!.devices.push({ type: d.device_type, insertedAt: d.inserted_at.toISOString(), removedAt: d.removed_at?.toISOString() ?? null });
  }
  return [...byId.values()];
}

export interface ConsolidationSummary {
  months: string[];
  rows: number;
  metrics: MetricKey[];
  skipped: string[];
  origin: 'real' | 'demo';
}

/**
 * Recomputes the clinical metrics of `months` from the records and replaces them in indicator_fact
 * (other metrics are untouched). Runs inside the caller's transaction when one is given.
 */
export async function consolidateMonths(db: Db, institutionId: string, months: string[], now = new Date()): Promise<ConsolidationSummary> {
  const sorted = [...new Set(months)].sort();
  const inst = await db.selectFrom('institution').select(['timezone', 'data_origin']).where('id', '=', institutionId).executeTakeFirstOrThrow();
  const tz = inst.timezone;
  const firstDay = sorted[0]!;
  const afterLast = addMonths(sorted.at(-1)!, 1);
  const from = zonedInstant(firstDay, 0, tz);
  const to = zonedInstant(afterLast, 0, tz);
  const lookback = addDays(firstDay, -365);

  const params = await db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', institutionId).execute();
  const rules = rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id })));
  const admissions = await loadCensusAdmissions(db, institutionId, from, to);

  const caseRows = await db
    .selectFrom('iras_case')
    .select(['id', 'iras_type', 'event_date', 'sector_id', 'status', 'device_associated', 'surgery_id'])
    .where('institution_id', '=', institutionId)
    .where('event_date', '>=', lookback)
    .where('event_date', '<', afterLast)
    .execute();
  const history = caseRows.length
    ? await db.selectFrom('iras_case_status').select(['case_id', 'to_status', 'at']).where('case_id', 'in', caseRows.map((c) => c.id)).execute()
    : [];
  const cases: ConsolidationCase[] = caseRows.map((c) => ({
    type: c.iras_type, eventDate: c.event_date, sectorId: c.sector_id, status: c.status, deviceAssociated: c.device_associated, surgeryId: c.surgery_id,
    history: history.filter((h) => h.case_id === c.id).map((h) => ({ to: h.to_status as InvestigationStatus, at: h.at.toISOString() })),
  }));

  const surgeries = await db
    .selectFrom('surgery')
    .select(['id', 'started_at', 'sector_id', 'wound_class', 'prophylaxis_indicated', 'prophylaxis_drug', 'prophylaxis_dose_at', 'prophylaxis_duration_h'])
    .where('institution_id', '=', institutionId)
    .where('started_at', '>=', zonedInstant(lookback, 0, tz))
    .where('started_at', '<', to)
    .execute();

  // Current (latest) version of each result; isolates classified as resistant.
  const mdr = await db
    .selectFrom('isolate')
    .innerJoin('culture_result as cr', 'cr.id', 'isolate.result_id')
    .innerJoin('culture', 'culture.id', 'cr.culture_id')
    .select(['culture.admission_id', 'culture.sector_id', 'culture.collected_at', 'isolate.organism'])
    .where('culture.institution_id', '=', institutionId)
    .where('isolate.resistance_profile', 'is not', null)
    .where('culture.collected_at', '>=', zonedInstant(lookback, 0, tz))
    .where('culture.collected_at', '<', to)
    .where('cr.version', '=', (eb) => eb.selectFrom('culture_result as latest').select((e) => e.fn.max('latest.version').as('v')).whereRef('latest.culture_id', '=', 'cr.culture_id'))
    .execute();

  const result = consolidateClinicalFacts({
    timezone: tz,
    rules,
    months: sorted,
    admissions,
    cases,
    surgeries: surgeries.map((s) => ({
      id: s.id, date: dateInZone(s.started_at, tz), sectorId: s.sector_id, woundClass: s.wound_class, prophylaxisIndicated: s.prophylaxis_indicated,
      drug: s.prophylaxis_drug, minutesBeforeIncision: s.prophylaxis_dose_at ? Math.round((s.started_at.getTime() - s.prophylaxis_dose_at.getTime()) / 60_000) : null,
      durationHours: s.prophylaxis_duration_h == null ? null : Number(s.prophylaxis_duration_h),
    })),
    mdrIsolates: mdr.map((m) => ({ admissionId: m.admission_id, organism: m.organism, collectedOn: dateInZone(m.collected_at, tz), sectorId: m.sector_id })),
  });

  const operational = await loadOperationalFacts(db, institutionId, sorted, from, to, tz, rules.training.expiryWarningDays?.value);
  const metrics = [...result.metrics, ...OPERATIONAL_METRICS];
  const values = [...result.rows, ...operational].flatMap((row) =>
    Object.entries(row.counts)
      .filter(([metric]) => metrics.includes(metric as MetricKey))
      .map(([metric, value]) => ({ institution_id: institutionId, period: row.period, sector_id: row.sectorId, metric, value: value!, data_origin: inst.data_origin, consolidated_at: now })),
  );
  await db.deleteFrom('indicator_fact').where('institution_id', '=', institutionId).where('period', 'in', sorted).where('metric', 'in', metrics).execute();
  for (let i = 0; i < values.length; i += 1000) await db.insertInto('indicator_fact').values(values.slice(i, i + 1000)).execute();
  return { months: sorted, rows: values.length, metrics, skipped: result.skipped, origin: inst.data_origin };
}

/** Bundles, hand hygiene, alcohol consumption and training coverage (voided records excluded). */
async function loadOperationalFacts(db: Db, institutionId: string, months: string[], from: Date, to: Date, tz: string, warningDays: number | undefined) {
  const [audits, hh, alcohol, professionals, trainings, attendance] = await Promise.all([
    db.selectFrom('bundle_audit').innerJoin('bundle_template as t', 't.id', 'bundle_audit.template_id')
      .select(['bundle_audit.audited_at', 'bundle_audit.sector_id', 'bundle_audit.result', 't.metric'])
      .where('bundle_audit.institution_id', '=', institutionId).where('bundle_audit.voided_at', 'is', null)
      .where('bundle_audit.audited_at', '>=', from).where('bundle_audit.audited_at', '<', to).execute(),
    db.selectFrom('hand_hygiene_observation').select(['observed_at', 'sector_id', 'opportunities', 'actions'])
      .where('institution_id', '=', institutionId).where('voided_at', 'is', null).where('observed_at', '>=', from).where('observed_at', '<', to).execute(),
    db.selectFrom('supply_movement as m').innerJoin('supply_lot as l', 'l.id', 'm.lot_id').innerJoin('supply as s', 's.id', 'l.supply_id')
      .select(['m.occurred_at', 'm.sector_id', 'm.delta'])
      .where('s.institution_id', '=', institutionId).where('s.category', '=', 'preparacao_alcoolica').where('s.unit', '=', 'mL').where('m.kind', '=', 'consumo')
      .where('m.occurred_at', '>=', from).where('m.occurred_at', '<', to).execute(),
    db.selectFrom('professional').select(['id', 'sector_id', 'job_role_id', 'active']).where('institution_id', '=', institutionId).execute(),
    db.selectFrom('training').select(['id', 'mandatory', 'validity_months', 'target_job_role_ids']).where('institution_id', '=', institutionId).where('active', '=', true).execute(),
    db.selectFrom('training_attendance as a').innerJoin('training_session as s', 's.id', 'a.session_id').innerJoin('training as t', 't.id', 's.training_id')
      .select(['s.training_id', 'a.professional_id', 's.held_on', 'a.present']).where('t.institution_id', '=', institutionId).execute(),
  ]);
  return consolidateOperationalFacts({
    months,
    bundleAudits: audits.map((a) => ({ date: dateInZone(a.audited_at, tz), sectorId: a.sector_id, metric: a.metric, compliant: a.result === 'conforme' })),
    handHygiene: hh.map((h) => ({ date: dateInZone(h.observed_at, tz), sectorId: h.sector_id, opportunities: h.opportunities, actions: h.actions })),
    alcohol: alcohol.filter((a) => a.sector_id).map((a) => ({ date: dateInZone(a.occurred_at, tz), sectorId: a.sector_id!, ml: -Number(a.delta) })),
    training: trainings.length ? {
      professionals: professionals.map((p) => ({ id: p.id, sectorId: p.sector_id, jobRoleId: p.job_role_id, active: p.active })),
      trainings: trainings.map((t) => ({ id: t.id, mandatory: t.mandatory, validityMonths: t.validity_months, targetJobRoleIds: t.target_job_role_ids })),
      attendances: attendance.map((a) => ({ trainingId: a.training_id, professionalId: a.professional_id, heldOn: a.held_on, present: a.present })),
      warningDays,
    } : null,
  });
}
