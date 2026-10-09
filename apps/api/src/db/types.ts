import type { ColumnType, Generated } from 'kysely';

/** Kysely table types. Dates (`date`) are kept as 'YYYY-MM-DD' strings; timestamps as Date. */
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Json = ColumnType<unknown, string, string>;
type NullableJson = ColumnType<unknown | null, string | null | undefined, string | null>;
type RowVersion = ColumnType<number, number | undefined, number>;

export type DataOriginColumn = 'real' | 'demo';

export interface InstitutionTable {
  id: Generated<string>;
  name: string;
  cnes: string | null;
  timezone: string;
  data_origin: DataOriginColumn;
  created_at: CreatedAt;
}

export interface UnitTable {
  id: Generated<string>;
  institution_id: string;
  name: string;
  active: Generated<boolean>;
  row_version: RowVersion;
}

export interface SectorTable {
  id: Generated<string>;
  institution_id: string;
  unit_id: string;
  code: string;
  name: string;
  kind: 'uti' | 'internacao' | 'centro_cirurgico' | 'cme' | 'apoio';
  active: Generated<boolean>;
  row_version: RowVersion;
}

export interface BedTable {
  id: Generated<string>;
  sector_id: string;
  code: string;
  active: Generated<boolean>;
}

export interface JobRoleTable {
  id: Generated<string>;
  institution_id: string;
  name: string;
}

export interface ProfessionalTable {
  id: Generated<string>;
  institution_id: string;
  name: string;
  registration: string | null;
  job_role_id: string | null;
  active: Generated<boolean>;
}

export interface RoleTable {
  institution_id: string;
  code: string;
  name: string;
  permissions: string[];
}

export interface AppUserTable {
  id: Generated<string>;
  institution_id: string;
  professional_id: string | null;
  login: string;
  display_name: string;
  password_hash: string;
  active: Generated<boolean>;
  scope_all: Generated<boolean>;
  failed_attempts: Generated<number>;
  locked_until: NullableTimestamp;
  last_login_at: NullableTimestamp;
  password_changed_at: Timestamp;
  created_at: CreatedAt;
  row_version: RowVersion;
}

export interface UserRoleTable {
  user_id: string;
  institution_id: string;
  role_code: string;
}

export interface UserScopeTable {
  user_id: string;
  sector_id: string;
}

export interface SessionTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  csrf_hash: string;
  created_at: CreatedAt;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  ip: string | null;
  user_agent: string | null;
  revoked_at: NullableTimestamp;
  revoked_reason: string | null;
}

export interface AuditLogTable {
  id: Generated<string>;
  occurred_at: Timestamp;
  institution_id: string | null;
  user_id: string | null;
  user_login: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: NullableJson;
  after: NullableJson;
  ip: string | null;
  user_agent: string | null;
  context: NullableJson;
  prev_hash: string;
  hash: string;
}

export interface ClinicalReferenceTable {
  id: Generated<string>;
  institution_id: string;
  code: string;
  title: string;
  kind: 'regulatoria' | 'diretriz' | 'protocolo_institucional' | 'literatura';
  source: string;
  doc_version: string;
  updated_on: string;
  validated_by: string | null;
  validated_by_name: string | null;
  validated_at: NullableTimestamp;
  status: 'vigente' | 'revisao_necessaria' | 'arquivado';
  notes: string | null;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface RuleParameterTable {
  institution_id: string;
  key: string;
  value: Json;
  reference_id: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface IndicatorTargetTable {
  institution_id: string;
  indicator_id: string;
  value: number;
  direction: 'lower' | 'higher';
  warning_band: number | null;
  origin: 'institucional' | 'demonstracao';
  approved_by: string | null;
  approved_by_name: string | null;
  valid_from: string;
  reference_id: string | null;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface LoadReleasePolicyTable {
  institution_id: string;
  required_tests: string[];
  require_daily_bowie_dick: boolean;
  hold_implants_until_biological: boolean;
  reference_id: string | null;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface IndicatorFactTable {
  institution_id: string;
  period: string;
  sector_id: string;
  metric: string;
  value: number;
  data_origin: DataOriginColumn;
  consolidated_at: Timestamp;
}

type Origin = DataOriginColumn;

export interface PatientTable {
  id: string;
  institution_id: string;
  record_number: string;
  initials: string;
  full_name_enc: string | null;
  birth_date: string | null;
  sex: 'F' | 'M' | 'NI';
  data_origin: Origin;
  created_at: CreatedAt;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface AdmissionTable {
  id: Generated<string>;
  institution_id: string;
  patient_id: string;
  admitted_at: Timestamp;
  discharged_at: NullableTimestamp;
  outcome: 'alta' | 'obito' | 'transferencia_externa' | null;
  diagnosis: string | null;
  data_origin: Origin;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface AdmissionMovementTable {
  id: Generated<string>;
  admission_id: string;
  sector_id: string;
  bed_id: string | null;
  start_at: Timestamp;
  end_at: NullableTimestamp;
  reason: string | null;
  created_by: string | null;
  created_at: CreatedAt;
}

export interface DeviceUseTable {
  id: Generated<string>;
  institution_id: string;
  admission_id: string;
  device_type: 'CVC' | 'PICC' | 'VM' | 'SVD' | 'PAI' | 'DRENO' | 'OUTRO';
  site: string | null;
  indication: string | null;
  inserted_at: Timestamp;
  removed_at: NullableTimestamp;
  removal_reason: string | null;
  data_origin: Origin;
  created_by: string | null;
  created_at: CreatedAt;
  row_version: RowVersion;
}

export interface ProcedureCatalogTable {
  id: Generated<string>;
  institution_id: string;
  code: string;
  name: string;
  specialty: string;
  p75_minutes: number | null;
  p75_source: string | null;
  active: Generated<boolean>;
}

export interface SurgeryTable {
  id: Generated<string>;
  institution_id: string;
  admission_id: string;
  procedure_id: string;
  surgeon_id: string;
  sector_id: string;
  room: string | null;
  started_at: Timestamp;
  ended_at: NullableTimestamp;
  wound_class: 'limpa' | 'potencialmente_contaminada' | 'contaminada' | 'infectada' | null;
  asa: number | null;
  implant: boolean;
  urgency: boolean;
  prophylaxis_indicated: boolean | null;
  prophylaxis_drug: string | null;
  prophylaxis_dose_at: NullableTimestamp;
  /** numeric: pg returns a string. */
  prophylaxis_duration_h: ColumnType<string | null, number | null, number | null>;
  redose: boolean | null;
  notes: string | null;
  data_origin: Origin;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface CultureTable {
  id: Generated<string>;
  institution_id: string;
  admission_id: string;
  sector_id: string;
  material: string;
  collected_at: Timestamp;
  origin: 'manual' | 'lis';
  data_origin: Origin;
  created_by: string | null;
  created_at: CreatedAt;
}

export interface CultureResultTable {
  id: Generated<string>;
  culture_id: string;
  version: number;
  outcome: 'negativa' | 'positiva' | 'contaminada';
  reported_at: Timestamp;
  breakpoint_version: string | null;
  notes: string | null;
  justification: string | null;
  recorded_by: string | null;
  recorded_by_name: string;
  created_at: CreatedAt;
}

export interface IsolateTable {
  id: Generated<string>;
  result_id: string;
  organism: string;
  quantity: string | null;
  resistance_profile: 'MDR' | 'XDR' | 'PDR' | null;
  mechanism: string | null;
}

export interface SusceptibilityTable {
  id: Generated<string>;
  isolate_id: string;
  antimicrobial: string;
  mic: string | null;
  interpretation: 'S' | 'I' | 'R';
}

export interface IrasCaseTable {
  id: Generated<string>;
  institution_id: string;
  admission_id: string;
  iras_type: 'IPCS' | 'PAV' | 'ITU-AC' | 'ISC' | 'OUTRA';
  status: 'suspeita' | 'em_investigacao' | 'confirmada' | 'descartada';
  event_date: string;
  sector_id: string;
  device_associated: boolean | null;
  device_use_id: string | null;
  surgery_id: string | null;
  criterion_reference_id: string | null;
  criterion_snapshot: NullableJson;
  description: string | null;
  data_origin: Origin;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
  row_version: RowVersion;
}

export interface IrasCaseStatusTable {
  id: Generated<string>;
  case_id: string;
  from_status: string | null;
  to_status: string;
  justification: string;
  decided_by: string | null;
  decided_by_name: string;
  at: Timestamp;
}

export interface IrasCaseCultureTable {
  case_id: string;
  culture_id: string;
}

export interface CcihNoteTable {
  id: Generated<string>;
  institution_id: string;
  patient_id: string;
  admission_id: string | null;
  case_id: string | null;
  kind: 'avaliacao' | 'conduta' | 'recomendacao' | 'acompanhamento' | 'retificacao';
  body: string;
  amends_id: string | null;
  justification: string | null;
  author_id: string | null;
  author_name: string;
  data_origin: Origin;
  created_at: CreatedAt;
}

export interface DB {
  institution: InstitutionTable;
  unit: UnitTable;
  sector: SectorTable;
  bed: BedTable;
  job_role: JobRoleTable;
  professional: ProfessionalTable;
  role: RoleTable;
  app_user: AppUserTable;
  user_role: UserRoleTable;
  user_scope: UserScopeTable;
  session: SessionTable;
  audit_log: AuditLogTable;
  clinical_reference: ClinicalReferenceTable;
  rule_parameter: RuleParameterTable;
  indicator_target: IndicatorTargetTable;
  load_release_policy: LoadReleasePolicyTable;
  indicator_fact: IndicatorFactTable;
  patient: PatientTable;
  admission: AdmissionTable;
  admission_movement: AdmissionMovementTable;
  device_use: DeviceUseTable;
  procedure_catalog: ProcedureCatalogTable;
  surgery: SurgeryTable;
  culture: CultureTable;
  culture_result: CultureResultTable;
  isolate: IsolateTable;
  susceptibility: SusceptibilityTable;
  iras_case: IrasCaseTable;
  iras_case_status: IrasCaseStatusTable;
  iras_case_culture: IrasCaseCultureTable;
  ccih_note: CcihNoteTable;
}
