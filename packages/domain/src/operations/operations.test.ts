import { describe, expect, it } from 'vitest';
import { checkAuditTransition, checkNcTransition } from './quality';
import { coverageBySector, requiredTrainings, trainingExpiry } from './training';
import { dailyConsumption, signedDelta, stockByLot, type LedgerMovement } from './supplies';
import { ALERT_KIND_BLOCKING, ALERT_KIND_CATEGORY, alertActions, buildAlertCandidates, type AlertInput, type AlertKind } from './alerts';
import { consolidateOperationalFacts } from './consolidation';
import { evaluateStock } from '../rules/operations';

describe('quality workflows', () => {
  it('requires actions before treatment, finished actions before effectiveness and a result to close', () => {
    const j = 'Motivo registrado pela CCIH';
    expect(checkNcTransition('aberta', 'em_tratamento', { justification: j, actions: [], effectiveness: null }).map((p) => p.path)).toEqual(['actions']);
    expect(checkNcTransition('aberta', 'em_tratamento', { justification: j, actions: [{ status: 'pendente' }], effectiveness: null })).toEqual([]);
    expect(checkNcTransition('em_tratamento', 'aguardando_eficacia', { justification: j, actions: [{ status: 'em_andamento' }], effectiveness: null }).map((p) => p.path)).toEqual(['actions']);
    expect(checkNcTransition('aguardando_eficacia', 'encerrada', { justification: j, actions: [{ status: 'concluida' }], effectiveness: '' }).map((p) => p.path)).toEqual(['effectiveness']);
    expect(checkNcTransition('encerrada', 'aberta', { justification: j, actions: [], effectiveness: 'ok' }).map((p) => p.path)).toEqual(['status']);
  });

  it('needs findings to conclude an audit and follows the defined flow', () => {
    expect(checkAuditTransition('em_andamento', 'concluida', { justification: 'Auditoria realizada no setor', findings: null }).map((p) => p.path)).toEqual(['findings']);
    expect(checkAuditTransition('planejada', 'encerrada', { justification: 'Pular etapas da auditoria', findings: 'x' }).map((p) => p.path)).toEqual(['status']);
    expect(checkAuditTransition('verificacao_eficacia', 'plano_de_acao', { justification: 'Ações não foram eficazes', findings: 'x' })).toEqual([]);
  });
});

describe('training coverage', () => {
  const professionals = [
    { id: 'p1', sectorId: 'uti', jobRoleId: 'enf', active: true },
    { id: 'p2', sectorId: 'uti', jobRoleId: 'enf', active: true },
    { id: 'p3', sectorId: 'uti', jobRoleId: 'med', active: true },
    { id: 'p4', sectorId: 'uti', jobRoleId: 'enf', active: false },
  ];
  const trainings = [{ id: 't1', mandatory: true, validityMonths: 12, targetJobRoleIds: ['enf'] }, { id: 't2', mandatory: false, validityMonths: null, targetJobRoleIds: ['enf', 'med'] }];

  it('counts each active targeted professional and the validity of the last attendance', () => {
    const rows = requiredTrainings({
      professionals, trainings, warningDays: 30, at: '2026-10-09',
      attendances: [
        { trainingId: 't1', professionalId: 'p1', heldOn: '2025-11-01', present: true },
        { trainingId: 't1', professionalId: 'p2', heldOn: '2025-10-01', present: true },
        { trainingId: 't1', professionalId: 'p2', heldOn: '2026-01-01', present: false },
      ],
    });
    expect(rows.map((r) => [r.professionalId, r.state])).toEqual([['p1', 'vencendo'], ['p2', 'vencido']]);
    expect(coverageBySector(rows).get('uti')).toEqual({ publico: 2, concluidos: 1 });
    expect(trainingExpiry('2026-01-31', 1)).toBe('2026-03-03');
    expect(trainingExpiry('2026-01-10', null)).toBeNull();
  });
});

describe('supplies ledger', () => {
  it('derives stock per lot and average consumption', () => {
    const m: LedgerMovement[] = [
      { lotId: 'a', kind: 'entrada', delta: signedDelta('entrada', 1000), occurredOn: '2026-09-01' },
      { lotId: 'a', kind: 'consumo', delta: signedDelta('consumo', 300), occurredOn: '2026-09-20' },
      { lotId: 'a', kind: 'ajuste', delta: signedDelta('ajuste', -10), occurredOn: '2026-09-21' },
      { lotId: 'b', kind: 'descarte', delta: signedDelta('descarte', 5), occurredOn: '2026-09-21' },
    ];
    expect(stockByLot(m)).toEqual(new Map([['a', 690], ['b', -5]]));
    expect(dailyConsumption(m, '2026-10-09')).toBe(10);
    expect(dailyConsumption(m, '2026-12-01')).toBeNull();
  });
});

describe('alert candidates', () => {
  const base: AlertInput = { today: '2026-10-09', rules: { investigationOverdueDays: 7, deviceReviewDays: 7 }, openCases: [], openDevices: [], newMdr: [], trainingGaps: [], supplies: [], overdueActions: [], pendingFollowups: [] };

  it('use only configured thresholds and produce stable deduplication keys', () => {
    const input: AlertInput = {
      ...base,
      openCases: [{ id: 'c1', typeLabel: 'IPCS', patientLabel: 'MAS', openedOn: '2026-10-01', sectorId: 's' }, { id: 'c2', typeLabel: 'PAV', patientLabel: 'JB', openedOn: '2026-10-05', sectorId: 's' }],
      openDevices: [{ id: 'd1', type: 'CVC', patientId: 'p1', patientLabel: 'MAS', insertedOn: '2026-10-02', sectorId: 's' }, { id: 'd2', type: 'SVD', patientId: 'p2', patientLabel: 'JB', insertedOn: '2026-10-03', sectorId: 's' }],
      supplies: [{ id: 'x', name: 'Álcool 70%', evaluation: evaluateStock({ quantity: 0, dailyConsumption: 10 }, { defaultMinCoverageDays: 15, expiryWarningDays: 30 }, '2026-10-09') }],
      trainingGaps: [{ trainingId: 't', trainingTitle: 'Higiene das mãos', sectorId: 's', overdue: 0 }],
    };
    const c = buildAlertCandidates(input);
    expect(c.map((a) => a.dedupKey)).toEqual(['iras:c1', 'disp:d1', 'insumo:x:Indisponível']);
    expect(c[0]).toMatchObject({ priority: 'alta', title: 'IPCS em aberto há 8 dias' });
    expect(c[1]).toMatchObject({ title: 'CVC em D8: reavaliar indicação', link: '/pacientes/p1' });
    expect(buildAlertCandidates({ ...input, rules: { investigationOverdueDays: undefined, deviceReviewDays: undefined } }).map((a) => a.kind)).toEqual(['insumo_critico']);
  });
});

describe('operational consolidation', () => {
  it('builds bundle, hand hygiene, alcohol and training facts per sector and month', () => {
    const rows = consolidateOperationalFacts({
      months: ['2026-09-01'],
      bundleAudits: [
        { date: '2026-09-03', sectorId: 'uti', metric: 'cvc', compliant: true },
        { date: '2026-09-04', sectorId: 'uti', metric: 'cvc', compliant: false },
        { date: '2026-09-04', sectorId: 'uti', metric: null, compliant: true },
        { date: '2026-10-01', sectorId: 'uti', metric: 'vm', compliant: true },
      ],
      handHygiene: [{ date: '2026-09-10', sectorId: 'uti', opportunities: 20, actions: 15 }],
      alcohol: [{ date: '2026-09-10', sectorId: 'uti', ml: 500 }, { date: '2026-09-11', sectorId: 'uti', ml: 250 }],
      training: { professionals: [{ id: 'p', sectorId: 'uti', jobRoleId: 'enf', active: true }], trainings: [{ id: 't', mandatory: true, validityMonths: 12, targetJobRoleIds: ['enf'] }], attendances: [{ trainingId: 't', professionalId: 'p', heldOn: '2026-09-15', present: true }], warningDays: 30 },
    });
    expect(rows).toEqual([{ period: '2026-09-01', sectorId: 'uti', counts: { bundle_cvc_auditorias: 2, bundle_cvc_conformes: 1, hm_oportunidades: 20, hm_acoes: 15, alcool_ml: 750, treinamento_publico: 1, treinamento_concluidos: 1 } }]);
  });
});

describe('alert center v2', () => {
  it('classifies every kind and marks only safety conditions that must not be closed by hand as blocking', () => {
    const kinds = Object.keys(ALERT_KIND_CATEGORY) as AlertKind[];
    expect(kinds.every((k) => ALERT_KIND_CATEGORY[k])).toBe(true);
    expect(kinds.filter((k) => ALERT_KIND_BLOCKING[k]).sort()).toEqual(['cme_bowie_dick_reprovado', 'cme_liberada_com_falha']);
    expect(kinds.filter((k) => ALERT_KIND_BLOCKING[k]).every((k) => ALERT_KIND_CATEGORY[k] === 'seguranca')).toBe(true);
  });

  it('allows each action only in the right state, and no manual closing of blocking alerts', () => {
    expect(alertActions({ status: 'aberto', blocking: false })).toEqual({ acknowledge: true, assume: true, resolve: true, close: true, exception: false });
    expect(alertActions({ status: 'reconhecido', blocking: false })).toMatchObject({ acknowledge: false, assume: true });
    expect(alertActions({ status: 'resolvido', blocking: false })).toMatchObject({ resolve: false, close: true });
    expect(alertActions({ status: 'aberto', blocking: true })).toMatchObject({ close: false, exception: true });
    expect(Object.values(alertActions({ status: 'encerrado', blocking: true })).some(Boolean)).toBe(false);
  });

  it('raises a recall with exposed patients and a released load that now fails as critical, with deadline and step where they apply', () => {
    const input: AlertInput = {
      today: '2026-10-09', rules: { investigationOverdueDays: 3, deviceReviewDays: undefined }, openCases: [{ id: 'c1', typeLabel: 'IPCS', patientLabel: 'A.B. · 1', openedOn: '2026-10-01', sectorId: 's' }],
      openDevices: [], newMdr: [], trainingGaps: [], supplies: [], overdueActions: [], pendingFollowups: [],
      cme: { recalledLoads: [{ loadId: 'l1', code: 'AV1', surgeries: 1, patients: 1, sectorId: 'cme' }], releasedWithFailure: [{ loadId: 'l2', code: 'AV2', reason: 'IB positivo.', sectorId: 'cme' }], failedBowieDick: [], pendingIb: [], qualifications: [] },
    };
    const out = buildAlertCandidates(input);
    expect(out.find((c) => c.kind === 'cme_carga_recolhida')?.priority).toBe('critica');
    expect(out.find((c) => c.kind === 'cme_liberada_com_falha')).toMatchObject({ priority: 'critica', step: 'liberacao' });
    expect(out.find((c) => c.kind === 'iras_investigacao_atrasada')?.dueOn).toBe('2026-10-04');
  });
});

describe('CME process-break rules', () => {
  const base = (rules: AlertInput['rules'], cme: Partial<NonNullable<AlertInput['cme']>>): AlertInput => ({
    today: '2026-10-09', rules, openCases: [], openDevices: [], newMdr: [], trainingGaps: [], supplies: [], overdueActions: [], pendingFollowups: [],
    cme: { recalledLoads: [], releasedWithFailure: [], failedBowieDick: [], pendingIb: [], qualifications: [], ...cme },
  });
  const stalled = [{ processId: 'p1', label: 'Caixa (AT-1)', step: 'limpeza' as const, hours: 30, sectorId: 'cme' }];
  const loads = [{ loadId: 'l1', code: 'AV1-01', hours: 30, sectorId: 'cme' }];
  const refused = [{ stationId: 's1', stationName: 'Limpeza', count: 5, sectorId: 'cme' }];

  it('raises no time or count alert without an institutional value', () => {
    const out = buildAlertCandidates(base({ investigationOverdueDays: undefined, deviceReviewDays: undefined }, { stalledProcesses: stalled, loadsAwaitingDecision: loads, refusedReadings: refused }));
    expect(out).toEqual([]);
  });

  it('applies each configured deadline to its own step only', () => {
    const rules = { investigationOverdueDays: undefined, deviceReviewDays: undefined, cmeStepMaxHours: { recepcao: 2 }, loadDecisionMaxHours: 24, invalidReadingsLimit: 5, invalidReadingsWindowMin: 30 };
    const out = buildAlertCandidates(base(rules, { stalledProcesses: stalled, loadsAwaitingDecision: loads, refusedReadings: refused }));
    expect(out.map((c) => c.kind).sort()).toEqual(['cme_carga_aguardando_decisao', 'cme_leituras_recusadas']);
    const withCleaning = buildAlertCandidates(base({ ...rules, cmeStepMaxHours: { limpeza: 24 } }, { stalledProcesses: stalled }));
    expect(withCleaning[0]).toMatchObject({ kind: 'cme_etapa_atrasada', step: 'limpeza', dedupKey: 'etapa:p1:limpeza' });
  });

  it('records exit attempts before release and incompatible stations as events', () => {
    const out = buildAlertCandidates(base({ investigationOverdueDays: undefined, deviceReviewDays: undefined }, {
      exitsWithoutRelease: [{ processId: 'p2', label: 'Ótica (AT-2)', loadCode: 'PL1-01', on: '2026-10-09', sectorId: 'cme' }],
      incompatibleStations: [{ stationId: 's2', stationName: 'Arsenal', count: 2, sectorId: 'cme' }],
    }));
    expect(out.map((c) => [c.kind, c.oneShot, c.priority])).toEqual([['cme_estacao_incompativel', true, 'baixa'], ['cme_saida_sem_liberacao', true, 'alta']]);
  });
});
