import type { Kysely } from 'kysely';
import {
  rulesFromParameters,
  type ClinicalReference, type FactRow, type IndicatorTarget, type InstitutionData, type LoadReleasePolicy, type MetricCounts, type MetricKey,
  type Provenance, type SterilizationTestType,
} from '@ccih/domain';
import type { DB } from '../db/types';

/** Sector ids the user may see: undefined = every sector of the institution. */
export type SectorScope = string[] | undefined;

export async function loadInstitutionData(db: Kysely<DB>, institutionId: string, scope: SectorScope): Promise<{ data: InstitutionData; provenance: Provenance }> {
  const [inst, units, sectors, refs, params, targets, policy] = await Promise.all([
    db.selectFrom('institution').selectAll().where('id', '=', institutionId).executeTakeFirstOrThrow(),
    db.selectFrom('unit').select(['id', 'name']).where('institution_id', '=', institutionId).where('active', '=', true).orderBy('name').execute(),
    db.selectFrom('sector').select(['id', 'code', 'name', 'unit_id', 'kind']).where('institution_id', '=', institutionId).where('active', '=', true).orderBy('name').execute(),
    db.selectFrom('clinical_reference').selectAll().where('institution_id', '=', institutionId).orderBy('title').execute(),
    db.selectFrom('rule_parameter').select(['key', 'value', 'reference_id']).where('institution_id', '=', institutionId).execute(),
    db.selectFrom('indicator_target').selectAll().where('institution_id', '=', institutionId).execute(),
    db.selectFrom('load_release_policy').selectAll().where('institution_id', '=', institutionId).executeTakeFirst(),
  ]);
  const visibleSectors = sectors.filter((s) => !scope || scope.includes(s.id));
  const visibleUnits = units.filter((u) => visibleSectors.some((s) => s.unit_id === u.id));

  const references: ClinicalReference[] = refs.map((r) => ({
    id: r.id, title: r.title, kind: r.kind, source: r.source, version: r.doc_version, updatedAt: r.updated_on,
    validatedBy: r.validated_by_name, validatedAt: r.validated_at?.toISOString() ?? null, status: r.status, ...(r.notes ? { notes: r.notes } : {}),
  }));
  const indicatorTargets: IndicatorTarget[] = targets.map((t) => ({
    indicatorId: t.indicator_id, value: t.value, direction: t.direction, origin: t.origin, approvedBy: t.approved_by_name,
    validFrom: t.valid_from, referenceId: t.reference_id, ...(t.warning_band != null ? { warningBand: t.warning_band } : {}),
  }));
  const loadReleasePolicy: LoadReleasePolicy | undefined = policy
    ? { requiredLoadTests: policy.required_tests as SterilizationTestType[], requireDailyBowieDick: policy.require_daily_bowie_dick, holdImplantsUntilBiological: policy.hold_implants_until_biological, referenceId: policy.reference_id }
    : undefined;

  return {
    data: {
      config: {
        institutionName: inst.name,
        timezone: inst.timezone,
        targets: indicatorTargets,
        rules: rulesFromParameters(params.map((p) => ({ key: p.key, value: p.value, referenceId: p.reference_id }))),
      },
      loadReleasePolicy,
      units: visibleUnits,
      sectors: visibleSectors.map((s) => ({ id: s.id, code: s.code, name: s.name, unitId: s.unit_id, kind: s.kind })),
      references,
    },
    provenance: { origin: inst.data_origin, source: inst.data_origin === 'demo' ? 'Banco de demonstração (dados sintéticos)' : 'Base institucional', consolidatedAt: new Date().toISOString() },
  };
}

/** Monthly facts restricted to the user's sectors (server-side scope: no client filter is trusted). */
export async function loadFacts(db: Kysely<DB>, institutionId: string, scope: SectorScope, from: string, to: string): Promise<{ rows: FactRow[]; provenance: Provenance }> {
  let q = db
    .selectFrom('indicator_fact')
    .select(['period', 'sector_id', 'metric', 'value', 'data_origin', 'consolidated_at'])
    .where('institution_id', '=', institutionId)
    .where('period', '>=', from)
    .where('period', '<=', to);
  if (scope) q = scope.length ? q.where('sector_id', 'in', scope) : q.where('sector_id', '=', '00000000-0000-0000-0000-000000000000');
  const raw = await q.execute();

  const byKey = new Map<string, FactRow>();
  let latest = 0;
  let anyDemo = false;
  for (const r of raw) {
    const key = `${r.period}|${r.sector_id}`;
    let row = byKey.get(key);
    if (!row) {
      row = { period: r.period, sectorId: r.sector_id, counts: {} as MetricCounts };
      byKey.set(key, row);
    }
    row.counts[r.metric as MetricKey] = r.value;
    latest = Math.max(latest, r.consolidated_at.getTime());
    anyDemo ||= r.data_origin === 'demo';
  }
  return {
    rows: [...byKey.values()],
    provenance: {
      origin: anyDemo ? 'demo' : 'real',
      source: anyDemo ? 'Banco de demonstração (dados sintéticos)' : 'Base institucional',
      consolidatedAt: new Date(latest || Date.now()).toISOString(),
    },
  };
}
