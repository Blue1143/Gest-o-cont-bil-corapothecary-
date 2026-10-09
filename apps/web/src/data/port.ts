import type { ClinicalReference, DataOrigin, FactRow, InstitutionalConfig, LoadReleasePolicy, WithProvenance } from '@ccih/domain';

/**
 * The only contract the UI knows. The demo source and the future HTTP API source implement it;
 * screens never import mock data directly.
 */
export interface Unit {
  id: string;
  name: string;
}

export type SectorKind = 'uti' | 'internacao' | 'centro_cirurgico' | 'cme';

export interface Sector {
  id: string;
  name: string;
  unitId: string;
  kind: SectorKind;
}

export interface InstitutionData {
  config: InstitutionalConfig;
  loadReleasePolicy: LoadReleasePolicy | undefined;
  units: Unit[];
  sectors: Sector[];
  references: ClinicalReference[];
}

export interface FactsQuery {
  /** Inclusive month starts (YYYY-MM-01). */
  from: string;
  to: string;
}

export interface CcihDataSource {
  readonly origin: DataOrigin;
  getInstitution(): Promise<WithProvenance<InstitutionData>>;
  getFacts(query: FactsQuery): Promise<WithProvenance<{ rows: FactRow[] }>>;
}
