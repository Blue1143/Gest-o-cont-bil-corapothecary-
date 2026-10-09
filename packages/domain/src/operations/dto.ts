import type { DataOrigin } from '../provenance';
import type { BundleMethod, StockEvaluation } from '../rules/operations';
import type { ActionStatus, AuditKind, AuditStatus, NcOrigin, NcSeverity, NcStatus } from './quality';
import type { BundleMetric, HandHygieneCategory } from './bundles';
import type { AlertKind, AlertPriority, AlertStatus, FollowupMethod, FollowupOutcome } from './alerts';
import type { RequiredTraining } from './training';
import type { MovementKind, SupplyCategory } from './supplies';
import type { AttachmentDto } from '../cme/dto';

/** Payloads of the operational modules (Phase 4), shared by the API and the web client. */

export interface BundleTemplateDto {
  id: string; code: string; name: string; metric: BundleMetric | null; method: BundleMethod; referenceId: string | null; active: boolean; rowVersion: number;
  items: Array<{ id: string; position: number; label: string }>;
}

export interface BundleAuditDto {
  id: string; templateId: string; templateName: string; sectorId: string; auditedAt: string; result: 'conforme' | 'nao_conforme'; method: string;
  notes: string | null; auditorName: string; voided: boolean; voidReason: string | null; origin: DataOrigin;
  answers: Array<{ itemId: string; label: string; answer: 'conforme' | 'nao_conforme' | 'nao_aplicavel' }>;
}

export interface BundleSummaryRow { templateId: string; sectorId: string; audits: number; compliant: number }
export interface BundleItemPareto { templateId: string; itemId: string; label: string; nonCompliant: number }
export interface BundleSummary { rows: BundleSummaryRow[]; pareto: BundleItemPareto[] }

export interface HandHygieneDto {
  id: string; sectorId: string; observedAt: string; category: HandHygieneCategory; opportunities: number; actions: number; observerName: string;
  voided: boolean; voidReason: string | null; origin: DataOrigin;
}
export interface HandHygieneSummaryRow { sectorId: string; category: HandHygieneCategory; opportunities: number; actions: number }

export interface StatusEntryDto { id: string; from: string | null; to: string; at: string; by: string; justification: string }

export interface QualityAuditDto {
  id: string; title: string; kind: AuditKind; sectorId: string | null; scope: string | null; plannedFor: string; status: AuditStatus; findings: string | null;
  rowVersion: number; origin: DataOrigin; nonconformities: number; openNonconformities: number; updatedAt: string;
}
export interface QualityAuditDetail extends QualityAuditDto { history: StatusEntryDto[]; ncs: NonconformityDto[] }

export interface ActionPlanDto {
  id: string; what: string; why: string; where: string; who: string; dueOn: string; how: string; howMuch: string | null; status: ActionStatus;
  completedOn: string | null; rowVersion: number; overdue: boolean;
}
export interface NonconformityDto {
  id: string; auditId: string | null; auditTitle: string | null; sectorId: string | null; origin: NcOrigin; severity: NcSeverity; description: string;
  detectedOn: string; status: NcStatus; effectiveness: string | null; rowVersion: number; dataOrigin: DataOrigin; actionsTotal: number; actionsOpen: number; actionsOverdue: number;
}
export interface NonconformityDetail extends NonconformityDto { history: StatusEntryDto[]; actions: ActionPlanDto[] }

export interface AlertDto {
  id: string; kind: AlertKind; priority: AlertPriority; status: AlertStatus; title: string; detail: string; entity: string; entityId: string | null;
  sectorId: string | null; createdAt: string; lastSeenAt: string; assignedName: string | null; assignedAt: string | null; closedAt: string | null;
  closedByName: string | null; resolution: string | null; rowVersion: number; link: string | null;
}
export interface AlertSummary { open: number; byPriority: Record<AlertPriority, number>; assignedToMe: number }

export interface TrainingDto {
  id: string; title: string; theme: string; mandatory: boolean; validityMonths: number | null; targetJobRoleIds: string[]; description: string | null;
  active: boolean; rowVersion: number; sessions: number; required: number; covered: number; expiring: number; overdue: number;
}
export interface TrainingSessionDto { id: string; trainingId: string; heldOn: string; instructor: string; hours: number; sectorId: string | null; notes: string | null; attendees: number; origin: DataOrigin; attachments: AttachmentDto[] }
export interface StaffMember { id: string; name: string; jobRoleId: string | null; jobRole: string | null; sectorId: string | null; active: boolean }
export interface TrainingCoveragePayload {
  rows: Array<RequiredTraining & { professionalName: string }>;
  bySector: Array<{ sectorId: string; trainingId: string; required: number; covered: number }>;
  jobRoles: Array<{ id: string; name: string }>;
}

export interface SupplyLotDto { id: string; lot: string; expiresOn: string | null; quantity: number }
export interface SupplyDto {
  id: string; code: string; name: string; category: SupplyCategory; unit: string; minCoverageDays: number | null; active: boolean; rowVersion: number;
  quantity: number; dailyConsumption: number | null; evaluation: StockEvaluation; lots: SupplyLotDto[];
}
export interface SupplyMovementDto { id: string; lot: string; kind: MovementKind; delta: number; sectorId: string | null; occurredAt: string; reason: string | null; by: string }

export interface FollowupDto { id: string; contactedOn: string; method: FollowupMethod; outcome: FollowupOutcome; notes: string | null; caseId: string | null; by: string }
export interface SurveillanceRow {
  surgeryId: string; patient: { id: string; recordNumber: string; initials: string }; procedure: string; surgeryDate: string; dischargedAt: string | null;
  windowEnd: string; implant: boolean; lastContact: string | null; contacts: number; suspicion: boolean;
}
