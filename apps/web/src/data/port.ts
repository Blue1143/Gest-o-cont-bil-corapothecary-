import type {
  CensusMonthPayload, CensusPayload, CultureDetail, CultureSummary, DataOrigin, FactRow, InstitutionData, InvestigationStatus, IrasCaseDetail, IrasCaseSummary,
  MetricKey, OrgPayload, Paged, PatientDetail, PatientSummary, Permission, Procedure, Professional, SterilizationTestType, SurgeryDetail, SurgerySummary, WithProvenance,
} from '@ccih/domain';

export type { InstitutionData, Sector, SectorKind, Unit } from '@ccih/domain';

/**
 * The only contract the UI knows. The demo source and the HTTP API source implement it;
 * screens never import mock data directly. `auth` and `admin` exist only with a backend.
 */
export interface FactsQuery {
  /** Inclusive month starts (YYYY-MM-01). */
  from: string;
  to: string;
}

export interface SessionInfo {
  user: { id: string; login: string; displayName: string };
  roles: string[];
  permissions: Permission[];
  /** null = every sector of the institution. */
  scope: string[] | null;
  session: { expiresAt: string; idleExpiresAt: string; idleMinutes: number };
}

export interface AuthPort {
  /** null when nobody is signed in. */
  me(): Promise<SessionInfo | null>;
  login(login: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

export interface ConfigVersions {
  targets: Array<{ indicator_id: string; row_version: number; approved_by_name: string | null; updated_at: string }>;
  rules: Array<{ key: string; row_version: number; approved_by_name: string | null; updated_at: string }>;
  references: Array<{ id: string; code: string; row_version: number }>;
  policy: { row_version: number; updated_at: string } | null;
}

export interface Justified {
  justification: string;
}

export interface TargetInput extends Justified {
  value: number;
  warningBand: number | null;
  referenceId: string | null;
  rowVersion: number | null;
}

export interface RuleInput extends Justified {
  value: unknown;
  referenceId: string | null;
  /** null when the parameter has never been configured. */
  rowVersion: number | null;
}

export interface ReferenceInput extends Justified {
  title: string;
  kind: 'regulatoria' | 'diretriz' | 'protocolo_institucional' | 'literatura';
  source: string;
  version: string;
  updatedAt: string;
  notes: string | null;
}

export interface PolicyInput extends Justified {
  requiredLoadTests: SterilizationTestType[];
  requireDailyBowieDick: boolean;
  holdImplantsUntilBiological: boolean;
  referenceId: string | null;
  rowVersion: number;
}

export interface AdminUser {
  id: string;
  login: string;
  displayName: string;
  active: boolean;
  scopeAll: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  rowVersion: number;
  roles: string[];
  sectorIds: string[];
}

export interface UserAccessInput extends Justified {
  roles: string[];
  scopeAll: boolean;
  sectorIds: string[];
  active: boolean;
  rowVersion: number;
}

export interface AuditRow {
  id: string;
  occurred_at: string;
  user_login: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  context: Record<string, unknown> | null;
}

export interface AuditPage {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminPort {
  versions(): Promise<ConfigVersions>;
  saveTarget(indicatorId: string, input: TargetInput): Promise<void>;
  deleteTarget(indicatorId: string, justification: string): Promise<void>;
  saveRule(key: string, input: RuleInput): Promise<void>;
  createReference(input: ReferenceInput & { code: string }): Promise<void>;
  updateReference(id: string, input: ReferenceInput & { rowVersion: number }): Promise<void>;
  validateReference(id: string, input: Justified & { status: 'vigente' | 'revisao_necessaria' | 'arquivado'; rowVersion: number }): Promise<void>;
  savePolicy(input: PolicyInput): Promise<void>;
  users(): Promise<{ users: AdminUser[]; roleLabels: Record<string, string> }>;
  roles(): Promise<{ roles: Array<{ code: string; name: string; permissions: string[] }>; permissions: Record<string, string> }>;
  patchUser(id: string, input: UserAccessInput): Promise<void>;
  unlockUser(id: string): Promise<void>;
  audit(query: { entity?: string; action?: string; page: number; pageSize: number }): Promise<AuditPage>;
  verifyAudit(): Promise<{ ok: boolean; checked: number; brokenAtId: string | null }>;
  logExport(event: { resource: string; rows: number; filters?: Record<string, string> }): Promise<void>;
}

/* ---------- Clinical (Phase 3) ---------- */

export type Query = Record<string, string | number | undefined>;

export interface AdmissionInput { admittedAt: string; sectorId: string; bedId: string | null; diagnosis: string | null }
export interface PatientInput { recordNumber: string; initials: string; fullName: string | null; birthDate: string | null; sex: 'F' | 'M' | 'NI'; admission: AdmissionInput | null }
export interface PatientUpdateInput extends Justified { initials: string; birthDate: string | null; sex: 'F' | 'M' | 'NI'; fullName?: string | null; rowVersion: number }
export interface CaseLinks { deviceUseId: string | null; surgeryId: string | null; cultureIds: string[] }
export interface CaseInput extends CaseLinks, Justified { admissionId: string; type: IrasCaseSummary['type']; eventDate: string; sectorId: string; description: string | null }
export interface CaseUpdateInput extends CaseLinks, Justified { type: IrasCaseSummary['type']; eventDate: string; sectorId: string; description: string | null; rowVersion: number }
export interface CaseStatusInput extends Justified { to: InvestigationStatus; criterionReferenceId: string | null; deviceAssociated: boolean | null; rowVersion: number }
export interface SurgeryInput {
  procedureId: string; surgeonId: string; sectorId: string; room: string | null; startedAt: string; endedAt: string | null;
  woundClass: SurgerySummary['woundClass']; asa: number | null; implant: boolean; urgency: boolean; prophylaxisIndicated: boolean | null;
  prophylaxisDrug: string | null; prophylaxisDoseAt: string | null; prophylaxisDurationH: number | null; redose: boolean | null; notes: string | null;
}
export interface IsolateInput {
  organism: string; quantity: string | null; resistanceProfile: 'MDR' | 'XDR' | 'PDR' | null; mechanism: string | null;
  susceptibility: Array<{ antimicrobial: string; mic: string | null; interpretation: 'S' | 'I' | 'R' }>;
}
export interface CultureResultInput { outcome: 'negativa' | 'positiva' | 'contaminada'; reportedAt: string; breakpointVersion: string | null; notes: string | null; isolates: IsolateInput[]; justification: string | null }
export interface ConsolidationSummary { months: string[]; rows: number; metrics: MetricKey[]; skipped: string[]; origin: DataOrigin; partialMonth: boolean }
export interface RevealResult { fullName: string | null; available: boolean; reason: string | null }

export interface ClinicalPort {
  org(): Promise<OrgPayload>;
  patients(q: Query): Promise<Paged<PatientSummary>>;
  patient(id: string): Promise<PatientDetail>;
  createPatient(input: PatientInput): Promise<{ id: string }>;
  updatePatient(id: string, input: PatientUpdateInput): Promise<void>;
  revealName(id: string, reason: string): Promise<RevealResult>;
  admit(patientId: string, input: AdmissionInput): Promise<{ id: string }>;
  transfer(admissionId: string, input: { at: string; sectorId: string; bedId: string | null; reason: string | null; rowVersion: number }): Promise<void>;
  discharge(admissionId: string, input: { at: string; outcome: 'alta' | 'obito' | 'transferencia_externa'; rowVersion: number }): Promise<{ devicesClosed: number }>;
  addDevice(admissionId: string, input: { type: string; site: string | null; indication: string | null; insertedAt: string }): Promise<void>;
  removeDevice(deviceId: string, input: { removedAt: string; reason: string; rowVersion: number }): Promise<void>;
  addNote(patientId: string, input: { kind: string; body: string; admissionId: string | null; caseId: string | null }): Promise<void>;
  amendNote(noteId: string, input: { body: string; justification: string }): Promise<void>;
  census(date?: string): Promise<CensusPayload>;
  censusMonth(month: string): Promise<CensusMonthPayload>;
  cases(q: Query): Promise<Paged<IrasCaseSummary> & { counts: Record<InvestigationStatus, number> }>;
  case(id: string): Promise<IrasCaseDetail>;
  createCase(input: CaseInput): Promise<{ id: string }>;
  updateCase(id: string, input: CaseUpdateInput): Promise<void>;
  changeCaseStatus(id: string, input: CaseStatusInput): Promise<{ criterionValidated: boolean | null }>;
  surgeries(q: Query): Promise<Paged<SurgerySummary>>;
  surgery(id: string): Promise<SurgeryDetail>;
  createSurgery(input: SurgeryInput & { admissionId: string }): Promise<{ id: string }>;
  updateSurgery(id: string, input: SurgeryInput & Justified & { rowVersion: number }): Promise<void>;
  professionals(): Promise<{ professionals: Professional[] }>;
  procedures(): Promise<{ procedures: Procedure[] }>;
  cultures(q: Query): Promise<Paged<CultureSummary>>;
  culture(id: string): Promise<CultureDetail>;
  createCulture(input: { admissionId: string; sectorId: string; material: string; collectedAt: string }): Promise<{ id: string }>;
  addCultureResult(id: string, input: CultureResultInput): Promise<{ version: number }>;
  consolidate(months: string[]): Promise<ConsolidationSummary>;
}

export interface OrgAdminPort {
  createUnit(input: Justified & { name: string }): Promise<void>;
  updateUnit(id: string, input: Justified & { name: string; active: boolean; rowVersion: number }): Promise<void>;
  createSector(input: Justified & { unitId: string; code: string; name: string; kind: string }): Promise<void>;
  updateSector(id: string, input: Justified & { unitId: string; name: string; kind: string; active: boolean; rowVersion: number }): Promise<void>;
  addBeds(sectorId: string, input: Justified & { codes: string[] }): Promise<void>;
  updateBed(id: string, input: Justified & { active: boolean }): Promise<void>;
}

export interface CcihDataSource {
  readonly origin: DataOrigin;
  readonly auth?: AuthPort;
  readonly admin?: AdminPort;
  /** Clinical modules exist only with the backend (no synthetic patients in the browser). */
  readonly clinical?: ClinicalPort;
  readonly orgAdmin?: OrgAdminPort;
  getInstitution(): Promise<WithProvenance<InstitutionData>>;
  getFacts(query: FactsQuery): Promise<WithProvenance<{ rows: FactRow[] }>>;
}
