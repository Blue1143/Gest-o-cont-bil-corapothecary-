import { sql, type Kysely } from 'kysely';

/**
 * Phase 2 foundation: organization, access control, sessions, immutable audit log, configuration
 * (references, rule parameters, targets, CME release policy) and monthly indicator facts.
 * Ids are random UUIDs (no enumerable sequences exposed to clients).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE institution (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      cnes text,
      timezone text NOT NULL,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE unit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      UNIQUE (institution_id, name)
    );

    CREATE TABLE sector (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      unit_id uuid NOT NULL REFERENCES unit(id),
      code text NOT NULL CHECK (code ~ '^[a-z0-9-]{2,40}$'),
      name text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('uti', 'internacao', 'centro_cirurgico', 'cme', 'apoio')),
      active boolean NOT NULL DEFAULT true,
      UNIQUE (institution_id, code)
    );

    CREATE TABLE bed (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sector_id uuid NOT NULL REFERENCES sector(id),
      code text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      UNIQUE (sector_id, code)
    );

    CREATE TABLE job_role (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      name text NOT NULL,
      UNIQUE (institution_id, name)
    );

    CREATE TABLE professional (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      name text NOT NULL,
      registration text,
      job_role_id uuid REFERENCES job_role(id),
      active boolean NOT NULL DEFAULT true
    );

    CREATE TABLE role (
      institution_id uuid NOT NULL REFERENCES institution(id),
      code text NOT NULL,
      name text NOT NULL,
      permissions text[] NOT NULL DEFAULT '{}',
      PRIMARY KEY (institution_id, code)
    );

    CREATE TABLE app_user (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      professional_id uuid REFERENCES professional(id),
      login text NOT NULL CHECK (login ~ '^[a-z0-9._-]{3,60}$'),
      display_name text NOT NULL,
      password_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      scope_all boolean NOT NULL DEFAULT false,
      failed_attempts integer NOT NULL DEFAULT 0,
      locked_until timestamptz,
      last_login_at timestamptz,
      password_changed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (login)
    );

    CREATE TABLE user_role (
      user_id uuid NOT NULL REFERENCES app_user(id),
      institution_id uuid NOT NULL,
      role_code text NOT NULL,
      PRIMARY KEY (user_id, role_code),
      FOREIGN KEY (institution_id, role_code) REFERENCES role(institution_id, code)
    );

    CREATE TABLE user_scope (
      user_id uuid NOT NULL REFERENCES app_user(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      PRIMARY KEY (user_id, sector_id)
    );

    CREATE TABLE session (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_user(id),
      token_hash text NOT NULL UNIQUE,
      csrf_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      ip inet,
      user_agent text,
      revoked_at timestamptz,
      revoked_reason text
    );
    CREATE INDEX session_user_idx ON session (user_id) WHERE revoked_at IS NULL;

    CREATE TABLE audit_log (
      id bigserial PRIMARY KEY,
      occurred_at timestamptz NOT NULL,
      institution_id uuid,
      user_id uuid,
      user_login text,
      action text NOT NULL,
      entity text NOT NULL,
      entity_id text,
      before jsonb,
      after jsonb,
      ip text, -- text, not inet: the stored value must read back exactly as it was hashed
      user_agent text,
      context jsonb,
      prev_hash text NOT NULL,
      hash text NOT NULL UNIQUE
    );
    CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
    CREATE INDEX audit_log_user_idx ON audit_log (user_id, occurred_at);

    CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log é somente inserção: % não permitido', TG_OP;
    END $$;
    CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
    CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

    CREATE TABLE clinical_reference (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      code text NOT NULL CHECK (code ~ '^[a-z0-9-]{3,60}$'),
      title text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('regulatoria', 'diretriz', 'protocolo_institucional', 'literatura')),
      source text NOT NULL,
      doc_version text NOT NULL,
      updated_on date NOT NULL,
      validated_by uuid REFERENCES app_user(id),
      validated_by_name text,
      validated_at timestamptz,
      status text NOT NULL CHECK (status IN ('vigente', 'revisao_necessaria', 'arquivado')),
      notes text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code),
      CHECK (status <> 'vigente' OR validated_by IS NOT NULL)
    );

    CREATE TABLE rule_parameter (
      institution_id uuid NOT NULL REFERENCES institution(id),
      key text NOT NULL,
      value jsonb NOT NULL,
      reference_id uuid REFERENCES clinical_reference(id),
      approved_by uuid REFERENCES app_user(id),
      approved_by_name text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      PRIMARY KEY (institution_id, key)
    );

    CREATE TABLE indicator_target (
      institution_id uuid NOT NULL REFERENCES institution(id),
      indicator_id text NOT NULL,
      value double precision NOT NULL,
      direction text NOT NULL CHECK (direction IN ('lower', 'higher')),
      warning_band double precision CHECK (warning_band IS NULL OR warning_band >= 0),
      origin text NOT NULL CHECK (origin IN ('institucional', 'demonstracao')),
      approved_by uuid REFERENCES app_user(id),
      approved_by_name text,
      valid_from date NOT NULL,
      reference_id uuid REFERENCES clinical_reference(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      PRIMARY KEY (institution_id, indicator_id)
    );

    CREATE TABLE load_release_policy (
      institution_id uuid PRIMARY KEY REFERENCES institution(id),
      required_tests text[] NOT NULL,
      require_daily_bowie_dick boolean NOT NULL,
      hold_implants_until_biological boolean NOT NULL,
      reference_id uuid REFERENCES clinical_reference(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1
    );

    CREATE TABLE indicator_fact (
      institution_id uuid NOT NULL REFERENCES institution(id),
      period date NOT NULL CHECK (extract(day FROM period) = 1),
      sector_id uuid NOT NULL REFERENCES sector(id),
      metric text NOT NULL,
      value double precision NOT NULL CHECK (value >= 0),
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      consolidated_at timestamptz NOT NULL,
      PRIMARY KEY (institution_id, period, sector_id, metric)
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS indicator_fact, load_release_policy, indicator_target, rule_parameter, clinical_reference,
      session, user_scope, user_role, app_user, role, professional, job_role, bed, sector, unit, institution CASCADE;
    -- audit_log is deliberately kept: it is dropped only by a full database reset.
  `.execute(db);
}
