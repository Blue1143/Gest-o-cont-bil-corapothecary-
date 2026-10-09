import { describe, expect, it } from 'vitest';
import type { IndicatorTarget } from '../config';
import { compareWithPrevious, evaluateTarget } from './target';
import { deviceAssociation, deviceDay, deviceDaysTotal } from './devices';
import { evaluateProphylaxis, surgicalRiskIndex, surveillanceEnd } from './surgery';
import { evaluateLoadRelease, type LoadReleasePolicy } from './sterilization';
import { evaluateBundle, evaluateStock } from './operations';

const target = (over: Partial<IndicatorTarget> = {}): IndicatorTarget => ({
  indicatorId: 'di-ipcs', value: 2, direction: 'lower', origin: 'institucional', approvedBy: 'CCIH', validFrom: '2026-01-01', referenceId: null, ...over,
});

describe('evaluateTarget', () => {
  it('has no intermediate state unless a warning band is configured', () => {
    expect(evaluateTarget(2.4, target()).result).toBe('fora_da_meta');
    expect(evaluateTarget(2.4, target({ warningBand: 0.5 })).result).toBe('atencao');
    expect(evaluateTarget(2.6, target({ warningBand: 0.5 })).result).toBe('fora_da_meta');
    expect(evaluateTarget(2, target()).result).toBe('conforme');
  });

  it('handles higher-is-better targets', () => {
    const t = target({ value: 80, direction: 'higher', warningBand: 5 });
    expect(evaluateTarget(82, t).result).toBe('conforme');
    expect(evaluateTarget(76, t).result).toBe('atencao');
    expect(evaluateTarget(70, t).result).toBe('fora_da_meta');
  });

  it('reports missing data and missing target explicitly', () => {
    expect(evaluateTarget(null, target()).result).toBe('sem_dado');
    expect(evaluateTarget(3, undefined)).toMatchObject({ result: 'sem_meta', status: 'neutral' });
  });

  it('compares with the previous period according to direction', () => {
    expect(compareWithPrevious(2.4, 1.8, 'lower')).toMatchObject({ improved: false });
    expect(compareWithPrevious(78, 74, 'higher').improved).toBe(true);
    expect(compareWithPrevious(2, 2, 'lower').improved).toBeNull();
    expect(compareWithPrevious(null, 2, 'lower').delta).toBeNull();
  });
});

describe('devices', () => {
  it('numbers device days with D1 = insertion day', () => {
    expect(deviceDay({ insertedOn: '2026-09-29' }, '2026-10-06')).toBe(8);
    expect(deviceDay({ insertedOn: '2026-09-29', removedOn: '2026-10-03' }, '2026-10-06')).toBeNull();
    expect(deviceDaysTotal({ insertedOn: '2026-09-29', removedOn: '2026-10-03' }, '2026-10-09')).toBe(5);
  });

  it('classifies association only with configured parameters', () => {
    const rule = { fromDeviceDay: 3, graceDaysAfterRemoval: 1 };
    expect(deviceAssociation({ insertedOn: '2026-10-01' }, '2026-10-02', { fromDeviceDay: undefined, graceDaysAfterRemoval: 1 })).toBe('sem_regra');
    expect(deviceAssociation({ insertedOn: '2026-10-01' }, '2026-10-02', rule)).toBe('nao_elegivel');
    expect(deviceAssociation({ insertedOn: '2026-10-01' }, '2026-10-03', rule)).toBe('elegivel');
    expect(deviceAssociation({ insertedOn: '2026-10-01', removedOn: '2026-10-05' }, '2026-10-06', rule)).toBe('elegivel');
    expect(deviceAssociation({ insertedOn: '2026-10-01', removedOn: '2026-10-05' }, '2026-10-08', rule)).toBe('nao_elegivel');
  });
});

describe('surgery', () => {
  it('flags an incomplete risk index instead of assuming zero (audit M-02)', () => {
    expect(surgicalRiskIndex({ asa: 3, woundClass: 'limpa', durationMin: 185, p75Min: 150 })).toEqual({ score: 2, missing: [], complete: true });
    expect(surgicalRiskIndex({ woundClass: 'infectada' })).toEqual({ score: 1, missing: ['asa', 'duration'], complete: false });
  });

  const rule = { windowMin: 60, windowByDrugMin: { vancomicina: 120 }, maxDurationH: 24 };

  it('never calls missing data non-compliant (audit A-04)', () => {
    expect(evaluateProphylaxis({ indicated: true, drug: 'Cefazolina' }, rule).result).toBe('incompleto');
  });

  it('applies the configured window, including per-drug windows', () => {
    expect(evaluateProphylaxis({ indicated: true, drug: 'Cefazolina', minutesBeforeIncision: 35, durationHours: 24 }, rule).result).toBe('conforme');
    expect(evaluateProphylaxis({ indicated: true, drug: 'Cefazolina', minutesBeforeIncision: 90, durationHours: 12 }, rule)).toMatchObject({ result: 'nao_conforme', appliedWindowMin: 60 });
    expect(evaluateProphylaxis({ indicated: true, drug: 'Vancomicina', minutesBeforeIncision: 90, durationHours: 12 }, rule).result).toBe('conforme');
    expect(evaluateProphylaxis({ indicated: true, drug: 'Cefazolina', minutesBeforeIncision: -5, durationHours: 12 }, rule).result).toBe('nao_conforme');
  });

  it('makes no decision without an institutional window', () => {
    expect(evaluateProphylaxis({ indicated: true, minutesBeforeIncision: 30, durationHours: 12 }, { windowMin: undefined, maxDurationH: 24 }).result).toBe('sem_regra');
    expect(evaluateProphylaxis({ indicated: false }, rule).result).toBe('nao_indicada');
  });

  it('computes the surveillance window from configuration only', () => {
    expect(surveillanceEnd('2026-10-02', true, { days: 30, daysWithImplant: 90 })).toEqual({ end: '2026-12-31', days: 90 });
    expect(surveillanceEnd('2026-10-02', false, { days: undefined, daysWithImplant: 90 })).toBeNull();
  });
});

describe('evaluateLoadRelease', () => {
  const policy: LoadReleasePolicy = { requiredLoadTests: ['IQ5', 'REGISTRO_FISICO'], requireDailyBowieDick: true, holdImplantsUntilBiological: true, referenceId: null };
  const ok = [{ type: 'IQ5' as const, result: 'aprovado' as const }, { type: 'REGISTRO_FISICO' as const, result: 'aprovado' as const }];

  it('releases when every required test passed', () => {
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false, equipmentBowieDick: 'aprovado' }, policy).status).toBe('liberada');
  });

  it('holds implant loads until the biological indicator is read', () => {
    const r = evaluateLoadRelease({ tests: [...ok, { type: 'IB', result: 'pendente' }], hasImplant: true, equipmentBowieDick: 'aprovado' }, policy);
    expect(r.status).toBe('retida');
  });

  it('rejects on any failed test and waits on missing ones', () => {
    expect(evaluateLoadRelease({ tests: [{ type: 'IQ5', result: 'reprovado' }], hasImplant: false, equipmentBowieDick: 'aprovado' }, policy).status).toBe('rejeitada');
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false, equipmentBowieDick: 'reprovado' }, policy).status).toBe('rejeitada');
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false }, policy).status).toBe('aguardando');
  });

  it('keeps manual decisions and makes none without a policy', () => {
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false, manualStatus: 'reprocessamento' }, policy).status).toBe('reprocessamento');
    expect(evaluateLoadRelease({ tests: ok, hasImplant: false }, undefined)).toMatchObject({ status: 'aguardando', policyApplied: false });
  });
});

describe('operations', () => {
  it('evaluates bundles all-or-none or per item', () => {
    expect(evaluateBundle(['conforme', 'nao_aplicavel', 'conforme'], 'tudo_ou_nada').result).toBe('conforme');
    expect(evaluateBundle(['conforme', 'nao_conforme'], 'tudo_ou_nada')).toMatchObject({ result: 'nao_conforme', itemCompliancePct: 50 });
    expect(evaluateBundle(['conforme', null], 'tudo_ou_nada').result).toBe('incompleto');
  });

  it('evaluates stock coverage and expiry with configured thresholds', () => {
    const rule = { defaultMinCoverageDays: 20, expiryWarningDays: 30 };
    expect(evaluateStock({ quantity: 180, dailyConsumption: 9.5, expiresOn: '2027-06-30' }, rule, '2026-10-09').label).toBe('Repor');
    expect(evaluateStock({ quantity: 27, dailyConsumption: 3, expiresOn: '2026-12-15' }, rule, '2026-10-09').label).toBe('Ruptura iminente');
    expect(evaluateStock({ quantity: 500, dailyConsumption: 2, expiresOn: '2026-10-31' }, rule, '2026-10-09').label).toBe('Vence em 22 d');
    expect(evaluateStock({ quantity: 500, dailyConsumption: 2, expiresOn: '2026-10-01' }, rule, '2026-10-09').label).toBe('Vencido');
    expect(evaluateStock({ quantity: 0, dailyConsumption: 2 }, rule, '2026-10-09').label).toBe('Indisponível');
    expect(evaluateStock({ quantity: 500, dailyConsumption: 2 }, { defaultMinCoverageDays: undefined, expiryWarningDays: 30 }, '2026-10-09').label).toBe('Sem regra configurada');
  });
});
