import { sql, type Kysely } from 'kysely';

/**
 * Phase 5 — CME: sterilizers, instrument set catalog, loads (one per cycle run, with the cycle's
 * physical record), packages with traceability labels, versioned quality tests, immutable release
 * decisions with the policy snapshot, package use (surgery → patient) and validated attachments.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE sterilizer (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      code text NOT NULL CHECK (code ~ '^[a-z0-9-]{2,20}$'),
      name text NOT NULL,
      type text NOT NULL CHECK (type IN ('vapor_prevacuo', 'vapor_gravitacional', 'peroxido_plasma', 'oxido_etileno', 'outro')),
      serial text,
      status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao', 'inativo')),
      status_reason text,
      qualification_due_on date,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code),
      CHECK (status = 'ativo' OR status_reason IS NOT NULL)
    );

    CREATE TABLE instrument_set (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      code text NOT NULL CHECK (code ~ '^[a-z0-9-]{2,40}$'),
      name text NOT NULL,
      specialty text,
      composition text,
      item_count integer CHECK (item_count > 0),
      packaging text NOT NULL CHECK (packaging IN ('papel_grau_cirurgico', 'sms', 'container_rigido', 'tecido_algodao', 'outro')),
      implant boolean NOT NULL DEFAULT false,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code)
    );

    CREATE TABLE sterilization_load (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      sterilizer_id uuid NOT NULL REFERENCES sterilizer(id),
      code text NOT NULL,
      program text NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      operator_id uuid REFERENCES app_user(id),
      operator_name text NOT NULL,
      temperature_c numeric(5,1),
      pressure_kpa numeric(6,1),
      exposure_minutes integer CHECK (exposure_minutes > 0),
      physical_result text CHECK (physical_result IN ('conforme', 'nao_conforme')),
      notes text,
      status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'liberada', 'retida', 'rejeitada', 'reprocessamento')),
      has_implant boolean NOT NULL DEFAULT false,
      reprocessed_from_id uuid UNIQUE REFERENCES sterilization_load(id),
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code),
      CHECK (ended_at IS NULL OR ended_at > started_at),
      -- A finished cycle always carries its physical record.
      CHECK ((ended_at IS NULL) = (physical_result IS NULL))
    );
    CREATE INDEX sterilization_load_sterilizer_idx ON sterilization_load (sterilizer_id, started_at);
    CREATE INDEX sterilization_load_status_idx ON sterilization_load (institution_id, status);

    CREATE TABLE load_item (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      load_id uuid NOT NULL REFERENCES sterilization_load(id),
      position integer NOT NULL CHECK (position > 0),
      label_code text NOT NULL,
      set_id uuid REFERENCES instrument_set(id),
      description text NOT NULL,
      quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
      packaging text NOT NULL CHECK (packaging IN ('papel_grau_cirurgico', 'sms', 'container_rigido', 'tecido_algodao', 'outro')),
      implant boolean NOT NULL DEFAULT false,
      expires_on date,
      UNIQUE (load_id, position),
      UNIQUE (institution_id, label_code)
    );

    CREATE TABLE sterilization_test (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      sterilizer_id uuid NOT NULL REFERENCES sterilizer(id),
      load_id uuid REFERENCES sterilization_load(id),
      type text NOT NULL CHECK (type IN ('BOWIE_DICK', 'IQ1', 'IQ2', 'IQ3', 'IQ4', 'IQ5', 'IQ6', 'IB')),
      result text NOT NULL CHECK (result IN ('aprovado', 'reprovado', 'pendente')),
      performed_at timestamptz NOT NULL,
      performed_on date NOT NULL,
      indicator_lot text NOT NULL,
      indicator_expiry date NOT NULL,
      incubation_start timestamptz,
      read_at timestamptz,
      control_result text CHECK (control_result IN ('positivo', 'negativo')),
      notes text,
      recorded_by uuid REFERENCES app_user(id),
      recorded_by_name text NOT NULL,
      -- A correction or the reading of a pending IB is a new row pointing to the one it replaces.
      replaces_id uuid UNIQUE REFERENCES sterilization_test(id),
      justification text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((type = 'BOWIE_DICK') = (load_id IS NULL)),
      CHECK (replaces_id IS NULL OR justification IS NOT NULL),
      CHECK (type = 'IB' OR result <> 'pendente')
    );
    CREATE INDEX sterilization_test_load_idx ON sterilization_test (load_id);
    CREATE INDEX sterilization_test_day_idx ON sterilization_test (sterilizer_id, performed_on) WHERE type = 'BOWIE_DICK';

    CREATE TABLE load_release_decision (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      load_id uuid NOT NULL REFERENCES sterilization_load(id),
      from_status text CHECK (from_status IN ('aguardando', 'liberada', 'retida', 'rejeitada', 'reprocessamento')),
      to_status text NOT NULL CHECK (to_status IN ('aguardando', 'liberada', 'retida', 'rejeitada', 'reprocessamento')),
      decided_at timestamptz NOT NULL DEFAULT now(),
      decided_by uuid REFERENCES app_user(id),
      decided_by_name text NOT NULL,
      justification text NOT NULL,
      -- Policy as applied (version + content) and the evaluation shown to the person who decided.
      policy_snapshot jsonb,
      evaluation jsonb NOT NULL
    );
    CREATE INDEX load_release_decision_load_idx ON load_release_decision (load_id, decided_at);

    CREATE TABLE material_use (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      item_id uuid NOT NULL REFERENCES load_item(id),
      surgery_id uuid REFERENCES surgery(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      used_at timestamptz NOT NULL,
      recorded_by uuid REFERENCES app_user(id),
      recorded_by_name text NOT NULL,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      voided_at timestamptz,
      voided_by_name text,
      void_reason text,
      CHECK ((voided_at IS NULL) = (void_reason IS NULL))
    );
    -- A package is used once per sterilization; a wrong record is voided, never deleted.
    CREATE UNIQUE INDEX material_use_item_idx ON material_use (item_id) WHERE voided_at IS NULL;
    CREATE INDEX material_use_surgery_idx ON material_use (surgery_id) WHERE surgery_id IS NOT NULL;

    CREATE TABLE attachment (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      entity text NOT NULL CHECK (entity IN ('sterilization_test', 'training_session')),
      entity_id uuid NOT NULL,
      file_name text NOT NULL,
      mime text NOT NULL CHECK (mime IN ('application/pdf', 'image/png', 'image/jpeg')),
      size_bytes integer NOT NULL CHECK (size_bytes > 0),
      sha256 text NOT NULL,
      storage_key text NOT NULL UNIQUE,
      uploaded_by uuid REFERENCES app_user(id),
      uploaded_by_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX attachment_entity_idx ON attachment (entity, entity_id);

    CREATE TRIGGER load_item_append_only BEFORE UPDATE OR DELETE ON load_item FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER sterilization_test_append_only BEFORE UPDATE OR DELETE ON sterilization_test FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER load_release_decision_append_only BEFORE UPDATE OR DELETE ON load_release_decision FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER attachment_append_only BEFORE UPDATE OR DELETE ON attachment FOR EACH ROW EXECUTE FUNCTION append_only();

    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['cme:configure'])) WHERE code IN ('admin', 'cme');
    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['alerts:manage'])) WHERE code = 'cme';
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS attachment, material_use, load_release_decision, sterilization_test, load_item, sterilization_load, instrument_set, sterilizer CASCADE;
  `.execute(db);
}
