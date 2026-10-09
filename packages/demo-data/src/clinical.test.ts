import { describe, expect, it } from 'vitest';
import { censusOfRange, consolidateClinicalFacts, type CensusAdmission } from '@ccih/domain';
import { generateClinical } from './clinical';
import { DEMO_CONFIG, DEMO_SECTORS } from './institution';
import { WARD_PROFILES } from './facts';

const now = new Date('2026-10-09T15:00:00Z');
const data = generateClinical({ from: '2026-08-01', now, timezone: DEMO_CONFIG.timezone });
const toCensus = (): CensusAdmission[] =>
  data.admissions.map((a) => ({ id: a.key, stays: a.movements.map((m) => ({ sectorId: m.sectorCode, start: m.start, end: m.end })), devices: a.devices }));

describe('synthetic clinical records', () => {
  it('are deterministic and use only known sectors', () => {
    const again = generateClinical({ from: '2026-08-01', now, timezone: DEMO_CONFIG.timezone });
    expect(again.admissions.length).toBe(data.admissions.length);
    const codes = new Set(DEMO_SECTORS.map((s) => s.code));
    for (const a of data.admissions) for (const m of a.movements) expect(codes.has(m.sectorCode)).toBe(true);
  });

  it('are internally consistent', () => {
    const nowIso = now.toISOString();
    for (const a of data.admissions) {
      expect(a.movements[0]!.start).toBe(a.admittedAt);
      if (a.dischargedAt) expect(a.dischargedAt > a.admittedAt).toBe(true);
      else expect(a.movements.at(-1)!.end).toBeNull();
      for (const d of a.devices) {
        expect(d.insertedAt >= a.admittedAt).toBe(true);
        if (d.removedAt) expect(d.removedAt <= (a.dischargedAt ?? nowIso)).toBe(true);
      }
    }
    for (const c of data.cases) {
      expect(c.history[0]!.to).toBe('suspeita');
      expect(c.history.at(-1)!.to).toBe(c.status);
      if (c.type === 'ISC') expect(c.surgeryKey).not.toBeNull();
    }
    for (const s of data.surgeries) expect(s.endedAt > s.startedAt).toBe(true);
    // Beds are never double-booked.
    const byBed = new Map<string, Array<[string, string]>>();
    for (const a of data.admissions) for (const m of a.movements) if (m.bedCode) byBed.set(`${m.sectorCode}|${m.bedCode}`, [...(byBed.get(`${m.sectorCode}|${m.bedCode}`) ?? []), [m.start, m.end ?? '9999']]);
    for (const stays of byBed.values()) {
      stays.sort((x, y) => x[0].localeCompare(y[0]));
      for (let i = 1; i < stays.length; i++) expect(stays[i]![0] >= stays[i - 1]![1]).toBe(true);
    }
  });

  it('keeps patient-days in the order of magnitude of the ward profiles', () => {
    const census = censusOfRange(toCensus(), '2026-09-01', '2026-09-30', 0, DEMO_CONFIG.timezone);
    for (const [code, prof] of Object.entries(WARD_PROFILES)) {
      const expected = prof.beds * 30 * prof.occupancy;
      const pd = census.get(code)?.pacientes ?? 0;
      expect(pd).toBeGreaterThan(expected * 0.6);
      expect(pd).toBeLessThan(expected * 1.4);
    }
  });

  it('feeds the consolidation with plausible surgical volumes', () => {
    const { rows } = consolidateClinicalFacts({
      timezone: DEMO_CONFIG.timezone, rules: DEMO_CONFIG.rules, months: ['2026-09-01'], admissions: toCensus(), cases: [], mdrIsolates: [],
      surgeries: data.surgeries.map((s) => ({ id: s.key, date: s.startedAt.slice(0, 10), sectorId: 'centro-cirurgico', woundClass: s.woundClass, prophylaxisIndicated: s.prophylaxisIndicated, drug: s.drug, minutesBeforeIncision: s.doseAt ? (Date.parse(s.startedAt) - Date.parse(s.doseAt)) / 60_000 : null, durationHours: s.durationH })),
    });
    const cc = rows.find((r) => r.sectorId === 'centro-cirurgico')!.counts;
    expect(cc.cirurgias_limpas).toBeGreaterThan(80);
    expect(cc.profilaxia_no_prazo!).toBeLessThanOrEqual(cc.profilaxia_indicada!);
  });
});
