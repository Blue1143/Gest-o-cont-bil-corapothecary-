import { sql, type Kysely } from 'kysely';

/**
 * Phase 4 operations: bundles and hand hygiene, quality audits with non-conformities and 5W2H
 * action plans, alert center, trainings, supplies (lot ledger), post-discharge SSI surveillance and
 * user password lifecycle. Histories and ledgers are append-only.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE professional ADD COLUMN sector_id uuid REFERENCES sector(id);
    ALTER TABLE app_user ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

    CREATE TABLE bundle_template (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      code text NOT NULL CHECK (code ~ '^[a-z0-9-]{2,40}$'),
      name text NOT NULL,
      metric text CHECK (metric IN ('cvc', 'vm', 'svd')),
      method text NOT NULL CHECK (method IN ('tudo_ou_nada', 'por_item')),
      reference_id uuid REFERENCES clinical_reference(id),
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code)
    );
    -- One active template per catalog indicator, so the adherence metric has a single definition.
    CREATE UNIQUE INDEX bundle_template_metric_idx ON bundle_template (institution_id, metric) WHERE active AND metric IS NOT NULL;

    CREATE TABLE bundle_item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id uuid NOT NULL REFERENCES bundle_template(id),
      position integer NOT NULL,
      label text NOT NULL,
      active boolean NOT NULL DEFAULT true
    );
    CREATE INDEX bundle_item_template_idx ON bundle_item (template_id);

    CREATE TABLE bundle_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      template_id uuid NOT NULL REFERENCES bundle_template(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      admission_id uuid REFERENCES admission(id),
      audited_at timestamptz NOT NULL,
      method text NOT NULL,
      result text NOT NULL CHECK (result IN ('conforme', 'nao_conforme')),
      notes text,
      auditor_id uuid REFERENCES app_user(id),
      auditor_name text NOT NULL,
      voided_at timestamptz,
      voided_by_name text,
      void_reason text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((voided_at IS NULL) = (void_reason IS NULL))
    );
    CREATE INDEX bundle_audit_period_idx ON bundle_audit (institution_id, audited_at);

    CREATE TABLE bundle_audit_answer (
      audit_id uuid NOT NULL REFERENCES bundle_audit(id),
      item_id uuid NOT NULL REFERENCES bundle_item(id),
      item_label text NOT NULL, -- frozen: later edits of the template do not rewrite past audits
      answer text NOT NULL CHECK (answer IN ('conforme', 'nao_conforme', 'nao_aplicavel')),
      PRIMARY KEY (audit_id, item_id)
    );

    CREATE TABLE hand_hygiene_observation (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      observed_at timestamptz NOT NULL,
      category text NOT NULL CHECK (category IN ('enfermagem', 'medica', 'fisioterapia', 'apoio', 'outros')),
      opportunities integer NOT NULL CHECK (opportunities > 0),
      actions integer NOT NULL CHECK (actions >= 0),
      observer_id uuid REFERENCES app_user(id),
      observer_name text NOT NULL,
      voided_at timestamptz,
      voided_by_name text,
      void_reason text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (actions <= opportunities),
      CHECK ((voided_at IS NULL) = (void_reason IS NULL))
    );
    CREATE INDEX hh_period_idx ON hand_hygiene_observation (institution_id, observed_at);

    CREATE TABLE quality_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      title text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('processo', 'estrutura', 'documental', 'outro')),
      sector_id uuid REFERENCES sector(id),
      scope text,
      planned_for date NOT NULL,
      status text NOT NULL CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'plano_de_acao', 'verificacao_eficacia', 'encerrada', 'cancelada')),
      findings text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1
    );

    CREATE TABLE quality_audit_status (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      audit_id uuid NOT NULL REFERENCES quality_audit(id),
      from_status text,
      to_status text NOT NULL,
      justification text NOT NULL,
      decided_by uuid REFERENCES app_user(id),
      decided_by_name text NOT NULL,
      at timestamptz NOT NULL
    );

    CREATE TABLE nonconformity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      audit_id uuid REFERENCES quality_audit(id),
      sector_id uuid REFERENCES sector(id),
      origin text NOT NULL CHECK (origin IN ('auditoria', 'bundle', 'higiene_maos', 'cme', 'notificacao', 'outro')),
      severity text NOT NULL CHECK (severity IN ('baixa', 'media', 'alta')),
      description text NOT NULL,
      detected_on date NOT NULL,
      status text NOT NULL CHECK (status IN ('aberta', 'em_tratamento', 'aguardando_eficacia', 'encerrada', 'cancelada')),
      effectiveness text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1
    );

    CREATE TABLE nonconformity_status (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nonconformity_id uuid NOT NULL REFERENCES nonconformity(id),
      from_status text,
      to_status text NOT NULL,
      justification text NOT NULL,
      decided_by uuid REFERENCES app_user(id),
      decided_by_name text NOT NULL,
      at timestamptz NOT NULL
    );

    CREATE TABLE action_plan (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nonconformity_id uuid NOT NULL REFERENCES nonconformity(id),
      what text NOT NULL,
      why text NOT NULL,
      where_text text NOT NULL,
      who_name text NOT NULL,
      due_on date NOT NULL,
      how text NOT NULL,
      how_much text,
      status text NOT NULL CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
      completed_on date,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      CHECK ((status = 'concluida') = (completed_on IS NOT NULL))
    );
    CREATE INDEX action_plan_nc_idx ON action_plan (nonconformity_id);

    CREATE TABLE alert (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      kind text NOT NULL,
      dedup_key text NOT NULL,
      priority text NOT NULL CHECK (priority IN ('alta', 'media', 'baixa')),
      status text NOT NULL CHECK (status IN ('aberto', 'assumido', 'encerrado')),
      title text NOT NULL,
      detail text NOT NULL,
      entity text NOT NULL,
      entity_id text,
      sector_id uuid REFERENCES sector(id),
      link text,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      assigned_to uuid REFERENCES app_user(id),
      assigned_name text,
      assigned_at timestamptz,
      closed_at timestamptz,
      closed_by_name text,
      resolution text,
      row_version integer NOT NULL DEFAULT 1,
      CHECK ((status = 'encerrado') = (closed_at IS NOT NULL AND resolution IS NOT NULL))
    );
    CREATE UNIQUE INDEX alert_open_key_idx ON alert (institution_id, dedup_key) WHERE status <> 'encerrado';
    CREATE INDEX alert_status_idx ON alert (institution_id, status, priority);

    CREATE TABLE training (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      title text NOT NULL,
      theme text NOT NULL,
      mandatory boolean NOT NULL,
      validity_months integer CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 120),
      target_job_role_ids uuid[] NOT NULL DEFAULT '{}',
      description text,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, title)
    );

    CREATE TABLE training_session (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      training_id uuid NOT NULL REFERENCES training(id),
      held_on date NOT NULL,
      instructor text NOT NULL,
      hours numeric(4, 1) NOT NULL CHECK (hours > 0),
      sector_id uuid REFERENCES sector(id),
      notes text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE training_attendance (
      session_id uuid NOT NULL REFERENCES training_session(id),
      professional_id uuid NOT NULL REFERENCES professional(id),
      present boolean NOT NULL,
      score numeric(5, 1) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
      PRIMARY KEY (session_id, professional_id)
    );

    CREATE TABLE supply (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      code text NOT NULL CHECK (code ~ '^[a-z0-9-]{2,40}$'),
      name text NOT NULL,
      category text NOT NULL CHECK (category IN ('preparacao_alcoolica', 'sabonete', 'epi', 'antisseptico', 'saneante', 'outro')),
      unit text NOT NULL,
      min_coverage_days integer CHECK (min_coverage_days IS NULL OR min_coverage_days > 0),
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code)
    );

    CREATE TABLE supply_lot (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      supply_id uuid NOT NULL REFERENCES supply(id),
      lot text NOT NULL,
      expires_on date,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (supply_id, lot)
    );

    CREATE TABLE supply_movement (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lot_id uuid NOT NULL REFERENCES supply_lot(id),
      kind text NOT NULL CHECK (kind IN ('entrada', 'consumo', 'ajuste', 'descarte')),
      delta numeric(12, 2) NOT NULL CHECK (delta <> 0),
      sector_id uuid REFERENCES sector(id),
      occurred_at timestamptz NOT NULL,
      reason text,
      created_by uuid REFERENCES app_user(id),
      created_by_name text NOT NULL,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (kind <> 'consumo' OR sector_id IS NOT NULL),
      CHECK (kind NOT IN ('ajuste', 'descarte') OR reason IS NOT NULL)
    );
    CREATE INDEX supply_movement_lot_idx ON supply_movement (lot_id, occurred_at);

    CREATE TABLE ssi_followup (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      surgery_id uuid NOT NULL REFERENCES surgery(id),
      contacted_on date NOT NULL,
      method text NOT NULL CHECK (method IN ('telefone', 'ambulatorio', 'retorno', 'mensagem', 'outro')),
      outcome text NOT NULL CHECK (outcome IN ('sem_sinais', 'suspeita', 'nao_localizado')),
      notes text,
      case_id uuid REFERENCES iras_case(id),
      recorded_by uuid REFERENCES app_user(id),
      recorded_by_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ssi_followup_surgery_idx ON ssi_followup (surgery_id);

    CREATE TRIGGER quality_audit_status_append_only BEFORE UPDATE OR DELETE ON quality_audit_status FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER nonconformity_status_append_only BEFORE UPDATE OR DELETE ON nonconformity_status FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER supply_movement_append_only BEFORE UPDATE OR DELETE ON supply_movement FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER ssi_followup_append_only BEFORE UPDATE OR DELETE ON ssi_followup FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER bundle_audit_answer_append_only BEFORE UPDATE OR DELETE ON bundle_audit_answer FOR EACH ROW EXECUTE FUNCTION append_only();

    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['quality:configure'])) WHERE code IN ('admin', 'enf_ccih');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS ssi_followup, supply_movement, supply_lot, supply, training_attendance, training_session, training, alert,
      action_plan, nonconformity_status, nonconformity, quality_audit_status, quality_audit, hand_hygiene_observation,
      bundle_audit_answer, bundle_audit, bundle_item, bundle_template CASCADE;
    ALTER TABLE professional DROP COLUMN IF EXISTS sector_id;
    ALTER TABLE app_user DROP COLUMN IF EXISTS must_change_password;
  `.execute(db);
}
