import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { addDays, dateInZone, evaluateBundle, signedDelta, zonedInstant } from '@ccih/domain';
import { DEMO_BUNDLES, DEMO_FOLLOWUP_METHODS, DEMO_JOB_ROLES, DEMO_SUPPLIES, DEMO_TRAININGS, generateOperations, hashSeed, rng } from '@ccih/demo-data';
import type { DB } from './types';

export interface OperationsSeedContext {
  institutionId: string;
  sectorIds: Map<string, string>;
  from: string;
  now: Date;
  timezone: string;
}

const STOREROOM = 'Almoxarifado (demonstração)';
const CCIH = 'Vigilância CCIH (demonstração)';

async function insertChunked<T extends keyof DB>(trx: Transaction<DB>, table: T, rows: Array<Record<string, unknown>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic bulk insert over typed tables
  for (let i = 0; i < rows.length; i += 500) await trx.insertInto(table).values(rows.slice(i, i + 500) as any).execute();
}

/** Synthetic operational records (data_origin = demo). Runs after the clinical seed. */
export async function seedOperations(trx: Transaction<DB>, ctx: OperationsSeedContext) {
  const ops = generateOperations({ from: ctx.from, now: ctx.now, timezone: ctx.timezone });
  const inst = ctx.institutionId;
  const origin = 'demo' as const;
  const sector = (code: string) => ctx.sectorIds.get(code)!;

  // Bundles
  const itemIds = new Map<string, string[]>();
  const templateIds = new Map<string, { id: string; method: 'tudo_ou_nada' | 'por_item' }>();
  for (const b of DEMO_BUNDLES) {
    const t = await trx.insertInto('bundle_template').values({ institution_id: inst, code: b.code, name: b.name, metric: b.metric, method: b.method, reference_id: null, updated_at: ctx.now }).returning('id').executeTakeFirstOrThrow();
    templateIds.set(b.code, { id: t.id, method: b.method });
    const items = await trx.insertInto('bundle_item').values(b.items.map((label, position) => ({ template_id: t.id, position, label }))).returning('id').execute();
    itemIds.set(b.code, items.map((i) => i.id));
  }
  const audits: Array<Record<string, unknown>> = [];
  const answers: Array<Record<string, unknown>> = [];
  for (const a of ops.bundleAudits) {
    const tpl = templateIds.get(a.templateCode)!;
    const id = randomUUID();
    const result = evaluateBundle(a.answers, tpl.method).result === 'conforme' ? 'conforme' : 'nao_conforme';
    audits.push({ id, institution_id: inst, template_id: tpl.id, sector_id: sector(a.sectorCode), admission_id: null, audited_at: a.auditedAt, method: tpl.method, result, notes: null, auditor_id: null, auditor_name: CCIH, voided_at: null, voided_by_name: null, void_reason: null, data_origin: origin });
    const labels = DEMO_BUNDLES.find((b) => b.code === a.templateCode)!.items;
    a.answers.forEach((answer, i) => answers.push({ audit_id: id, item_id: itemIds.get(a.templateCode)![i], item_label: labels[i], answer }));
  }
  await insertChunked(trx, 'bundle_audit', audits);
  await insertChunked(trx, 'bundle_audit_answer', answers);
  await insertChunked(trx, 'hand_hygiene_observation', ops.handHygiene.map((h) => ({
    institution_id: inst, sector_id: sector(h.sectorCode), observed_at: h.observedAt, category: h.category, opportunities: h.opportunities, actions: h.actions,
    observer_id: null, observer_name: CCIH, voided_at: null, voided_by_name: null, void_reason: null, data_origin: origin,
  })));

  // Staff and trainings
  const roleIds = new Map<string, string>();
  for (const name of DEMO_JOB_ROLES) {
    const row = await trx.insertInto('job_role').values({ institution_id: inst, name }).onConflict((oc) => oc.columns(['institution_id', 'name']).doUpdateSet({ name })).returning('id').executeTakeFirstOrThrow();
    roleIds.set(name, row.id);
  }
  const staffIds = new Map(ops.staff.map((s) => [s.key, randomUUID()]));
  await insertChunked(trx, 'professional', ops.staff.map((s) => ({ id: staffIds.get(s.key), institution_id: inst, name: s.name, registration: null, job_role_id: roleIds.get(s.jobRole), sector_id: sector(s.sectorCode) })));
  const trainingIds = new Map<string, string>();
  for (const t of DEMO_TRAININGS) {
    const row = await trx.insertInto('training').values({ institution_id: inst, title: t.title, theme: t.theme, mandatory: t.mandatory, validity_months: t.validityMonths, target_job_role_ids: t.roles.map((r) => roleIds.get(r)!), description: 'Modelo de demonstração: conteúdo e validade definidos pela instituição.', updated_at: ctx.now }).returning('id').executeTakeFirstOrThrow();
    trainingIds.set(t.title, row.id);
  }
  const attendance: Array<Record<string, unknown>> = [];
  const sessions = ops.sessions.map((s) => {
    const id = randomUUID();
    for (const p of s.attendees) attendance.push({ session_id: id, professional_id: staffIds.get(p), present: true, score: null });
    return { id, training_id: trainingIds.get(s.trainingTitle), held_on: s.heldOn, instructor: 'Equipe CCIH (demonstração)', hours: 2, sector_id: null, notes: null, data_origin: origin, created_by: null };
  });
  await insertChunked(trx, 'training_session', sessions);
  await insertChunked(trx, 'training_attendance', attendance);

  // Supplies ledger
  const lotIds = new Map<string, string>();
  for (const s of DEMO_SUPPLIES) {
    const sup = await trx.insertInto('supply').values({ institution_id: inst, code: s.code, name: s.name, category: s.category, unit: s.unit, min_coverage_days: s.minCoverageDays, updated_at: ctx.now }).returning('id').executeTakeFirstOrThrow();
    for (const lot of ops.lots.filter((l) => l.supplyCode === s.code)) {
      const row = await trx.insertInto('supply_lot').values({ supply_id: sup.id, lot: lot.lot, expires_on: lot.expiresOn }).returning('id').executeTakeFirstOrThrow();
      lotIds.set(`${s.code}|${lot.lot}`, row.id);
    }
  }
  const movements: Array<Record<string, unknown>> = [];
  for (const lot of ops.lots) for (const e of lot.entries) movements.push({ lot_id: lotIds.get(`${lot.supplyCode}|${lot.lot}`), kind: 'entrada', delta: signedDelta('entrada', e.quantity), sector_id: null, occurred_at: e.at, reason: null, created_by: null, created_by_name: STOREROOM, data_origin: origin });
  for (const c of ops.consumption) movements.push({ lot_id: lotIds.get(`${c.supplyCode}|${c.lot}`), kind: 'consumo', delta: signedDelta('consumo', c.quantity), sector_id: sector(c.sectorCode), occurred_at: c.at, reason: null, created_by: null, created_by_name: STOREROOM, data_origin: origin });
  await insertChunked(trx, 'supply_movement', movements);

  // Quality audits, non-conformities and action plans
  for (const a of ops.audits) {
    const audit = await trx.insertInto('quality_audit').values({ institution_id: inst, title: a.title, kind: a.kind, sector_id: sector(a.sectorCode), scope: null, planned_for: a.plannedFor, status: a.status, findings: a.findings, data_origin: origin, created_by: null, created_at: a.history[0]!.at, updated_at: a.history.at(-1)!.at }).returning('id').executeTakeFirstOrThrow();
    await trx.insertInto('quality_audit_status').values(a.history.map((h) => ({ audit_id: audit.id, from_status: h.from, to_status: h.to, justification: 'Registro sintético de demonstração.', decided_by: null, decided_by_name: CCIH, at: h.at }))).execute();
    if (!a.nonconformity) continue;
    const n = a.nonconformity;
    const nc = await trx.insertInto('nonconformity').values({ institution_id: inst, audit_id: audit.id, sector_id: sector(a.sectorCode), origin: 'auditoria', severity: n.severity, description: n.description, detected_on: n.history[0]!.at.slice(0, 10), status: n.status, effectiveness: n.effectiveness, data_origin: origin, created_by: null, created_at: n.history[0]!.at, updated_at: n.history.at(-1)!.at }).returning('id').executeTakeFirstOrThrow();
    await trx.insertInto('nonconformity_status').values(n.history.map((h) => ({ nonconformity_id: nc.id, from_status: h.from, to_status: h.to, justification: 'Registro sintético de demonstração.', decided_by: null, decided_by_name: CCIH, at: h.at }))).execute();
    await trx.insertInto('action_plan').values(n.actions.map((x) => ({ nonconformity_id: nc.id, what: x.what, why: x.why, where_text: x.where, who_name: x.who, due_on: x.dueOn, how: x.how, how_much: null, status: x.status, completed_on: x.completedOn, updated_at: ctx.now }))).execute();
  }

  // Post-discharge SSI surveillance: most discharged surgical patients contacted once.
  const r = rng(hashSeed(`followup|${ctx.from}`));
  const today = dateInZone(ctx.now, ctx.timezone);
  const surgeries = await trx.selectFrom('surgery').innerJoin('admission', 'admission.id', 'surgery.admission_id').select(['surgery.id', 'admission.discharged_at']).where('surgery.institution_id', '=', inst).where('admission.discharged_at', 'is not', null).execute();
  const followups: Array<Record<string, unknown>> = [];
  for (const s of surgeries) {
    const contact = addDays(dateInZone(s.discharged_at!, ctx.timezone), 7 + Math.floor(r() * 8));
    if (contact >= today || r() > 0.85) continue;
    followups.push({ surgery_id: s.id, contacted_on: contact, method: DEMO_FOLLOWUP_METHODS[Math.floor(r() * DEMO_FOLLOWUP_METHODS.length)], outcome: r() < 0.95 ? 'sem_sinais' : 'nao_localizado', notes: null, case_id: null, recorded_by: null, recorded_by_name: CCIH, created_at: zonedInstant(contact, 15, ctx.timezone) });
  }
  await insertChunked(trx, 'ssi_followup', followups);

  return { bundleAudits: audits.length, handHygiene: ops.handHygiene.length, staff: ops.staff.length, supplyMovements: movements.length, followups: followups.length };
}
