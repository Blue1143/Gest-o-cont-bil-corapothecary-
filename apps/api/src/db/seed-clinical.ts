import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { DEMO_P75_SOURCE, DEMO_REFERENCES, generateClinical } from '@ccih/demo-data';
import type { DB } from './types';

export interface ClinicalSeedContext {
  institutionId: string;
  /** sector code → id */
  sectorIds: Map<string, string>;
  /** demo reference code → id */
  refIds: Map<string, string>;
  from: string;
  now: Date;
  timezone: string;
}

const AUTHOR = 'Vigilância CCIH (demonstração)';
const CRITERION_CODE = 'ref-anvisa-criterios-iras';

async function insertChunked<T extends keyof DB>(trx: Transaction<DB>, table: T, rows: Array<Record<string, unknown>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic bulk insert over typed tables
  for (let i = 0; i < rows.length; i += 500) await trx.insertInto(table).values(rows.slice(i, i + 500) as any).execute();
}

/** Inserts the synthetic clinical records (all flagged data_origin = demo). */
export async function seedClinical(trx: Transaction<DB>, ctx: ClinicalSeedContext) {
  const data = generateClinical({ from: ctx.from, now: ctx.now, timezone: ctx.timezone });
  const inst = ctx.institutionId;
  const origin = 'demo' as const;
  const sector = (code: string) => ctx.sectorIds.get(code)!;

  const beds = await trx.selectFrom('bed').innerJoin('sector', 'sector.id', 'bed.sector_id').select(['bed.id', 'bed.code', 'sector.code as sectorCode']).where('sector.institution_id', '=', inst).execute();
  const bedId = new Map(beds.map((b) => [`${b.sectorCode}|${b.code}`, b.id]));

  const job = await trx.insertInto('job_role').values({ institution_id: inst, name: 'Cirurgião(ã)' }).onConflict((oc) => oc.columns(['institution_id', 'name']).doUpdateSet({ name: 'Cirurgião(ã)' })).returning('id').executeTakeFirstOrThrow();
  const surgeonId = new Map<string, string>();
  for (const s of data.surgeons) {
    const row = await trx.insertInto('professional').values({ institution_id: inst, name: s.name, registration: null, job_role_id: job.id }).returning('id').executeTakeFirstOrThrow();
    surgeonId.set(s.key, row.id);
  }
  const procedureId = new Map<string, string>();
  for (const p of data.procedures) {
    const row = await trx.insertInto('procedure_catalog').values({ institution_id: inst, code: p.code, name: p.name, specialty: p.specialty, p75_minutes: p.p75Min, p75_source: DEMO_P75_SOURCE }).returning('id').executeTakeFirstOrThrow();
    procedureId.set(p.code, row.id);
  }

  const patientId = new Map(data.patients.map((p) => [p.key, randomUUID()]));
  await insertChunked(trx, 'patient', data.patients.map((p) => ({
    id: patientId.get(p.key), institution_id: inst, record_number: p.recordNumber, initials: p.initials, full_name_enc: null, birth_date: p.birthDate, sex: p.sex,
    data_origin: origin, updated_at: ctx.now,
  })));

  const admissionId = new Map(data.admissions.map((a) => [a.key, randomUUID()]));
  const deviceId = new Map<string, string>();
  await insertChunked(trx, 'admission', data.admissions.map((a) => ({
    id: admissionId.get(a.key), institution_id: inst, patient_id: patientId.get(a.patientKey), admitted_at: a.admittedAt, discharged_at: a.dischargedAt,
    outcome: a.outcome, diagnosis: a.diagnosis, data_origin: origin, created_by: null, updated_at: ctx.now,
  })));
  await insertChunked(trx, 'admission_movement', data.admissions.flatMap((a) => a.movements.map((m) => ({
    admission_id: admissionId.get(a.key), sector_id: sector(m.sectorCode), bed_id: m.bedCode ? (bedId.get(`${m.sectorCode}|${m.bedCode}`) ?? null) : null,
    start_at: m.start, end_at: m.end, reason: m.reason, created_by: null,
  }))));
  await insertChunked(trx, 'device_use', data.admissions.flatMap((a) => a.devices.map((d) => {
    const id = randomUUID();
    deviceId.set(d.key, id);
    return { id, institution_id: inst, admission_id: admissionId.get(a.key), device_type: d.type, site: d.site, indication: null, inserted_at: d.insertedAt, removed_at: d.removedAt, removal_reason: d.removalReason, data_origin: origin, created_by: null };
  })));

  const surgeryId = new Map(data.surgeries.map((s) => [s.key, randomUUID()]));
  await insertChunked(trx, 'surgery', data.surgeries.map((s) => ({
    id: surgeryId.get(s.key), institution_id: inst, admission_id: admissionId.get(s.admissionKey), procedure_id: procedureId.get(s.procedureCode), surgeon_id: surgeonId.get(s.surgeonKey),
    sector_id: sector('centro-cirurgico'), room: s.room, started_at: s.startedAt, ended_at: s.endedAt, wound_class: s.woundClass, asa: s.asa, implant: s.implant, urgency: s.urgency,
    prophylaxis_indicated: s.prophylaxisIndicated, prophylaxis_drug: s.drug, prophylaxis_dose_at: s.doseAt, prophylaxis_duration_h: s.durationH, redose: s.redose, notes: null,
    data_origin: origin, created_by: null, updated_at: ctx.now,
  })));

  const cultureId = new Map(data.cultures.map((c) => [c.key, randomUUID()]));
  await insertChunked(trx, 'culture', data.cultures.map((c) => ({
    id: cultureId.get(c.key), institution_id: inst, admission_id: admissionId.get(c.admissionKey), sector_id: sector(c.sectorCode), material: c.material, collected_at: c.collectedAt, origin: 'manual', data_origin: origin, created_by: null,
  })));
  const results: Array<Record<string, unknown>> = [];
  const isolates: Array<Record<string, unknown>> = [];
  const tests: Array<Record<string, unknown>> = [];
  for (const c of data.cultures) {
    if (!c.result) continue;
    const resultId = randomUUID();
    results.push({ id: resultId, culture_id: cultureId.get(c.key), version: 1, outcome: c.result.outcome, reported_at: c.result.reportedAt, breakpoint_version: 'Versão do breakpoint a confirmar (dado sintético)', notes: null, justification: null, recorded_by: null, recorded_by_name: 'Laboratório (demonstração)' });
    for (const iso of c.result.isolates) {
      const isolateId = randomUUID();
      isolates.push({ id: isolateId, result_id: resultId, organism: iso.organism, quantity: null, resistance_profile: iso.profile, mechanism: iso.mechanism });
      for (const t of iso.susceptibility) tests.push({ isolate_id: isolateId, antimicrobial: t.antimicrobial, mic: null, interpretation: t.interpretation });
    }
  }
  await insertChunked(trx, 'culture_result', results);
  await insertChunked(trx, 'isolate', isolates);
  await insertChunked(trx, 'susceptibility', tests);

  const ref = DEMO_REFERENCES.find((r) => r.id === CRITERION_CODE)!;
  const criterionId = ctx.refIds.get(CRITERION_CODE) ?? null;
  const snapshot = JSON.stringify({ code: CRITERION_CODE, title: ref.title, version: ref.version, source: ref.source, validated: false });
  const caseId = new Map(data.cases.map((c) => [c.key, randomUUID()]));
  await insertChunked(trx, 'iras_case', data.cases.map((c) => {
    const decided = c.status === 'confirmada' || c.status === 'descartada';
    return {
      id: caseId.get(c.key), institution_id: inst, admission_id: admissionId.get(c.admissionKey), iras_type: c.type, status: c.status, event_date: c.eventDate, sector_id: sector(c.sectorCode),
      device_associated: c.deviceAssociated, device_use_id: c.deviceKey ? deviceId.get(c.deviceKey) : null, surgery_id: c.surgeryKey ? surgeryId.get(c.surgeryKey) : null,
      criterion_reference_id: decided ? criterionId : null, criterion_snapshot: decided ? snapshot : null,
      description: 'Caso sintético gerado para demonstração.', data_origin: origin, created_by: null, created_at: c.history[0]!.at, updated_at: c.history.at(-1)!.at,
    };
  }));
  await insertChunked(trx, 'iras_case_status', data.cases.flatMap((c) => c.history.map((h) => ({
    case_id: caseId.get(c.key), from_status: h.from, to_status: h.to, justification: h.justification, decided_by: null, decided_by_name: AUTHOR, at: h.at,
  }))));
  await insertChunked(trx, 'iras_case_culture', data.cases.flatMap((c) => c.cultureKeys.map((k) => ({ case_id: caseId.get(c.key), culture_id: cultureId.get(k) }))));
  await insertChunked(trx, 'ccih_note', data.notes.map((n) => ({
    institution_id: inst, patient_id: patientId.get(n.patientKey), admission_id: admissionId.get(n.admissionKey), case_id: n.caseKey ? caseId.get(n.caseKey) : null,
    kind: n.kind, body: n.body, amends_id: null, justification: null, author_id: null, author_name: AUTHOR, data_origin: origin, created_at: n.at,
  })));

  return { admissions: data.admissions.length, surgeries: data.surgeries.length, cases: data.cases.length, cultures: data.cultures.length };
}
