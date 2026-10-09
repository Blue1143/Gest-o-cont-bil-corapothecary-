import type { DataOrigin } from '../provenance';
import type { PatientRef } from '../clinical/dto';
import type { LoadReleaseEvaluation, LoadStatus, SterilizationTestType, TestResult } from '../rules/sterilization';
import type { EquipmentStatus, IbControl, PackagingType, PhysicalResult, RecordedTestType, SterilizerType } from './cme';

/** Payloads of the CME module (Phase 5), shared by the API and the web client. */

export interface SterilizerDto {
  id: string; code: string; name: string; type: SterilizerType; serial: string | null; sectorId: string; status: EquipmentStatus;
  statusReason: string | null; qualificationDueOn: string | null; rowVersion: number; bowieDickApplies: boolean;
  todayBowieDick: TestResult | null; loadsToday: number;
}

export interface InstrumentSetDto {
  id: string; code: string; name: string; specialty: string | null; composition: string | null; itemCount: number | null;
  packaging: PackagingType; implant: boolean; active: boolean; rowVersion: number;
}

export interface AttachmentDto { id: string; fileName: string; mime: string; size: number; uploadedBy: string; uploadedAt: string }

export interface CmeTestDto {
  id: string; type: RecordedTestType; result: TestResult; performedAt: string; indicatorLot: string | null; indicatorExpiry: string | null;
  incubationStart: string | null; readAt: string | null; controlResult: IbControl | null; notes: string | null; recordedBy: string;
  sterilizerId: string; loadId: string | null; replacesId: string | null; justification: string | null; current: boolean; attachments: AttachmentDto[];
}

export interface ItemUseDto {
  id: string; usedAt: string; sectorId: string; surgeryId: string | null; patient: PatientRef | null; procedure: string | null; recordedBy: string;
}

export interface LoadItemDto {
  id: string; position: number; labelCode: string; setId: string | null; setCode: string | null; description: string; quantity: number;
  packaging: PackagingType; implant: boolean; expiresOn: string | null; use: ItemUseDto | null;
}

export interface LoadSummary {
  id: string; code: string; sterilizerId: string; sterilizerName: string; program: string; startedAt: string; endedAt: string | null;
  physical: PhysicalResult | null; status: LoadStatus; suggestion: LoadStatus; hasImplant: boolean; items: number; used: number;
  origin: DataOrigin; reprocessedFromId: string | null;
}

export interface PolicySnapshot { version: number; requiredLoadTests: SterilizationTestType[]; requireDailyBowieDick: boolean; holdImplantsUntilBiological: boolean; referenceId: string | null }

export interface LoadDecisionDto {
  id: string; from: LoadStatus | null; to: LoadStatus; at: string; by: string; justification: string;
  policy: PolicySnapshot | null; evaluation: { status: LoadStatus; reasons: string[] };
}

export interface LoadDetail extends LoadSummary {
  operatorName: string; temperatureC: number | null; pressureKpa: number | null; exposureMinutes: number | null; notes: string | null; rowVersion: number;
  evaluation: LoadReleaseEvaluation; policy: PolicySnapshot | null; bowieDickApplies: boolean; equipmentBowieDick: CmeTestDto | null;
  tests: CmeTestDto[]; itemList: LoadItemDto[]; decisions: LoadDecisionDto[]; exposed: { patients: number; surgeries: number };
  reprocessedIntoId: string | null;
}

export interface CmeOverview {
  awaiting: number; retained: number; releasedToday: number; ibPending: number; recalled30d: number;
  sterilizers: SterilizerDto[];
}

/** One link of the traceability chain: package → load → sterilizer, and package → use → surgery → patient. */
export interface TraceRow {
  itemId: string; labelCode: string; description: string; setCode: string | null; implant: boolean;
  loadId: string; loadCode: string; loadStatus: LoadStatus; cycleStartedAt: string; sterilizerName: string; expiresOn: string | null;
  /** When the load reached its current status (last release decision). */
  statusAt: string | null;
  use: ItemUseDto | null;
}
export interface TraceResult { query: string; rows: TraceRow[]; truncated: boolean }

/** Materials used in a surgery (backward traceability from the surgical record). */
export interface SurgeryMaterialDto {
  useId: string; itemId: string; labelCode: string; description: string; implant: boolean; loadId: string; loadCode: string; loadStatus: LoadStatus;
  sterilizerName: string; cycleStartedAt: string; usedAt: string;
}
