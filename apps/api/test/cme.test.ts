import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { resetAlertThrottle } from '../src/services/alerts';
import { login, setupTestApp, teardown, type Session, type TestContext } from './helpers';

let ctx: TestContext;
let enf: Session;
let cme: Session;
let consulta: Session;
const uploads = mkdtempSync(join(tmpdir(), 'ccih-uploads-'));
const api = (s: Session, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => ctx.app.inject({ method, url: `/api${url}`, headers: s.headers, ...(payload !== undefined ? { payload: payload as object } : {}) });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const J = 'Registro de teste da CME';
const sterilizer = async (code: string) => ctx.db.selectFrom('sterilizer').selectAll().where('code', '=', code).executeTakeFirstOrThrow();
const setId = async (code: string) => (await ctx.db.selectFrom('instrument_set').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const load = async (s: Session, id: string) => (await api(s, 'GET', `/cme/loads/${id}`)).json();
const iq = (loadId: string, over: Record<string, unknown> = {}) => ({
  sterilizerId: null, loadId, type: 'IQ5', result: 'aprovado', performedAt: minutesAgo(1), indicatorLot: 'L-TESTE', indicatorExpiry: '2099-12-31', incubationStart: null, readAt: null, controlResult: null, notes: null, ...over,
});

/** Plasma: Bowie-Dick does not apply, so the result does not depend on the time the tests run. */
async function plasmaLoad(sets: string[], startedMinutesAgo = 120) {
  const pl1 = await sterilizer('pl1');
  const res = await api(cme, 'POST', '/cme/loads', { sterilizerId: pl1.id, program: 'Plasma — ciclo padrão', startedAt: minutesAgo(startedMinutesAgo), notes: null, reprocessedFromId: null, items: await Promise.all(sets.map(async (c) => ({ setId: await setId(c), description: null, quantity: 1, packaging: null, implant: null }))) });
  expect(res.statusCode).toBe(201);
  const id = res.json().id as string;
  const l = await load(cme, id);
  expect((await api(cme, 'POST', `/cme/loads/${id}/cycle`, { endedAt: minutesAgo(startedMinutesAgo - 50), temperatureC: 50, pressureKpa: null, exposureMinutes: 28, physicalResult: 'conforme', notes: null, rowVersion: l.rowVersion })).statusCode).toBe(200);
  return id;
}

beforeAll(async () => {
  ctx = await setupTestApp({ UPLOAD_DIR: uploads, UPLOAD_MAX_MB: '1' });
  [enf, cme, consulta] = await Promise.all([login(ctx.app, 'enf.ccih'), login(ctx.app, 'cme'), login(ctx.app, 'consulta')]);
});
afterAll(async () => {
  await teardown(ctx);
  rmSync(uploads, { recursive: true, force: true });
});

describe('synthetic CME data', () => {
  it('covers the situations the module must show', async () => {
    const statuses = await ctx.db.selectFrom('sterilization_load').select(['status', (e) => e.fn.countAll<string>().as('n')]).groupBy('status').execute();
    const by = Object.fromEntries(statuses.map((s) => [s.status, Number(s.n)]));
    expect(by.liberada).toBeGreaterThan(100);
    expect(by.retida ?? 0).toBeGreaterThanOrEqual(0);
    expect(by.reprocessamento).toBeGreaterThanOrEqual(1);
    const recall = await ctx.db.selectFrom('load_release_decision').select('load_id').where('from_status', '=', 'liberada').where('to_status', '=', 'rejeitada').execute();
    expect(recall).toHaveLength(1);
    const detail = await load(enf, recall[0]!.load_id);
    expect(detail.exposed.surgeries).toBeGreaterThan(0);
    // Every released load satisfies the policy with its current tests (the seed follows the same rules).
    const page = (await api(enf, 'GET', '/cme/loads?status=liberada&pageSize=100')).json();
    expect(page.rows.every((r: { suggestion: string }) => r.suggestion === 'liberada')).toBe(true);
    const overview = (await api(cme, 'GET', '/cme/overview')).json();
    expect(overview.sterilizers).toHaveLength(3);
    expect(overview.recalled30d).toBe(1);
  });

  it('refuses access without cme:view and keeps release history append-only', async () => {
    expect((await api(consulta, 'GET', '/cme/loads')).statusCode).toBe(403);
    await expect(sql`UPDATE load_release_decision SET justification = 'x'`.execute(ctx.db)).rejects.toThrow();
    await expect(sql`DELETE FROM sterilization_test`.execute(ctx.db)).rejects.toThrow();
  });
});

describe('load release', () => {
  it('releases only what the policy allows and stores the policy applied', async () => {
    const pl1 = await sterilizer('pl1');
    const created = await api(cme, 'POST', '/cme/loads', { sterilizerId: pl1.id, program: 'Plasma — ciclo padrão', startedAt: minutesAgo(90), notes: null, reprocessedFromId: null, items: [{ setId: await setId('otica-30'), description: null, quantity: 1, packaging: null, implant: null }, { setId: null, description: 'Pinça avulsa', quantity: 2, packaging: 'papel_grau_cirurgico', implant: false }] });
    expect(created.statusCode).toBe(201);
    const { id, code } = created.json();
    expect(code).toMatch(/^PL1-\d{6}-\d{2}$/);
    let l = await load(cme, id);
    expect(l.itemList.map((i: { labelCode: string }) => i.labelCode)).toEqual([`${code}-01`, `${code}-02`]);
    expect(l.itemList[0].expiresOn).not.toBeNull();
    const early = await api(cme, 'POST', `/cme/loads/${id}/decision`, { status: 'liberada', justification: J, rowVersion: l.rowVersion });
    expect(early.statusCode).toBe(400);
    expect(early.json().message).toMatch(/política não permite/);
    expect((await api(cme, 'POST', `/cme/loads/${id}/cycle`, { endedAt: minutesAgo(40), temperatureC: 50, pressureKpa: null, exposureMinutes: 28, physicalResult: 'conforme', notes: null, rowVersion: l.rowVersion })).statusCode).toBe(200);
    expect((await api(cme, 'POST', '/cme/tests', iq(id))).statusCode).toBe(201);
    expect((await api(cme, 'POST', '/cme/tests', iq(id))).statusCode).toBe(409);
    l = await load(cme, id);
    expect(l.evaluation.status).toBe('liberada');
    expect((await api(enf, 'POST', `/cme/loads/${id}/decision`, { status: 'liberada', justification: J, rowVersion: l.rowVersion })).statusCode).toBe(403);
    expect((await api(cme, 'POST', `/cme/loads/${id}/decision`, { status: 'liberada', justification: 'Testes conformes', rowVersion: l.rowVersion })).statusCode).toBe(200);
    l = await load(cme, id);
    expect(l.status).toBe('liberada');
    expect(l.decisions.at(-1)).toMatchObject({ from: 'aguardando', to: 'liberada', policy: { version: 1, requiredLoadTests: ['IQ5', 'REGISTRO_FISICO'] }, evaluation: { status: 'liberada' } });
    expect((await api(cme, 'POST', `/cme/loads/${id}/decision`, { status: 'retida', justification: J, rowVersion: l.rowVersion })).statusCode).toBe(400);
  });

  it('holds an implant load until the biological indicator is read', async () => {
    const id = await plasmaLoad(['cx-placas-parafusos']);
    expect((await api(cme, 'POST', '/cme/tests', iq(id))).statusCode).toBe(201);
    let l = await load(cme, id);
    expect(l.evaluation.status).toBe('retida');
    const ib = await api(cme, 'POST', '/cme/tests', iq(id, { type: 'IB', result: 'pendente', incubationStart: minutesAgo(60) }));
    expect(ib.statusCode).toBe(201);
    expect((await api(cme, 'POST', `/cme/loads/${id}/decision`, { status: 'liberada', justification: J, rowVersion: l.rowVersion })).statusCode).toBe(400);
    const badControl = await api(cme, 'POST', `/cme/tests/${ib.json().id}/replace`, { result: 'aprovado', readAt: minutesAgo(1), controlResult: 'negativo', notes: null, justification: null });
    expect(badControl.json().fields[0].path).toBe('controlResult');
    expect((await api(cme, 'POST', `/cme/tests/${ib.json().id}/replace`, { result: 'aprovado', readAt: minutesAgo(1), controlResult: 'positivo', notes: null, justification: null })).statusCode).toBe(201);
    // Only one reading per test: a second one must correct the current version instead.
    expect((await api(cme, 'POST', `/cme/tests/${ib.json().id}/replace`, { result: 'aprovado', readAt: minutesAgo(1), controlResult: 'positivo', notes: null, justification: J })).statusCode).toBe(409);
    l = await load(cme, id);
    expect(l.tests.filter((t: { type: string; current: boolean }) => t.type === 'IB').map((t: { current: boolean; result: string }) => [t.result, t.current])).toEqual([['pendente', false], ['aprovado', true]]);
    expect((await api(cme, 'POST', `/cme/loads/${id}/decision`, { status: 'liberada', justification: 'IB negativo', rowVersion: l.rowVersion })).statusCode).toBe(200);
  });

  it('validates test records', async () => {
    const id = await plasmaLoad(['otica-30']);
    expect((await api(cme, 'POST', '/cme/tests', iq(id, { indicatorExpiry: '2020-01-01' }))).json().fields[0].path).toBe('indicatorExpiry');
    const pl1 = await sterilizer('pl1');
    expect((await api(cme, 'POST', '/cme/tests', { ...iq(id), type: 'BOWIE_DICK', loadId: null, sterilizerId: pl1.id })).json().fields[0].path).toBe('type');
    expect((await api(cme, 'POST', '/cme/tests', iq(id, { result: 'pendente' }))).statusCode).toBe(400);
  });
});

describe('use of packages and traceability', () => {
  let surgeryId: string;
  let releasedLoad: string;
  let label: string;

  beforeAll(async () => {
    surgeryId = (await ctx.db.selectFrom('surgery').select('id').orderBy('started_at', 'desc').limit(1).executeTakeFirstOrThrow()).id;
    releasedLoad = await plasmaLoad(['cx-videolaparoscopia', 'otica-30'], 600);
    await api(cme, 'POST', '/cme/tests', iq(releasedLoad));
    const l = await load(cme, releasedLoad);
    await api(cme, 'POST', `/cme/loads/${releasedLoad}/decision`, { status: 'liberada', justification: 'Testes conformes', rowVersion: l.rowVersion });
    label = l.itemList[0].labelCode;
  });

  it('records the package in the surgery once, and blocks unreleased packages', async () => {
    expect((await api(enf, 'POST', `/surgeries/${surgeryId}/materials`, { labelCode: label.toLowerCase(), usedAt: null })).statusCode).toBe(201);
    const again = await api(enf, 'POST', `/surgeries/${surgeryId}/materials`, { labelCode: label, usedAt: null });
    expect(again.json().message).toMatch(/já utilizado/);
    const retained = await ctx.db.selectFrom('load_item as i').innerJoin('sterilization_load as l', 'l.id', 'i.load_id').select('i.label_code').where('l.status', 'in', ['retida', 'aguardando']).limit(1).executeTakeFirstOrThrow();
    expect((await api(enf, 'POST', `/surgeries/${surgeryId}/materials`, { labelCode: retained.label_code, usedAt: null })).json().message).toMatch(/não pode ser usado/);
    expect((await api(enf, 'POST', `/surgeries/${surgeryId}/materials`, { labelCode: 'NAO-EXISTE-01', usedAt: null })).json().fields[0].path).toBe('labelCode');
    const detail = (await api(enf, 'GET', `/surgeries/${surgeryId}`)).json();
    expect(detail.materials.map((m: { labelCode: string }) => m.labelCode)).toContain(label);
  });

  it('shows patients in the trace only to profiles that may see them', async () => {
    const asCcih = (await api(enf, 'GET', `/cme/trace?q=${label}`)).json();
    expect(asCcih.rows[0].use.patient.recordNumber).toBeTruthy();
    const asCme = (await api(cme, 'GET', `/cme/trace?q=${label}`)).json();
    expect(asCme.rows[0].use).toMatchObject({ patient: null, surgeryId: null });
    expect(asCme.rows[0].use.procedure).toBeTruthy();
    const record = asCcih.rows[0].use.patient.recordNumber;
    expect((await api(enf, 'GET', `/cme/trace?q=${record}`)).json().rows.some((r: { labelCode: string }) => r.labelCode === label)).toBe(true);
    expect((await api(cme, 'GET', `/cme/trace?q=${record}`)).json().rows).toEqual([]);
  });

  it('raises a recall alert with the exposure once, and never reopens it after closing', async () => {
    const l = await load(cme, releasedLoad);
    expect((await api(cme, 'POST', `/cme/loads/${releasedLoad}/decision`, { status: 'rejeitada', justification: 'IB positivo: recolhimento dos pacotes', rowVersion: l.rowVersion })).statusCode).toBe(200);
    resetAlertThrottle(ctx.institutionId);
    const rows = (await api(enf, 'GET', '/alerts?kind=cme_carga_recolhida&pageSize=100')).json().rows as Array<{ id: string; entityId: string; detail: string; rowVersion: number; priority: string }>;
    const alert = rows.find((a) => a.entityId === releasedLoad)!;
    expect(alert).toMatchObject({ priority: 'critica', category: 'seguranca', blocking: false });
    expect(alert.detail).toMatch(/1 paciente\(s\) em 1 cirurgia/);
    expect((await api(cme, 'POST', `/alerts/${alert.id}/close`, { resolution: 'Pacotes recolhidos e CCIH comunicada', rowVersion: alert.rowVersion })).statusCode).toBe(200);
    // Past the suppression window, an event alert still does not come back.
    await sql`UPDATE alert SET closed_at = now() - interval '3 days' WHERE id = ${alert.id}`.execute(ctx.owner);
    expect((await api(enf, 'POST', '/alerts/refresh')).statusCode).toBe(200);
    const open = await ctx.db.selectFrom('alert').select('id').where('entity_id', '=', releasedLoad).where('status', '<>', 'encerrado').execute();
    expect(open).toEqual([]);
  });

  it('voids a wrong use record with a reason', async () => {
    const use = await ctx.db.selectFrom('material_use').select('id').where('surgery_id', '=', surgeryId).where('voided_at', 'is', null).executeTakeFirstOrThrow();
    expect((await api(enf, 'POST', `/material-uses/${use.id}/void`, { justification: 'curto' })).statusCode).toBe(400);
    expect((await api(enf, 'POST', `/material-uses/${use.id}/void`, { justification: 'Etiqueta lida na cirurgia errada' })).statusCode).toBe(200);
    expect((await api(enf, 'POST', `/material-uses/${use.id}/void`, { justification: 'Etiqueta lida na cirurgia errada' })).statusCode).toBe(409);
  });
});

describe('equipment', () => {
  it('raises an alert for a failed Bowie-Dick and blocks cycles while in maintenance', async () => {
    const av2 = await sterilizer('av2');
    const bd = await api(cme, 'POST', '/cme/tests', { sterilizerId: av2.id, loadId: null, type: 'BOWIE_DICK', result: 'reprovado', performedAt: minutesAgo(0), indicatorLot: 'BD-TESTE', indicatorExpiry: '2099-12-31', incubationStart: null, readAt: null, controlResult: null, notes: null });
    expect(bd.statusCode).toBe(201);
    resetAlertThrottle(ctx.institutionId);
    const kinds = (await api(cme, 'GET', '/alerts?kind=cme_bowie_dick_reprovado')).json().rows;
    const bdAlert = kinds.find((a: { entityId: string }) => a.entityId === av2.id);
    expect(bdAlert).toMatchObject({ priority: 'critica', blocking: true, category: 'seguranca', step: 'esterilizacao' });
    // Blocking: no manual closing while the failed test is the latest of the day and the equipment is in use.
    const refused = await api(cme, 'POST', `/alerts/${bdAlert.id}/close`, { resolution: 'Teste repetido mais tarde', rowVersion: bdAlert.rowVersion });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().message).toMatch(/bloqueante/);
    // The formal exception needs its own permission (not given to the CME profile by default).
    expect((await api(cme, 'POST', `/alerts/${bdAlert.id}/exception`, { note: 'Equipamento usado só para carga de emergência', rowVersion: bdAlert.rowVersion })).statusCode).toBe(403);
    expect((await api(cme, 'GET', '/alerts?blocking=1&priority=critica&category=seguranca')).json().rows.some((a: { id: string }) => a.id === bdAlert.id)).toBe(true);
    expect((await api(cme, 'GET', '/alerts?category=pendencia_tempo')).json().rows.some((a: { id: string }) => a.id === bdAlert.id)).toBe(false);
    const summary = (await api(cme, 'GET', '/alerts/summary')).json();
    expect(summary.blocking).toBeGreaterThanOrEqual(1);
    expect(summary.byPriority.critica).toBeGreaterThanOrEqual(1);
    // CCIH (alerts:exception) can accept the risk formally: the alert closes and is not raised again.
    const exc = await api(enf, 'POST', `/alerts/${bdAlert.id}/exception`, { note: 'Ciclo de emergência autorizado pela CCIH e RT da CME', rowVersion: bdAlert.rowVersion });
    expect(exc.statusCode).toBe(200);
    resetAlertThrottle(ctx.institutionId);
    const after = (await api(enf, 'GET', '/alerts?kind=cme_bowie_dick_reprovado&status=todos')).json().rows.filter((a: { entityId: string }) => a.entityId === av2.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'encerrado', closedReason: 'excecao' });
    const history = (await api(enf, 'GET', `/alerts/${bdAlert.id}`)).json().actions.map((x: { action: string }) => x.action);
    expect(history).toEqual(['criado', 'excecao', 'visualizado']);
    const put = await api(cme, 'PUT', `/cme/sterilizers/${av2.id}`, { code: av2.code, name: av2.name, type: av2.type, serial: av2.serial, sectorId: av2.sector_id, status: 'manutencao', statusReason: 'Bowie-Dick reprovado; aguardando assistência técnica', qualificationDueOn: av2.qualification_due_on, rowVersion: av2.row_version, justification: J });
    expect(put.statusCode).toBe(200);
    const blocked = await api(cme, 'POST', '/cme/loads', { sterilizerId: av2.id, program: 'Instrumental 134 °C', startedAt: minutesAgo(5), notes: null, reprocessedFromId: null, items: [{ setId: await setId('cx-hernia'), description: null, quantity: 1, packaging: null, implant: null }] });
    expect(blocked.json().message).toMatch(/manutenção/);
    expect((await api(cme, 'POST', '/alerts/refresh')).statusCode).toBe(200);
    const open = await ctx.db.selectFrom('alert').select('id').where('kind', '=', 'cme_bowie_dick_reprovado').where('status', '<>', 'encerrado').execute();
    expect(open).toEqual([]);
  });

  it('requires cme:configure and a reason to block equipment', async () => {
    const av1 = await sterilizer('av1');
    const body = { code: av1.code, name: av1.name, type: av1.type, serial: av1.serial, sectorId: av1.sector_id, status: 'manutencao', statusReason: null, qualificationDueOn: null, rowVersion: av1.row_version, justification: J };
    expect((await api(enf, 'PUT', `/cme/sterilizers/${av1.id}`, body)).statusCode).toBe(403);
    expect((await api(cme, 'PUT', `/cme/sterilizers/${av1.id}`, body)).json().fields[0].path).toBe('statusReason');
  });
});

describe('attachments', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const upload = (s: Session, testId: string, body: Buffer, type: string, name = 'folha%20BD.png') =>
    ctx.app.inject({ method: 'POST', url: `/api/attachments?entity=sterilization_test&entityId=${testId}`, headers: { ...s.headers, 'content-type': type, 'x-file-name': name }, payload: body });

  it('accepts evidence by content, stores it outside the database and serves it as a download', async () => {
    const test = await ctx.db.selectFrom('sterilization_test').select('id').where('type', '=', 'BOWIE_DICK').limit(1).executeTakeFirstOrThrow();
    const res = await upload(cme, test.id, png, 'image/png');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ fileName: 'folha BD.png', mime: 'image/png', size: png.length });
    const down = await api(enf, 'GET', `/attachments/${res.json().id}`);
    expect(down.statusCode).toBe(200);
    expect(down.headers['content-disposition']).toMatch(/^attachment;/);
    expect(down.rawPayload.equals(png)).toBe(true);
    expect((await api(consulta, 'GET', `/attachments/${res.json().id}`)).statusCode).toBe(403);
    const logged = await ctx.db.selectFrom('audit_log').select(['after']).where('action', '=', 'upload').executeTakeFirstOrThrow();
    expect(JSON.stringify(logged.after)).not.toContain('iVBOR');
  });

  it('refuses disguised, active or oversized files', async () => {
    const test = await ctx.db.selectFrom('sterilization_test').select('id').where('type', '=', 'IQ5').limit(1).executeTakeFirstOrThrow();
    expect((await upload(cme, test.id, Buffer.from('<script>alert(1)</script>'), 'image/png')).json().message).toMatch(/Formato não aceito/);
    expect((await upload(cme, test.id, png, 'application/pdf')).json().message).toMatch(/não corresponde/);
    expect((await upload(cme, test.id, Buffer.from('%PDF-1.7\n1 0 obj << /OpenAction 2 0 R /JS (app.alert(1)) >> endobj'), 'application/pdf')).json().message).toMatch(/conteúdo ativo/);
    expect((await upload(cme, test.id, Buffer.concat([png, Buffer.alloc(1_100_000)]), 'image/png')).statusCode).toBe(413);
    expect((await upload(consulta, test.id, png, 'image/png')).statusCode).toBe(403);
  });

  it('attaches training evidence with the training permissions', async () => {
    const session = await ctx.db.selectFrom('training_session').select('id').limit(1).executeTakeFirstOrThrow();
    const send = (s: Session) => ctx.app.inject({ method: 'POST', url: `/api/attachments?entity=training_session&entityId=${session.id}`, headers: { ...s.headers, 'content-type': 'image/png', 'x-file-name': 'lista.png' }, payload: png });
    expect((await send(cme)).statusCode).toBe(403);
    expect((await send(enf)).statusCode).toBe(201);
    const listed = (await api(enf, 'GET', '/trainings')).json().sessions.find((x: { id: string }) => x.id === session.id);
    expect(listed.attachments.map((f: { fileName: string }) => f.fileName)).toEqual(['lista.png']);
  });
});

describe('CME indicators', () => {
  it('consolidates cycles, tests and traceability from the records', async () => {
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 8) + '01';
    const r = (await api(enf, 'POST', '/facts/consolidate', { months: [month] })).json();
    expect(r.metrics).toEqual(expect.arrayContaining(['cme_ciclos', 'cme_bd_realizados', 'cme_caixas_rastreadas']));
    const facts = await ctx.db.selectFrom('indicator_fact').select(['metric', 'value']).where('period', '=', month).where('metric', 'like', 'cme_%').execute();
    const v = Object.fromEntries(facts.map((f) => [f.metric, f.value]));
    expect(v.cme_ciclos).toBeGreaterThan(0);
    expect(v.cme_caixas_rastreadas).toBeLessThanOrEqual(v.cme_caixas_usadas!);
    expect(v.cme_ciclos_conformes! + (v.cme_ciclos_nao_conformes ?? 0)).toBe(v.cme_ciclos);
  });
});
