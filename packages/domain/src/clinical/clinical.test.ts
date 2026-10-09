import { describe, expect, it } from 'vitest';
import { emptyRules, type InstitutionalRules } from '../config';
import { ageLabel, ageYears, initialsFromName, normalizeInitials } from './patient';
import { checkTransition, irasContext, transitionPermission } from './iras-workflow';
import { censusOfDay, censusOfRange, fromLocalInput, toLocalInput, zonedInstant, type CensusAdmission } from './census';
import { consolidateClinicalFacts, type ConsolidationInput } from './consolidation';

const TZ = 'America/Sao_Paulo';
const p = <T,>(value: T) => ({ value, referenceId: null });
const rules = (over: Partial<InstitutionalRules> = {}): InstitutionalRules => ({
  ...emptyRules(),
  devices: { associationFromDeviceDay: p(3), associationGraceDaysAfterRemoval: p(1) },
  admissions: { hospitalAcquiredFromDay: p(3), censusHour: p(0) },
  surgery: { prophylaxisWindowMin: p(60), prophylaxisWindowByDrugMin: p({ vancomicina: 120 }), prophylaxisMaxDurationH: p(24) },
  ...over,
});

describe('patient identification', () => {
  it('normalizes initials and derives them from a name without connectives', () => {
    expect(normalizeInitials(' j. da silva ')).toBeNull(); // more than 6 letters
    expect(normalizeInitials('m.a.s')).toBe('MAS');
    expect(normalizeInitials('Ângela')).toBe('ANGELA');
    expect(initialsFromName('Maria das Dores Lima')).toBe('MDL');
    expect(normalizeInitials('')).toBeNull();
  });

  it('computes age in years, months for infants and days for newborns', () => {
    expect(ageYears('1980-10-10', '2026-10-09')).toBe(45);
    expect(ageYears('1980-10-09', '2026-10-09')).toBe(46);
    expect(ageLabel('2026-10-01', '2026-10-09')).toBe('8 dias');
    expect(ageLabel('2025-12-20', '2026-10-09')).toBe('9 meses');
    expect(ageLabel(null, '2026-10-09')).toBe('Idade não informada');
  });
});

describe('IRAS workflow', () => {
  const base = { type: 'IPCS' as const, justification: 'Critérios revisados pela CCIH' };

  it('allows only the defined transitions', () => {
    expect(checkTransition('suspeita', 'confirmada', base).map((x) => x.path)).toContain('status');
    expect(checkTransition('suspeita', 'em_investigacao', base)).toEqual([]);
  });

  it('requires criterion, device decision and links to confirm', () => {
    const paths = checkTransition('em_investigacao', 'confirmada', base).map((x) => x.path);
    expect(paths).toEqual(['criterionReferenceId', 'deviceAssociated']);
    expect(checkTransition('em_investigacao', 'confirmada', { ...base, criterionReferenceId: 'r', deviceAssociated: true }).map((x) => x.path)).toEqual(['deviceUseId']);
    expect(checkTransition('em_investigacao', 'confirmada', { ...base, criterionReferenceId: 'r', deviceAssociated: false })).toEqual([]);
    expect(checkTransition('em_investigacao', 'confirmada', { type: 'ISC', justification: base.justification, criterionReferenceId: 'r' }).map((x) => x.path)).toEqual(['surgeryId']);
    expect(checkTransition('suspeita', 'descartada', { ...base, justification: 'curto' }).map((x) => x.path)).toEqual(['justification']);
  });

  it('reserves conclusions and reopening for the decide permission', () => {
    expect(transitionPermission('suspeita', 'em_investigacao')).toBe('iras:edit');
    expect(transitionPermission('em_investigacao', 'confirmada')).toBe('iras:decide');
    expect(transitionPermission('confirmada', 'em_investigacao')).toBe('iras:decide');
  });

  it('evaluates eligibility only with configured parameters', () => {
    const ctx = irasContext({ type: 'IPCS', admittedOn: '2026-09-01', eventDate: '2026-09-05', devices: [{ id: 'd1', type: 'CVC', insertedOn: '2026-09-02', removedOn: null }, { id: 'd2', type: 'SVD', insertedOn: '2026-09-04', removedOn: null }], rules: rules() });
    expect(ctx.hospitalDay).toBe(5);
    expect(ctx.healthcareAssociated).toBe('elegivel');
    expect(ctx.devices[0]).toMatchObject({ deviceDayOnEvent: 4, association: 'elegivel', relevant: true });
    expect(ctx.devices[1]).toMatchObject({ association: 'nao_elegivel', relevant: false });
    const none = irasContext({ type: 'IPCS', admittedOn: '2026-09-01', eventDate: '2026-09-05', devices: [{ id: 'd1', type: 'CVC', insertedOn: '2026-09-02', removedOn: null }], rules: emptyRules() });
    expect(none.healthcareAssociated).toBe('sem_regra');
    expect(none.devices[0]!.association).toBe('sem_regra');
  });
});

describe('daily census', () => {
  it('resolves the census instant in the institution time zone', () => {
    expect(zonedInstant('2026-10-09', 0, TZ).toISOString()).toBe('2026-10-09T03:00:00.000Z');
    expect(zonedInstant('2026-10-09', 23, TZ).toISOString()).toBe('2026-10-10T02:00:00.000Z');
  });

  it('round-trips datetime-local values in the institution zone, not the browser zone', () => {
    expect(fromLocalInput('2026-10-09T21:30', TZ)).toBe('2026-10-10T00:30:00.000Z');
    expect(toLocalInput('2026-10-10T00:30:00.000Z', TZ)).toBe('2026-10-09T21:30');
    expect(fromLocalInput('invalido', TZ)).toBeNull();
  });

  const adm: CensusAdmission[] = [
    {
      id: 'a1',
      // Arrives at the ICU on 01/10 10:00, moves to the ward on 03/10 15:00, leaves 05/10 09:00 (local).
      stays: [
        { sectorId: 'uti', start: '2026-10-01T13:00:00Z', end: '2026-10-03T18:00:00Z' },
        { sectorId: 'cm', start: '2026-10-03T18:00:00Z', end: '2026-10-05T12:00:00Z' },
      ],
      devices: [{ type: 'CVC', insertedAt: '2026-10-01T14:00:00Z', removedAt: '2026-10-03T12:00:00Z' }, { type: 'PICC', insertedAt: '2026-10-03T19:00:00Z', removedAt: null }],
    },
    { id: 'a2', stays: [{ sectorId: 'uti', start: '2026-09-30T10:00:00Z', end: null }], devices: [{ type: 'VM', insertedAt: '2026-09-30T11:00:00Z', removedAt: null }] },
  ];

  it('counts patients and devices present at the census hour', () => {
    const d2 = censusOfDay(adm, '2026-10-02', 0, TZ);
    expect(d2.get('uti')).toMatchObject({ pacientes: 2, cvc: 1, vm: 1 });
    expect(censusOfDay(adm, '2026-10-01', 0, TZ).get('uti')).toMatchObject({ pacientes: 1, cvc: 0 });
  });

  it('sums a range and attributes each day to the sector of that moment', () => {
    const r = censusOfRange(adm, '2026-10-01', '2026-10-06', 0, TZ);
    // a1: UTI on 02 and 03; ward on 04 and 05. a2: UTI every day.
    expect(r.get('uti')).toMatchObject({ pacientes: 2 + 6, cvc: 2, vm: 6 });
    expect(r.get('cm')).toMatchObject({ pacientes: 2, cvc: 2, byDevice: { PICC: 2 } });
  });
});

describe('clinical consolidation', () => {
  const input = (over: Partial<ConsolidationInput> = {}): ConsolidationInput => ({
    timezone: TZ,
    rules: rules(),
    months: ['2026-09-01'],
    admissions: [{ id: 'a', stays: [{ sectorId: 'uti', start: '2026-08-31T12:00:00Z', end: '2026-09-11T12:00:00Z' }], devices: [{ type: 'CVC', insertedAt: '2026-09-01T12:00:00Z', removedAt: null }] }],
    cases: [
      { type: 'IPCS', eventDate: '2026-09-05', sectorId: 'uti', status: 'confirmada', deviceAssociated: true, surgeryId: null, history: [{ to: 'suspeita', at: '2026-09-05T12:00:00Z' }, { to: 'confirmada', at: '2026-09-08T12:00:00Z' }] },
      { type: 'IPCS', eventDate: '2026-09-06', sectorId: 'uti', status: 'confirmada', deviceAssociated: false, surgeryId: null, history: [{ to: 'confirmada', at: '2026-09-07T12:00:00Z' }] },
      { type: 'PAV', eventDate: '2026-09-20', sectorId: 'uti', status: 'em_investigacao', deviceAssociated: null, surgeryId: null, history: [{ to: 'suspeita', at: '2026-09-20T12:00:00Z' }] },
      { type: 'ISC', eventDate: '2026-09-25', sectorId: 'cc', status: 'confirmada', deviceAssociated: null, surgeryId: 's1', history: [{ to: 'confirmada', at: '2026-10-02T12:00:00Z' }] },
    ],
    surgeries: [
      { id: 's1', date: '2026-09-10', sectorId: 'cc', woundClass: 'limpa', prophylaxisIndicated: true, drug: 'cefazolina', minutesBeforeIncision: 30, durationHours: 24 },
      { id: 's2', date: '2026-09-11', sectorId: 'cc', woundClass: 'contaminada', prophylaxisIndicated: true, drug: 'vancomicina', minutesBeforeIncision: 100, durationHours: 48 },
      { id: 's3', date: '2026-09-12', sectorId: 'cc', woundClass: 'limpa', prophylaxisIndicated: false, drug: null, minutesBeforeIncision: null, durationHours: null },
    ],
    mdrIsolates: [
      { admissionId: 'a', organism: 'Klebsiella pneumoniae', collectedOn: '2026-08-30', sectorId: 'uti' },
      { admissionId: 'a', organism: 'Klebsiella pneumoniae', collectedOn: '2026-09-03', sectorId: 'uti' },
      { admissionId: 'a', organism: 'Acinetobacter baumannii', collectedOn: '2026-09-04', sectorId: 'uti' },
    ],
    ...over,
  });

  it('derives denominators, IRAS, MDR, stock and surgical metrics', () => {
    const { rows, skipped } = consolidateClinicalFacts(input());
    expect(skipped).toEqual([]);
    const uti = rows.find((r) => r.sectorId === 'uti')!.counts;
    expect(uti).toMatchObject({ pacientes_dia: 11, cvc_dia: 10, iras_total: 2, iras_ipcs: 1, iras_outras: 1, investigacoes_abertas: 1, mdr_novos: 1, vm_dia: 0 });
    const cc = rows.find((r) => r.sectorId === 'cc')!.counts;
    expect(cc).toMatchObject({ cirurgias_limpas: 2, isc_limpas: 1, profilaxia_indicada: 2, profilaxia_no_prazo: 2, profilaxia_ate_24h: 1, iras_isc: 1 });
  });

  it('skips metrics whose rule is not configured instead of guessing', () => {
    const { rows, skipped } = consolidateClinicalFacts(input({ rules: emptyRules() }));
    expect(skipped).toHaveLength(3);
    expect(consolidateClinicalFacts(input({ rules: emptyRules() })).metrics).not.toContain("pacientes_dia");
    expect(rows.find((r) => r.sectorId === 'uti')!.counts.pacientes_dia).toBeUndefined();
    expect(rows.find((r) => r.sectorId === 'cc')!.counts.profilaxia_no_prazo).toBeUndefined();
  });
});
