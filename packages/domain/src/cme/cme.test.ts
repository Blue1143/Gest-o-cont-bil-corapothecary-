import { describe, expect, it } from 'vitest';
import { evaluateLoadRelease, type LoadReleasePolicy } from '../rules/sterilization';
import { buildAlertCandidates, type AlertInput } from '../operations/alerts';
import { checkItemUse, checkLoadDecision, checkTestRecord, itemLabel, loadCode, sterileUntil, type TestRecordInput } from './cme';
import { consolidateCmeFacts } from './consolidation';

const policy: LoadReleasePolicy = { requiredLoadTests: ['IQ5', 'REGISTRO_FISICO'], requireDailyBowieDick: true, holdImplantsUntilBiological: true, referenceId: null };
const ok = [{ type: 'IQ5' as const, result: 'aprovado' as const }, { type: 'REGISTRO_FISICO' as const, result: 'aprovado' as const }];

const test = (over: Partial<TestRecordInput>): TestRecordInput => ({
  type: 'IQ5', result: 'aprovado', performedOn: '2026-10-09', indicatorLot: 'L123', indicatorExpiry: '2027-01-31', sterilizerType: 'vapor_prevacuo', ...over,
});

describe('test records', () => {
  it('requires a valid indicator lot on the test date', () => {
    expect(checkTestRecord(test({}))).toEqual([]);
    expect(checkTestRecord(test({ indicatorLot: ' ' })).map((p) => p.path)).toEqual(['indicatorLot']);
    expect(checkTestRecord(test({ indicatorExpiry: '2026-10-08' }))[0]?.message).toMatch(/vencido/);
  });

  it('accepts Bowie-Dick only on pre-vacuum steam sterilizers, with an immediate reading', () => {
    expect(checkTestRecord(test({ type: 'BOWIE_DICK', sterilizerType: 'peroxido_plasma' }))[0]?.path).toBe('type');
    expect(checkTestRecord(test({ type: 'BOWIE_DICK', result: 'pendente' }))[0]?.path).toBe('result');
  });

  it('validates the biological indicator incubation, reading and control', () => {
    const ib = (o: Partial<TestRecordInput>) => test({ type: 'IB', incubationStart: '2026-10-09T10:00:00Z', ...o });
    expect(checkTestRecord(ib({ result: 'pendente' }))).toEqual([]);
    expect(checkTestRecord(ib({ result: 'pendente', incubationStart: null }))[0]?.path).toBe('incubationStart');
    expect(checkTestRecord(ib({ readAt: '2026-10-10T10:00:00Z' })).map((p) => p.path)).toEqual(['controlResult']);
    expect(checkTestRecord(ib({ readAt: '2026-10-10T10:00:00Z', controlResult: 'negativo' }))[0]?.message).toMatch(/invalida/);
    expect(checkTestRecord(ib({ readAt: '2026-10-09T09:00:00Z', controlResult: 'positivo' }))[0]?.path).toBe('readAt');
    expect(checkTestRecord(ib({ readAt: '2026-10-10T10:00:00Z', controlResult: 'positivo' }))).toEqual([]);
  });
});

describe('load release decisions', () => {
  it('does not require Bowie-Dick where it does not apply', () => {
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false, bowieDickApplies: false }, policy).status).toBe('liberada');
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false }, policy).status).toBe('aguardando');
  });

  it('only releases what the policy allows and always asks for a reason', () => {
    const blocked = evaluateLoadRelease({ tests: [], hasImplant: false, equipmentBowieDick: 'aprovado' }, policy);
    expect(checkLoadDecision('aguardando', 'liberada', blocked, 'Liberação da carga')[0]?.message).toMatch(/política não permite/);
    const allowed = evaluateLoadRelease({ tests: ok, hasImplant: false, equipmentBowieDick: 'aprovado' }, policy);
    expect(checkLoadDecision('aguardando', 'liberada', allowed, 'Testes conformes')).toEqual([]);
    expect(checkLoadDecision('aguardando', 'retida', blocked, 'curto')[0]?.path).toBe('justification');
    expect(checkLoadDecision('aguardando', 'liberada', evaluateLoadRelease({ tests: ok, hasImplant: false }, undefined), 'Testes conformes')[0]?.message).toMatch(/Sem política/);
  });

  it('allows only a recall after release and nothing after a rejection', () => {
    const allowed = evaluateLoadRelease({ tests: ok, hasImplant: false, equipmentBowieDick: 'aprovado' }, policy);
    expect(checkLoadDecision('liberada', 'rejeitada', allowed, 'IB positivo na leitura de 48 h')).toEqual([]);
    expect(checkLoadDecision('liberada', 'retida', allowed, 'IB positivo na leitura de 48 h')[0]?.path).toBe('status');
    expect(checkLoadDecision('rejeitada', 'liberada', allowed, 'Reavaliação da carga')[0]?.path).toBe('status');
  });
});

describe('package use', () => {
  it('blocks unreleased, expired or already used packages', () => {
    expect(checkItemUse({ loadStatus: 'liberada', expiresOn: '2026-11-08', alreadyUsed: false }, '2026-10-09')).toEqual([]);
    expect(checkItemUse({ loadStatus: 'retida', expiresOn: null, alreadyUsed: false }, '2026-10-09')[0]?.message).toMatch(/retida/);
    expect(checkItemUse({ loadStatus: 'liberada', expiresOn: '2026-10-08', alreadyUsed: false }, '2026-10-09')[0]?.message).toMatch(/vencida em 08\/10\/2026/);
    expect(checkItemUse({ loadStatus: 'liberada', expiresOn: null, alreadyUsed: true }, '2026-10-09')).toHaveLength(1);
  });

  it('computes expiry only with a configured shelf life and builds stable codes', () => {
    expect(sterileUntil('2026-10-09', 30)).toBe('2026-11-08');
    expect(sterileUntil('2026-10-09', undefined)).toBeNull();
    expect(loadCode('av1', '2026-10-09', 3)).toBe('AV1-261009-03');
    expect(itemLabel('AV1-261009-03', 7)).toBe('AV1-261009-03-07');
  });
});

describe('CME consolidation', () => {
  it('derives cycles, tests, loads and traceability from the records', () => {
    const [row, ...rest] = consolidateCmeFacts({
      months: ['2026-09-01'],
      loads: [
        { date: '2026-09-02', sectorId: 'cme', physical: 'conforme', status: 'liberada', everRetained: true },
        { date: '2026-09-03', sectorId: 'cme', physical: 'nao_conforme', status: 'reprocessamento', everRetained: false },
        { date: '2026-09-03', sectorId: 'cme', physical: null, status: 'aguardando', everRetained: false },
        { date: '2026-10-01', sectorId: 'cme', physical: 'conforme', status: 'liberada', everRetained: false },
      ],
      tests: [
        { date: '2026-09-02', sectorId: 'cme', type: 'BOWIE_DICK', result: 'aprovado' },
        { date: '2026-09-03', sectorId: 'cme', type: 'BOWIE_DICK', result: 'reprovado' },
        { date: '2026-09-02', sectorId: 'cme', type: 'IQ5', result: 'aprovado' },
        { date: '2026-09-02', sectorId: 'cme', type: 'IB', result: 'aprovado' },
        { date: '2026-09-03', sectorId: 'cme', type: 'IB', result: 'pendente' },
      ],
      setUses: [{ date: '2026-09-05', sectorId: 'cme', traced: true }, { date: '2026-09-06', sectorId: 'cme', traced: false }],
      nonconformities: [{ date: '2026-09-10', sectorId: 'cme' }],
    });
    expect(rest).toEqual([]);
    expect(row?.counts).toEqual({
      cme_cargas: 3, cme_ciclos: 2, cme_ciclos_conformes: 1, cme_ciclos_nao_conformes: 1, cme_cargas_liberadas: 1, cme_cargas_retidas: 1, cme_cargas_reprocessadas: 1,
      cme_bd_realizados: 2, cme_bd_aprovados: 1, cme_iq_lidos: 1, cme_iq_conformes: 1, cme_ib_monitorados: 1, cme_ib_negativos: 1,
      cme_caixas_usadas: 2, cme_caixas_rastreadas: 1, cme_nao_conformidades: 1,
    });
  });
});

describe('CME alerts', () => {
  const base: AlertInput = {
    today: '2026-10-09', rules: { investigationOverdueDays: undefined, deviceReviewDays: undefined, ibReadingHours: 48, qualificationWarningDays: 30 },
    openCases: [], openDevices: [], newMdr: [], trainingGaps: [], supplies: [], overdueActions: [], pendingFollowups: [],
  };
  it('flags recalls as events, failed Bowie-Dick, late IB readings and qualification', () => {
    const out = buildAlertCandidates({ ...base, cme: {
      recalledLoads: [{ loadId: 'l1', code: 'AV1-261001-01', surgeries: 2, patients: 2, sectorId: 'cme' }],
      releasedWithFailure: [{ loadId: 'l4', code: 'AV1-261006-01', reason: 'Indicador biológico reprovado.', sectorId: 'cme' }],
      failedBowieDick: [{ sterilizerId: 's1', name: 'Autoclave 1', sectorId: 'cme' }],
      pendingIb: [{ testId: 't1', loadId: 'l2', loadCode: 'AV1-261007-02', hours: 50, sectorId: 'cme' }, { testId: 't2', loadId: 'l3', loadCode: 'AV1-261008-01', hours: 20, sectorId: 'cme' }],
      qualifications: [{ sterilizerId: 's1', name: 'Autoclave 1', dueOn: '2026-10-01', sectorId: 'cme' }, { sterilizerId: 's2', name: 'Autoclave 2', dueOn: '2027-06-01', sectorId: 'cme' }],
    } });
    expect(out.map((a) => [a.kind, a.priority])).toEqual([
      ['cme_carga_recolhida', 'critica'], ['cme_liberada_com_falha', 'critica'], ['cme_bowie_dick_reprovado', 'critica'], ['cme_ib_leitura_atrasada', 'media'], ['cme_qualificacao', 'alta'],
    ]);
    expect(out[0]?.oneShot).toBe(true);
    expect(out[2]?.oneShot).toBeUndefined();
  });

  it('marks a new multiresistant isolate as an event', () => {
    const [mdr] = buildAlertCandidates({ ...base, newMdr: [{ isolateId: 'i1', cultureId: 'c1', organism: 'K. pneumoniae', patientLabel: 'AB · 1', sectorId: 's', collectedOn: '2026-10-08' }] });
    expect(mdr?.oneShot).toBe(true);
  });
});
