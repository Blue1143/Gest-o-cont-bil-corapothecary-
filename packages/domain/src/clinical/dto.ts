import type { DataOrigin } from '../provenance';
import type { DeviceType, InvestigationStatus, IrasType } from '../iras';
import type { SectorKind } from '../org';
import type { WoundClass, ProphylaxisEvaluation, RiskIndexResult } from '../rules/surgery';
import type { CultureOutcome, Interpretation, ResistanceProfile } from './microbiology';
import type { DischargeOutcome, NoteKind, Sex } from './patient';
import type { IrasContext } from './iras-workflow';

/**
 * Payloads exchanged by the API and the web client for the clinical modules. Patients are always
 * identified by initials + record number; the full name only travels through the audited reveal.
 */

export interface OrgBed { id: string; code: string; active: boolean; occupied: boolean }
export interface OrgSector { id: string; code: string; name: string; unitId: string; kind: SectorKind; active: boolean; rowVersion: number; beds: OrgBed[] }
export interface OrgUnit { id: string; name: string; active: boolean; rowVersion: number }
export interface OrgPayload { units: OrgUnit[]; sectors: OrgSector[] }

export interface Professional { id: string; name: string; jobRole: string | null }
export interface Procedure { id: string; code: string; name: string; specialty: string; p75Minutes: number | null; p75Source: string | null }

export interface PatientRef { id: string; recordNumber: string; initials: string }

export interface PatientSummary extends PatientRef {
  sex: Sex;
  birthDate: string | null;
  hasFullName: boolean;
  origin: DataOrigin;
  current: { admissionId: string; admittedAt: string; sectorId: string; bedCode: string | null } | null;
  activeDevices: DeviceType[];
  openCases: number;
}

export interface MovementDto { id: string; sectorId: string; bedId: string | null; bedCode: string | null; start: string; end: string | null; reason: string | null }
export interface DeviceDto { id: string; admissionId: string; type: DeviceType; site: string | null; indication: string | null; insertedAt: string; removedAt: string | null; removalReason: string | null; rowVersion: number }
export interface AdmissionDto {
  id: string; admittedAt: string; dischargedAt: string | null; outcome: DischargeOutcome | null; diagnosis: string | null;
  movements: MovementDto[]; devices: DeviceDto[]; rowVersion: number;
}
export interface NoteDto {
  id: string; createdAt: string; authorName: string; kind: NoteKind; body: string; admissionId: string | null; caseId: string | null;
  amendsId: string | null; justification: string | null; amendedBy: string | null;
}

export interface CriterionSnapshot { code: string | null; title: string; version: string; source: string; validated: boolean }

export interface IrasCaseSummary {
  id: string; patient: PatientRef; admissionId: string; type: IrasType; status: InvestigationStatus; eventDate: string; sectorId: string;
  deviceAssociated: boolean | null; deviceType: DeviceType | null; surgeryId: string | null; criterion: CriterionSnapshot | null;
  createdAt: string; updatedAt: string; rowVersion: number; origin: DataOrigin;
}
export interface IrasStatusEntry { id: string; from: InvestigationStatus | null; to: InvestigationStatus; at: string; by: string; justification: string }
export interface IrasCaseDetail extends IrasCaseSummary {
  description: string | null; deviceUseId: string | null; cultureIds: string[]; criterionReferenceId: string | null;
  history: IrasStatusEntry[]; admission: AdmissionDto; cultures: CultureSummary[]; surgery: SurgerySummary | null; notes: NoteDto[]; context: IrasContext;
}

export interface SurgerySummary {
  id: string; patient: PatientRef; admissionId: string; procedure: { id: string; name: string; specialty: string }; surgeon: { id: string; name: string };
  sectorId: string; room: string | null; startedAt: string; endedAt: string | null; woundClass: WoundClass | null; asa: number | null;
  implant: boolean; urgency: boolean; prophylaxisIndicated: boolean | null; prophylaxisDrug: string | null; prophylaxisDoseAt: string | null;
  prophylaxisDurationH: number | null; redose: boolean | null; rowVersion: number; origin: DataOrigin;
}
export interface SurgeryDetail extends SurgerySummary {
  notes: string | null; p75Minutes: number | null; p75Source: string | null; risk: RiskIndexResult; prophylaxis: ProphylaxisEvaluation;
  surveillance: { end: string; days: number } | null; cases: IrasCaseSummary[];
}

export interface SusceptibilityDto { antimicrobial: string; mic: string | null; interpretation: Interpretation }
export interface IsolateDto { id: string; organism: string; quantity: string | null; resistanceProfile: ResistanceProfile | null; mechanism: string | null; susceptibility: SusceptibilityDto[] }
export interface CultureResultDto {
  id: string; version: number; outcome: Exclude<CultureOutcome, 'pendente'>; reportedAt: string; breakpointVersion: string | null; notes: string | null;
  justification: string | null; recordedBy: string; isolates: IsolateDto[];
}
export interface CultureSummary {
  id: string; patient: PatientRef; admissionId: string; sectorId: string; material: string; collectedAt: string; outcome: CultureOutcome;
  organisms: string[]; resistance: ResistanceProfile[]; resultVersion: number | null; origin: DataOrigin;
}
export interface CultureDetail extends CultureSummary { results: CultureResultDto[]; caseIds: string[] }

export interface PatientDetail extends PatientSummary {
  rowVersion: number;
  admissions: AdmissionDto[];
  surgeries: SurgerySummary[];
  cultures: CultureSummary[];
  cases: IrasCaseSummary[];
  notes: NoteDto[];
}

export interface CensusRow { sectorId: string; beds: number; pacientes: number; cvc: number; vm: number; svd: number; byDevice: Partial<Record<DeviceType, number>> }
export interface CensusPayload { date: string; hour: number | null; instant: string | null; rows: CensusRow[]; ruleMissing: boolean }
export interface CensusMonthPayload { month: string; hour: number | null; rows: CensusRow[]; ruleMissing: boolean }

export interface Paged<T> { rows: T[]; total: number; page: number; pageSize: number }
