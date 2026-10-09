import type { InstitutionalConfig } from './config';
import type { ClinicalReference } from './references';
import type { LoadReleasePolicy } from './rules/sterilization';

/** Organization and the institution payload shared by the API and the web client. */
export interface Unit {
  id: string;
  name: string;
}

export type SectorKind = 'uti' | 'internacao' | 'centro_cirurgico' | 'cme' | 'apoio';

export const SECTOR_KIND_LABEL: Record<SectorKind, string> = {
  uti: 'UTI', internacao: 'Internação', centro_cirurgico: 'Centro cirúrgico', cme: 'CME', apoio: 'Apoio',
};

export interface Sector {
  id: string;
  /** Stable human code (e.g. "uti-adulto"); ids are opaque. */
  code: string;
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
