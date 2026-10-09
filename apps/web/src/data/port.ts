import type { DataOrigin, FactRow, InstitutionData, Permission, SterilizationTestType, WithProvenance } from '@ccih/domain';

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
  rowVersion: number;
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

export interface CcihDataSource {
  readonly origin: DataOrigin;
  readonly auth?: AuthPort;
  readonly admin?: AdminPort;
  getInstitution(): Promise<WithProvenance<InstitutionData>>;
  getFacts(query: FactsQuery): Promise<WithProvenance<{ rows: FactRow[] }>>;
}
