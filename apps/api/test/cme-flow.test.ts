import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { login, setupTestApp, teardown, type Session, type TestContext } from './helpers';

let ctx: TestContext;
let cme: Session;
let enf: Session;
let consulta: Session;
const api = (s: Session, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, cookie?: string) =>
  ctx.app.inject({ method, url: `/api${url}`, headers: { ...s.headers, ...(cookie ? { cookie: `${s.headers.cookie}; ${cookie}` } : {}) }, ...(payload !== undefined ? { payload: payload as object } : {}) });
const J = 'Registro de teste do fluxo da CME';
const station = async (name: string) => (await ctx.db.selectFrom('scan_station').select('id').where('name', '=', name).executeTakeFirstOrThrow()).id;
const sector = async (code: string) => (await ctx.db.selectFrom('sector').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

interface ScanOpts { outcome?: string; destinationSectorId?: string; loadId?: string; clientEventId?: string; inputMethod?: string; justification?: string; override?: boolean; packaging?: string; cookie?: string; deviceAt?: string }
async function read(s: Session, stationName: string, step: string, code: string, o: ScanOpts = {}) {
  const res = await api(s, 'POST', '/cme/scan', {
    stationId: await station(stationName), code, inputMethod: o.inputMethod ?? 'leitor', step, clientEventId: o.clientEventId ?? null, deviceAt: o.deviceAt ?? null,
    outcome: o.outcome ?? null, destinationSectorId: o.destinationSectorId ?? null, originSectorId: null, loadId: o.loadId ?? null, packaging: o.packaging ?? null,
    justification: o.justification ?? null, override: o.override ?? false,
  }, o.cookie);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

async function newAsset(setCode = 'otica-30') {
  const setId = (await ctx.db.selectFrom('instrument_set').select('id').where('code', '=', setCode).executeTakeFirstOrThrow()).id;
  const res = await api(cme, 'POST', '/cme/assets', { setId, count: 1, tag: null, justification: J });
  expect(res.statusCode).toBe(201);
  return res.json().assets[0].code as string;
}

async function releasePlasmaLoad(loadId: string) {
  // The load was assembled "now"; place the assembly two hours back so a past cycle start is valid.
  await sql`UPDATE sterilization_load SET created_at = now() - interval '2 hours' WHERE id = ${loadId}`.execute(ctx.owner);
  let l = (await api(cme, 'GET', `/cme/loads/${loadId}`)).json();
  expect((await api(cme, 'POST', `/cme/loads/${loadId}/start`, { startedAt: minutesAgo(60), rowVersion: l.rowVersion })).statusCode).toBe(200);
  l = (await api(cme, 'GET', `/cme/loads/${loadId}`)).json();
  expect((await api(cme, 'POST', `/cme/loads/${loadId}/cycle`, { endedAt: minutesAgo(10), temperatureC: 50, pressureKpa: null, exposureMinutes: 28, physicalResult: 'conforme', notes: null, rowVersion: l.rowVersion })).statusCode).toBe(200);
  expect((await api(cme, 'POST', '/cme/tests', { sterilizerId: null, loadId, type: 'IQ5', result: 'aprovado', performedAt: minutesAgo(5), indicatorLot: 'L1', indicatorExpiry: '2099-12-31', incubationStart: null, readAt: null, controlResult: null, notes: null })).statusCode).toBe(201);
  l = (await api(cme, 'GET', `/cme/loads/${loadId}`)).json();
  expect((await api(cme, 'POST', `/cme/loads/${loadId}/decision`, { status: 'liberada', justification: 'Testes conformes', rowVersion: l.rowVersion })).statusCode).toBe(200);
}

async function assemblyLoad() {
  const pl1 = (await ctx.db.selectFrom('sterilizer').select('id').where('code', '=', 'pl1').executeTakeFirstOrThrow()).id;
  const res = await api(cme, 'POST', '/cme/loads', { sterilizerId: pl1, program: 'Plasma — ciclo padrão', startedAt: null, notes: null, reprocessedFromId: null, items: [] });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; code: string };
}

beforeAll(async () => {
  ctx = await setupTestApp();
  [cme, enf, consulta] = await Promise.all([login(ctx.app, 'cme'), login(ctx.app, 'enf.ccih'), login(ctx.app, 'consulta')]);
});
afterAll(async () => teardown(ctx));

describe('continuous traceability from reception to use and back', () => {
  it('follows the material through every step, refusing what does not fit', async () => {
    const asset = await newAsset();
    expect(await read(cme, 'Expurgo — recepção', 'recepcao', `]C0${asset.toLowerCase()}\r\n`)).toMatchObject({ result: 'aceita', process: { currentStep: 'recepcao', state: 'em_processo' } });
    expect(await read(cme, 'Limpeza', 'limpeza', asset)).toMatchObject({ result: 'aceita' });
    expect(await read(cme, 'Inspeção e preparo', 'preparo', asset)).toMatchObject({ result: 'etapa_incorreta', message: 'Etapa obrigatória pendente: Inspeção.' });
    expect(await read(cme, 'Limpeza', 'limpeza', asset)).toMatchObject({ result: 'duplicada' });
    expect(await read(cme, 'Inspeção e preparo', 'inspecao', asset)).toMatchObject({ result: 'requer_conferencia' });
    expect((await read(cme, 'Inspeção e preparo', 'inspecao', asset, { outcome: 'aprovado' })).result).toBe('aceita');
    expect((await read(cme, 'Inspeção e preparo', 'preparo', asset)).result).toBe('aceita');
    expect((await read(cme, 'Embalagem', 'embalagem', asset, { packaging: 'papel_grau_cirurgico' })).result).toBe('aceita');

    // Assembly: the load code selects the load; reading the material creates the package label.
    const load = await assemblyLoad();
    expect(await read(cme, 'Montagem de carga', 'esterilizacao', asset)).toMatchObject({ result: 'requer_conferencia', message: /código da carga/ });
    expect(await read(cme, 'Montagem de carga', 'esterilizacao', load.code)).toMatchObject({ result: 'aceita', load: { id: load.id, packages: 0 } });
    const packed = await read(cme, 'Montagem de carga', 'esterilizacao', asset, { loadId: load.id });
    expect(packed).toMatchObject({ result: 'aceita', load: { packages: 1 }, process: { packageLabel: `${load.code}-01`, loadId: load.id } });
    const label = packed.process.packageLabel as string;
    const item = await ctx.db.selectFrom('load_item').select(['packaging', 'process_id']).where('label_code', '=', label).executeTakeFirstOrThrow();
    expect(item).toMatchObject({ packaging: 'papel_grau_cirurgico', process_id: packed.process.id });

    // Nothing leaves before release.
    const cc = await sector('centro-cirurgico');
    expect(await read(cme, 'Expedição', 'distribuicao', label, { destinationSectorId: cc })).toMatchObject({ result: 'carga_nao_liberada', message: /montagem/ });
    await releasePlasmaLoad(load.id);
    expect(await read(cme, 'Montagem de carga', 'esterilizacao', asset, { loadId: load.id })).toMatchObject({ result: 'etapa_incorreta', message: /já começou/ });
    expect(await read(cme, 'Expedição', 'distribuicao', label, { destinationSectorId: await sector('cme') })).toMatchObject({ result: 'destino_incompativel' });
    expect(await read(cme, 'Expedição', 'distribuicao', label, { destinationSectorId: cc })).toMatchObject({ result: 'aceita', process: { state: 'distribuido', destinationSectorId: cc } });

    // Use in surgery, then the box comes back dirty: a new round starts at reception.
    const surgery = (await ctx.db.selectFrom('surgery').select('id').orderBy('started_at', 'desc').limit(1).executeTakeFirstOrThrow()).id;
    const used = await api(enf, 'POST', `/surgeries/${surgery}/materials`, { labelCode: label, usedAt: null });
    expect(used.statusCode).toBe(201);
    expect(used.json()).toMatchObject({ withoutExit: false, nonconformityId: null });
    const again = await read(cme, 'Expurgo — recepção', 'recepcao', asset);
    expect(again).toMatchObject({ result: 'aceita', process: { currentStep: 'recepcao' } });
    const previous = await ctx.db.selectFrom('cme_process').select(['state', 'closed_at']).where('id', '=', packed.process.id).executeTakeFirstOrThrow();
    expect(previous.state).toBe('encerrado');
    const detail = (await api(cme, 'GET', `/cme/processes/${again.process.id}`)).json();
    expect(detail.previousProcessId).toBe(packed.process.id);
    const history = (await api(cme, 'GET', `/cme/processes/${packed.process.id}`)).json();
    expect(history.events.filter((e: { result: string }) => e.result === 'aceita').map((e: { step: string }) => e.step))
      .toEqual(['recepcao', 'limpeza', 'inspecao', 'preparo', 'embalagem', 'esterilizacao', 'distribuicao']);
    expect(history.events.every((e: { userName: string; stationName: string; serverAt: string }) => e.userName && e.stationName && e.serverAt)).toBe(true);
  });

  it('never blocks a use without registered exit: it opens a non-conformity and notifies the user who recorded it', async () => {
    const asset = await newAsset();
    for (const [st, step, outcome] of [['Expurgo — recepção', 'recepcao'], ['Limpeza', 'limpeza'], ['Inspeção e preparo', 'inspecao', 'aprovado'], ['Inspeção e preparo', 'preparo'], ['Embalagem', 'embalagem']] as const) {
      expect((await read(cme, st, step, asset, outcome ? { outcome } : {})).result).toBe('aceita');
    }
    const load = await assemblyLoad();
    const label = (await read(cme, 'Montagem de carga', 'esterilizacao', asset, { loadId: load.id })).process.packageLabel;
    await releasePlasmaLoad(load.id);
    const surgery = (await ctx.db.selectFrom('surgery').select('id').orderBy('started_at', 'desc').limit(1).executeTakeFirstOrThrow()).id;
    // The old blocking date no longer exists in the flow settings.
    const config = (await api(cme, 'GET', '/cme/flow-config')).json();
    expect(Object.keys(config).sort()).toEqual(['rowVersion', 'separationRequired', 'storageRequired']);
    expect((await api(cme, 'PUT', '/cme/flow-config', { ...config, exitRequiredFrom: '2020-01-01', justification: J })).statusCode).toBe(400);

    const before = (await api(enf, 'GET', '/me/notifications')).json().unread as number;
    const res = await api(enf, 'POST', `/surgeries/${surgery}/materials`, { labelCode: label, usedAt: null });
    expect(res.statusCode).toBe(201);
    const { id: useId, withoutExit, nonconformityId } = res.json();
    expect(withoutExit).toBe(true);
    const enfUser = await ctx.db.selectFrom('app_user').select('id').where('login', '=', 'enf.ccih').executeTakeFirstOrThrow();
    const nc = await ctx.db.selectFrom('nonconformity').selectAll().where('id', '=', nonconformityId).executeTakeFirstOrThrow();
    expect(nc).toMatchObject({ origin: 'cme', status: 'aberta', notified_user_id: enfUser.id, source_entity: 'material_use', source_id: useId });
    expect(nc.description).toContain(label);
    expect(nc.description).toMatch(/sem saída registrada do CME/);
    const process = await ctx.db.selectFrom('cme_process').select('state').where('asset_id', '=', (await ctx.db.selectFrom('instrument_asset').select('id').where('code', '=', asset).executeTakeFirstOrThrow()).id).executeTakeFirstOrThrow();
    expect(process.state).toBe('distribuido');
    expect(await ctx.db.selectFrom('audit_log').select('id').where('entity', '=', 'nonconformity').where('entity_id', '=', nonconformityId).executeTakeFirst()).toBeTruthy();

    // The NC shows where it came from and who was notified.
    const dto = (await api(enf, 'GET', `/quality/nonconformities/${nonconformityId}`)).json();
    expect(dto).toMatchObject({ source: { entity: 'material_use', id: useId }, notifiedUserName: expect.any(String) });

    // Only the user who recorded the use receives the notification.
    const inbox = (await api(enf, 'GET', '/me/notifications')).json();
    expect(inbox.unread).toBe(before + 1);
    const note = inbox.rows.find((n: { entityId: string }) => n.entityId === nonconformityId);
    expect(note).toMatchObject({ kind: 'nao_conformidade', link: `/auditorias/nao-conformidades/${nonconformityId}`, readAt: null });
    expect((await api(cme, 'GET', '/me/notifications?situacao=todas')).json().rows.some((n: { entityId: string }) => n.entityId === nonconformityId)).toBe(false);
    expect((await api(cme, 'POST', `/me/notifications/${note.id}/read`)).statusCode).toBe(404);
    expect((await api(enf, 'POST', `/me/notifications/${note.id}/read`)).statusCode).toBe(200);
    expect((await api(enf, 'GET', '/me/notifications')).json().unread).toBe(before);
    expect((await api(enf, 'GET', '/me/notifications?situacao=todas')).json().rows.find((n: { id: string }) => n.id === note.id).readAt).toBeTruthy();
    // Notifications are kept: the database refuses to delete them.
    await expect(ctx.owner.deleteFrom('user_notification').where('id', '=', note.id).execute()).rejects.toThrow(/não podem ser excluídos/);
  });

  it('needs no justification for a manual conference, and the material goes on to the next step', async () => {
    const asset = await newAsset();
    expect(await read(cme, 'Expurgo — recepção', 'recepcao', asset, { inputMethod: 'manual' })).toMatchObject({ result: 'aceita', process: { nextSteps: ['limpeza'] } });
    expect(await read(cme, 'Limpeza', 'limpeza', asset, { inputMethod: 'manual' })).toMatchObject({ result: 'aceita', process: { currentStep: 'limpeza', nextSteps: ['inspecao'] } });
  });

  it('raises an alert for a use without registered exit', async () => {
    const { resetAlertThrottle } = await import('../src/services/alerts');
    resetAlertThrottle(ctx.institutionId);
    const rows = (await api(cme, 'GET', '/alerts?kind=cme_uso_sem_saida&pageSize=100')).json().rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].link).toMatch(/^\/cme\/processos\//);
  });

  it('enforces storage and separation when the institution requires them, and handles returns', async () => {
    const config = (await api(cme, 'GET', '/cme/flow-config')).json();
    expect((await api(cme, 'PUT', '/cme/flow-config', { ...config, storageRequired: true, separationRequired: true, justification: J })).statusCode).toBe(200);
    const asset = await newAsset();
    for (const [st, step, outcome] of [['Expurgo — recepção', 'recepcao'], ['Limpeza', 'limpeza'], ['Inspeção e preparo', 'inspecao', 'aprovado'], ['Inspeção e preparo', 'preparo'], ['Embalagem', 'embalagem']] as const) {
      expect((await read(cme, st, step, asset, outcome ? { outcome } : {})).result).toBe('aceita');
    }
    const load = await assemblyLoad();
    await read(cme, 'Montagem de carga', 'esterilizacao', asset, { loadId: load.id });
    await releasePlasmaLoad(load.id);
    const cc = await sector('centro-cirurgico');
    const uti = await sector('uti-adulto');
    expect(await read(cme, 'Expedição', 'distribuicao', asset, { destinationSectorId: cc })).toMatchObject({ result: 'etapa_incorreta', message: 'Etapa obrigatória pendente: Armazenamento.' });
    expect((await read(cme, 'Arsenal', 'armazenamento', asset)).result).toBe('aceita');
    expect(await read(cme, 'Arsenal', 'separacao', asset)).toMatchObject({ result: 'requer_conferencia' });
    expect((await read(cme, 'Arsenal', 'separacao', asset, { destinationSectorId: cc })).result).toBe('aceita');
    expect(await read(cme, 'Expedição', 'distribuicao', asset, { destinationSectorId: uti })).toMatchObject({ result: 'destino_incompativel' });
    expect((await read(cme, 'Expedição', 'distribuicao', asset, { destinationSectorId: cc })).result).toBe('aceita');
    expect(await read(cme, 'Devoluções', 'devolucao', asset, { outcome: 'retorno_estoque' })).toMatchObject({ result: 'aceita', process: { state: 'liberado' } });
    expect(await read(cme, 'Devoluções', 'devolucao', asset, { outcome: 'reprocessar' })).toMatchObject({ result: 'aceita', process: { state: 'devolvido' } });
    const now = (await api(cme, 'GET', '/cme/flow-config')).json();
    expect((await api(cme, 'PUT', '/cme/flow-config', { ...now, storageRequired: false, separationRequired: false, justification: J })).statusCode).toBe(200);
  });

  it('brings packages issued before the flow into it at the first reading', async () => {
    const legacy = await ctx.db.selectFrom('load_item as i').innerJoin('sterilization_load as l', 'l.id', 'i.load_id').leftJoin('material_use as u', 'u.item_id', 'i.id')
      .select('i.label_code').where('l.status', '=', 'liberada').where('i.process_id', 'is', null).where('u.id', 'is', null).where('i.expires_on', '>=', new Date().toISOString().slice(0, 10))
      .orderBy('l.started_at', 'desc').limit(1).executeTakeFirstOrThrow();
    const res = await read(cme, 'Expedição', 'distribuicao', legacy.label_code, { destinationSectorId: await sector('uti-adulto') });
    expect(res).toMatchObject({ result: 'aceita', process: { legacy: true, state: 'distribuido' } });
  });
});

describe('reading validation', () => {
  it('records refused readings with a typed result and never moves the process', async () => {
    expect(await read(cme, 'Expurgo — recepção', 'recepcao', 'HOSP-99999')).toMatchObject({ result: 'codigo_desconhecido', message: /não foi emitido/ });
    expect(await read(cme, 'Expurgo — recepção', 'recepcao', 'AT-ABCDEFG1')).toMatchObject({ result: 'codigo_desconhecido' });
    const asset = await newAsset();
    const typo = asset.slice(0, 4) + (asset[4] === 'A' ? 'B' : 'A') + asset.slice(5);
    expect((await read(cme, 'Expurgo — recepção', 'recepcao', typo)).message).toMatch(/Dígito verificador/);
    expect(await read(cme, 'Limpeza', 'recepcao', asset)).toMatchObject({ result: 'estacao_invalida', message: /não registra recepção/ });
    expect(await read(cme, 'Limpeza', 'limpeza', asset)).toMatchObject({ result: 'etapa_incorreta', message: 'Material sem recepção registrada na CME.' });
    const recorded = await ctx.db.selectFrom('cme_scan_event').select(['result']).where('raw_code', 'in', ['HOSP-99999', typo, asset]).execute();
    expect(recorded.map((r) => r.result).sort()).toEqual(['codigo_desconhecido', 'codigo_desconhecido', 'estacao_invalida', 'etapa_incorreta']);
    await expect(sql`UPDATE cme_scan_event SET result = 'aceita'`.execute(ctx.db)).rejects.toThrow();
  });

  it('applies the same reading once when the station sends it twice', async () => {
    const asset = await newAsset();
    const clientEventId = randomUUID();
    const first = await read(cme, 'Expurgo — recepção', 'recepcao', asset, { clientEventId, deviceAt: minutesAgo(1) });
    const second = await read(cme, 'Expurgo — recepção', 'recepcao', asset, { clientEventId });
    expect(second).toMatchObject({ replay: true, eventId: first.eventId, result: 'aceita' });
    const events = await ctx.db.selectFrom('cme_scan_event').select(['device_at']).where('client_event_id', '=', clientEventId).execute();
    expect(events).toHaveLength(1);
    expect(events[0]!.device_at).not.toBeNull();
  });

  it('allows a sequence exception only with permission and a reason, never past a safety block', async () => {
    const asset = await newAsset();
    await read(cme, 'Expurgo — recepção', 'recepcao', asset);
    const res = await api(cme, 'POST', '/cme/scan', { stationId: await station('Inspeção e preparo'), code: asset, inputMethod: 'manual', step: 'inspecao', clientEventId: null, deviceAt: null, outcome: 'aprovado', destinationSectorId: null, originSectorId: null, loadId: null, packaging: null, justification: 'curta', override: true });
    expect(res.statusCode).toBe(400);
    const ok = await read(cme, 'Inspeção e preparo', 'inspecao', asset, { outcome: 'aprovado', override: true, justification: 'Lavadora registrou o ciclo; leitura não feita na limpeza', inputMethod: 'manual' });
    expect(ok).toMatchObject({ result: 'excecao_autorizada', process: { currentStep: 'inspecao' } });
    const logged = await ctx.db.selectFrom('audit_log').select('context').where('entity', '=', 'cme_process').where('entity_id', '=', ok.process.id).executeTakeFirstOrThrow();
    expect(logged.context).toMatchObject({ exception: true });
    expect((await api(enf, 'POST', '/cme/scan', { stationId: await station('Limpeza'), code: asset, inputMethod: 'manual', step: 'limpeza', clientEventId: null, deviceAt: null, outcome: null, destinationSectorId: null, originSectorId: null, loadId: null, packaging: null, justification: null, override: false })).statusCode).toBe(403);
  });

  it('issues a process code for loose material and follows it like an asset', async () => {
    const res = await api(cme, 'POST', '/cme/processes/loose', { stationId: await station('Expurgo — recepção'), description: 'Pinças avulsas (3)', setId: null, originSectorId: null, clientEventId: null });
    expect(res.statusCode).toBe(201);
    const code = res.json().process.code as string;
    expect(code).toMatch(/^PR-/);
    expect((await read(cme, 'Limpeza', 'limpeza', code)).result).toBe('aceita');
  });
});

describe('stations', () => {
  it('requires a paired workstation when configured and records the device', async () => {
    const id = await station('Limpeza');
    const st = (await api(cme, 'GET', '/cme/stations')).json().stations.find((s: { id: string }) => s.id === id);
    const body = { sectorId: st.sectorId, name: st.name, location: st.location, steps: st.steps, inputMethods: st.inputMethods, symbologies: st.symbologies, deviceLabel: null, responsibleUserId: null, requirePairing: true, scanConfig: st.scanConfig, enabled: true, rowVersion: st.rowVersion, justification: J };
    expect((await api(cme, 'PUT', `/cme/stations/${id}`, body)).statusCode).toBe(200);
    const asset = await newAsset();
    await read(cme, 'Expurgo — recepção', 'recepcao', asset);
    expect(await read(cme, 'Limpeza', 'limpeza', asset)).toMatchObject({ result: 'estacao_invalida', message: /não está pareado/ });
    const pair = await api(cme, 'POST', `/cme/stations/${id}/pair`, { label: 'Computador da limpeza 1' });
    expect(pair.statusCode).toBe(201);
    const cookie = pair.cookies.find((c) => c.name === 'ccih_station')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
    const ok = await read(cme, 'Limpeza', 'limpeza', asset, { cookie: `ccih_station=${cookie.value}` });
    expect(ok.result).toBe('aceita');
    const ev = await ctx.db.selectFrom('cme_scan_event').select('device_id').where('id', '=', ok.eventId).executeTakeFirstOrThrow();
    expect(ev.device_id).toBe(pair.json().deviceId);
    expect((await api(cme, 'GET', '/cme/stations/this', undefined, `ccih_station=${cookie.value}`)).json().station.id).toBe(id);
    expect((await api(cme, 'POST', `/cme/stations/devices/${pair.json().deviceId}/revoke`, {})).statusCode).toBe(200);
    expect((await read(cme, 'Inspeção e preparo', 'inspecao', asset, { outcome: 'aprovado', cookie: `ccih_station=${cookie.value}` })).result).toBe('aceita');
    const back = { ...body, requirePairing: false, rowVersion: st.rowVersion + 1 };
    expect((await api(cme, 'PUT', `/cme/stations/${id}`, back)).statusCode).toBe(200);
  });

  it('keeps the module closed to profiles without CME access', async () => {
    expect((await api(consulta, 'GET', '/cme/stations')).statusCode).toBe(403);
    expect((await api(consulta, 'GET', '/cme/processes')).statusCode).toBe(403);
  });

  it('lists every sector as a destination for the CME, even with its clinical scope limited to the CME', async () => {
    const res = await api(cme, 'GET', '/cme/sectors');
    expect(res.statusCode).toBe(200);
    const names = res.json<{ sectors: Array<{ name: string; kind: string }> }>().sectors;
    expect(names.some((s) => s.kind === 'centro_cirurgico')).toBe(true);
    expect(names.length).toBeGreaterThan(1);
    expect(Object.keys(res.json<{ sectors: object[] }>().sectors[0]!).sort()).toEqual(['active', 'code', 'id', 'kind', 'name']);
    expect((await api(consulta, 'GET', '/cme/sectors')).statusCode).toBe(403);
  });
});
