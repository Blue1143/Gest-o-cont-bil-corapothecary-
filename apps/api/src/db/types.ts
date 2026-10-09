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
}

export interface SectorTable {
  id: Generated<string>;
  institution_id: string;
  unit_id: string;
  code: string;
  name: string;
  kind: 'uti' | 'internacao' | 'centro_cirurgico' | 'cme' | 'apoio';
  active: Generated<boolean>;
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
}
