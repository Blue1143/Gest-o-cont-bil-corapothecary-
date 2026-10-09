import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { addDays, dateInZone, evaluateLoadRelease, itemLabel, loadCode, sterileUntil, todayIn, zonedInstant, type LoadStatus, type LoadTest } from '@ccih/domain';
import { DEMO_LOAD_POLICY, DEMO_SETS, DEMO_STERILIZERS, generateCme } from '@ccih/demo-data';
import type { DB } from './types';

export interface CmeSeedContext {
  institutionId: string;
  sectorIds: Map<string, string>;
  from: string;
  now: Date;
  timezone: string;
  shelfLifeDays: number | undefined;
}

const OPERATOR = 'Técnico(a) de CME (demonstração)';
const RT = 'Responsável CME (demonstração)';

async function insertChunked<T extends keyof DB>(trx: Transaction<DB>, table: T, rows: Array<Record<string, unknown>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic bulk insert over typed tables
  for (let i = 0; i < rows.length; i += 500) await trx.insertInto(table).values(rows.slice(i, i + 500) as any).execute();
}

/** Synthetic CME records (data_origin = demo). Runs after the clinical seed (uses its surgeries). */
export async function seedCme(trx: Transaction<DB>, ctx: CmeSeedContext) {
  const inst = ctx.institutionId;
  const tz = ctx.timezone;
  const origin = 'demo' as const;
  const cmeSector = ctx.sectorIds.get('cme')!;
  const today = todayIn(tz, ctx.now);

  const sterilizers = new Map<string, { id: string; code: string; type: string }>();
  for (const s of DEMO_STERILIZERS) {
    const row = await trx.insertInto('sterilizer').values({ institution_id: inst, sector_id: cmeSector, code: s.code, name: s.name, type: s.type, serial: s.serial, status: 'ativo', status_reason: null, qualification_due_on: addDays(today, s.qualificationInDays), updated_at: ctx.now }).returning('id').executeTakeFirstOrThrow();
    sterilizers.set(s.code, { id: row.id, code: s.code, type: s.type });
  }
  const sets = new Map<string, { id: string; name: string; packaging: string; implant: boolean }>();
  for (const s of DEMO_SETS) {
    const row = await trx.insertInto('instrument_set').values({ institution_id: inst, code: s.code, name: s.name, specialty: s.specialty, composition: null, item_count: s.itemCount, packaging: s.packaging, implant: s.implant, updated_at: ctx.now }).returning('id').executeTakeFirstOrThrow();
    sets.set(s.code, { id: row.id, name: s.name, packaging: s.packaging, implant: s.implant });
  }

  const surgeries = await trx.selectFrom('surgery').select(['id', 'started_at', 'implant', 'sector_id']).where('institution_id', '=', inst).where('started_at', '>=', zonedInstant(ctx.from, 0, tz)).execute();
  const data = generateCme({ from: ctx.from, now: ctx.now, timezone: tz, surgeries: surgeries.map((s) => ({ id: s.id, startedAt: s.started_at, implant: s.implant })) });

  const bdRows = data.bowieDick.map((b) => ({
    id: randomUUID(), institution_id: inst, sterilizer_id: sterilizers.get(b.sterilizerCode)!.id, load_id: null, type: 'BOWIE_DICK', result: b.result, performed_at: b.performedAt,
    performed_on: dateInZone(b.performedAt, tz), indicator_lot: `BD-${dateInZone(b.performedAt, tz).slice(0, 7).replace('-', '')}`, indicator_expiry: addDays(today, 365),
    incubation_start: null, read_at: null, control_result: null, notes: b.notes, recorded_by: null, recorded_by_name: OPERATOR, replaces_id: null, justification: null, data_origin: origin,
  }));
  await insertChunked(trx, 'sterilization_test', bdRows);

  // Codes follow the order of the cycles of each sterilizer on each day.
  const ordered = [...data.loads].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const seq = new Map<string, number>();
  const loadIds = new Map<string, string>();
  const itemIds = new Map<string, string>();
  const loads: Array<Record<string, unknown>> = [];
  const items: Array<Record<string, unknown>> = [];
  const tests: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];
  const snapshot = JSON.stringify({ version: 1, ...DEMO_LOAD_POLICY, referenceId: null });
  for (const l of ordered) {
    const st = sterilizers.get(l.sterilizerCode)!;
    const day = dateInZone(l.startedAt, tz);
    const n = (seq.get(`${st.code}|${day}`) ?? 0) + 1;
    seq.set(`${st.code}|${day}`, n);
    const code = loadCode(st.code, day, n);
    const id = randomUUID();
    loadIds.set(l.key, id);
    const status: LoadStatus = l.decisions.at(-1)?.to ?? 'aguardando';
    const hasImplant = l.sets.some((c) => sets.get(c)!.implant);
    loads.push({
      id, institution_id: inst, sterilizer_id: st.id, code, program: l.program, started_at: l.startedAt, ended_at: l.endedAt, operator_id: null, operator_name: OPERATOR,
      temperature_c: l.temperatureC, pressure_kpa: l.pressureKpa, exposure_minutes: l.exposureMinutes, physical_result: l.physical, notes: null, status, has_implant: hasImplant,
      reprocessed_from_id: l.reprocessedFromKey ? loadIds.get(l.reprocessedFromKey)! : null, data_origin: origin, created_at: l.startedAt, updated_at: l.decisions.at(-1)?.at ?? l.startedAt,
      row_version: 1 + (l.endedAt ? 1 : 0) + l.decisions.length,
    });
    const expires = sterileUntil(day, ctx.shelfLifeDays);
    l.sets.forEach((setCode, i) => {
      const set = sets.get(setCode)!;
      const itemId = randomUUID();
      itemIds.set(`${l.key}#${i}`, itemId);
      items.push({ id: itemId, institution_id: inst, load_id: id, position: i + 1, label_code: itemLabel(code, i + 1), set_id: set.id, description: set.name, quantity: 1, packaging: set.packaging, implant: set.implant, expires_on: expires });
    });
    for (const t of l.tests) {
      const testId = randomUUID();
      const lot = t.type === 'IB' ? 'IB-DEMO-2611' : 'IQ5-DEMO-2611';
      tests.push({
        id: testId, institution_id: inst, sterilizer_id: st.id, load_id: id, type: t.type, result: t.result, performed_at: t.performedAt, performed_on: dateInZone(t.performedAt, tz),
        indicator_lot: lot, indicator_expiry: addDays(today, 300), incubation_start: t.incubationStart, read_at: null, control_result: null, notes: null, recorded_by: null,
        recorded_by_name: OPERATOR, replaces_id: null, justification: null, data_origin: origin,
      });
      if (t.reading) {
        tests.push({
          id: randomUUID(), institution_id: inst, sterilizer_id: st.id, load_id: id, type: t.type, result: t.reading.result, performed_at: t.performedAt, performed_on: dateInZone(t.performedAt, tz),
          indicator_lot: lot, indicator_expiry: addDays(today, 300), incubation_start: t.incubationStart, read_at: t.reading.readAt, control_result: 'positivo',
          notes: t.reading.result === 'reprovado' ? 'Viragem de cor do meio de cultura (crescimento).' : null, recorded_by: null, recorded_by_name: OPERATOR, replaces_id: testId,
          justification: 'Leitura do indicador biológico.', data_origin: origin,
        });
      }
    }
    decisions.push({ id: randomUUID(), load_id: id, from_status: null, to_status: 'aguardando', decided_at: l.startedAt, decided_by: null, decided_by_name: OPERATOR, justification: 'Carga registrada.', policy_snapshot: null, evaluation: JSON.stringify({ status: 'aguardando', reasons: [] }) });
    let from: LoadStatus = 'aguardando';
    for (const d of l.decisions) {
      // The evaluation recorded with each decision is the policy applied to what was known at that moment.
      const known: LoadTest[] = [];
      if (l.physical) known.push({ type: 'REGISTRO_FISICO', result: l.physical === 'conforme' ? 'aprovado' : 'reprovado' });
      for (const t of l.tests) known.push({ type: t.type, result: t.reading && t.reading.readAt <= d.at ? t.reading.result : t.result });
      const ev = evaluateLoadRelease({ tests: known, hasImplant, bowieDickApplies: st.type === 'vapor_prevacuo', equipmentBowieDick: 'aprovado' }, DEMO_LOAD_POLICY);
      decisions.push({ id: randomUUID(), load_id: id, from_status: from, to_status: d.to, decided_at: d.at, decided_by: null, decided_by_name: RT, justification: d.justification, policy_snapshot: snapshot, evaluation: JSON.stringify({ status: ev.status, reasons: ev.reasons }) });
      from = d.to;
    }
  }
  await insertChunked(trx, 'sterilization_load', loads);
  await insertChunked(trx, 'load_item', items);
  await insertChunked(trx, 'sterilization_test', tests);
  await insertChunked(trx, 'load_release_decision', decisions);

  const surgerySector = new Map(surgeries.map((s) => [s.id, s.sector_id]));
  await insertChunked(trx, 'material_use', data.uses.map((u) => ({
    institution_id: inst, item_id: itemIds.get(`${u.loadKey}#${u.itemIndex}`)!, surgery_id: u.surgeryId, sector_id: u.surgeryId ? surgerySector.get(u.surgeryId)! : ctx.sectorIds.get(u.sectorCode!)!,
    used_at: u.usedAt, recorded_by: null, recorded_by_name: u.surgeryId ? 'Centro cirúrgico (demonstração)' : 'Enfermagem (demonstração)', data_origin: origin,
  })));
  return { cmeLoads: loads.length, cmeTests: tests.length + bdRows.length, cmeUses: data.uses.length };
}
