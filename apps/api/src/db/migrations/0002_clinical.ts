import { sql, type Kysely } from 'kysely';

/**
 * Phase 3 clinical core: patients, admissions and movements, device uses, IRAS surveillance with an
 * immutable status history, CCIH notes (append-only, corrections are new notes), procedures and
 * surgeries, cultures with versioned results, isolates and susceptibility.
 * Nothing clinical is updated in place where the history matters: those tables are append-only.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE unit ADD COLUMN row_version integer NOT NULL DEFAULT 1;
    ALTER TABLE sector ADD COLUMN row_version integer NOT NULL DEFAULT 1;

    CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION '% é somente inserção: % não permitido', TG_TABLE_NAME, TG_OP;
    END $$;

    CREATE TABLE patient (
      id uuid PRIMARY KEY,
      institution_id uuid NOT NULL REFERENCES institution(id),
      record_number text NOT NULL CHECK (record_number ~ '^[A-Za-z0-9./-]{1,30}$'),
      initials text NOT NULL CHECK (initials ~ '^[A-Z]{1,6}$'),
      full_name_enc text, -- AES-256-GCM, never stored in clear
      birth_date date,
      sex text NOT NULL CHECK (sex IN ('F', 'M', 'NI')),
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, record_number)
    );

    CREATE TABLE admission (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      patient_id uuid NOT NULL REFERENCES patient(id),
      admitted_at timestamptz NOT NULL,
      discharged_at timestamptz,
      outcome text CHECK (outcome IN ('alta', 'obito', 'transferencia_externa')),
      diagnosis text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      CHECK (discharged_at IS NULL OR discharged_at > admitted_at),
      CHECK ((discharged_at IS NULL) = (outcome IS NULL))
    );
    CREATE UNIQUE INDEX admission_one_open_idx ON admission (patient_id) WHERE discharged_at IS NULL;
    CREATE INDEX admission_period_idx ON admission (institution_id, admitted_at, discharged_at);

    CREATE TABLE admission_movement (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      admission_id uuid NOT NULL REFERENCES admission(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      bed_id uuid REFERENCES bed(id),
      start_at timestamptz NOT NULL,
      end_at timestamptz,
      reason text,
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (end_at IS NULL OR end_at > start_at)
    );
    CREATE UNIQUE INDEX movement_one_open_idx ON admission_movement (admission_id) WHERE end_at IS NULL;
    CREATE INDEX movement_sector_idx ON admission_movement (sector_id, start_at);
    CREATE INDEX movement_admission_idx ON admission_movement (admission_id);
    CREATE UNIQUE INDEX movement_bed_open_idx ON admission_movement (bed_id) WHERE end_at IS NULL AND bed_id IS NOT NULL;

    CREATE TABLE device_use (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      admission_id uuid NOT NULL REFERENCES admission(id),
      device_type text NOT NULL CHECK (device_type IN ('CVC', 'PICC', 'VM', 'SVD', 'PAI', 'DRENO', 'OUTRO')),
      site text,
      indication text,
      inserted_at timestamptz NOT NULL,
      removed_at timestamptz,
      removal_reason text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      CHECK (removed_at IS NULL OR removed_at > inserted_at)
    );
    CREATE INDEX device_admission_idx ON device_use (admission_id);

    CREATE TABLE procedure_catalog (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      code text NOT NULL,
      name text NOT NULL,
      specialty text NOT NULL,
      p75_minutes integer CHECK (p75_minutes IS NULL OR p75_minutes > 0),
      p75_source text,
      active boolean NOT NULL DEFAULT true,
      UNIQUE (institution_id, code)
    );

    CREATE TABLE surgery (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      admission_id uuid NOT NULL REFERENCES admission(id),
      procedure_id uuid NOT NULL REFERENCES procedure_catalog(id),
      surgeon_id uuid NOT NULL REFERENCES professional(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      room text,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      wound_class text CHECK (wound_class IN ('limpa', 'potencialmente_contaminada', 'contaminada', 'infectada')),
      asa smallint CHECK (asa BETWEEN 1 AND 6),
      implant boolean NOT NULL DEFAULT false,
      urgency boolean NOT NULL DEFAULT false,
      prophylaxis_indicated boolean,
      prophylaxis_drug text,
      prophylaxis_dose_at timestamptz,
      prophylaxis_duration_h numeric(5, 1) CHECK (prophylaxis_duration_h IS NULL OR prophylaxis_duration_h >= 0),
      redose boolean,
      notes text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      CHECK (ended_at IS NULL OR ended_at > started_at)
    );
    CREATE INDEX surgery_period_idx ON surgery (institution_id, started_at);
    CREATE INDEX surgery_admission_idx ON surgery (admission_id);

    CREATE TABLE culture (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      admission_id uuid NOT NULL REFERENCES admission(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      material text NOT NULL,
      collected_at timestamptz NOT NULL,
      origin text NOT NULL CHECK (origin IN ('manual', 'lis')),
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX culture_period_idx ON culture (institution_id, collected_at);
    CREATE INDEX culture_admission_idx ON culture (admission_id);

    -- A result is never overwritten: a correction is a new version with a justification.
    CREATE TABLE culture_result (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      culture_id uuid NOT NULL REFERENCES culture(id),
      version integer NOT NULL CHECK (version >= 1),
      outcome text NOT NULL CHECK (outcome IN ('negativa', 'positiva', 'contaminada')),
      reported_at timestamptz NOT NULL,
      breakpoint_version text,
      notes text,
      justification text,
      recorded_by uuid REFERENCES app_user(id),
      recorded_by_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (culture_id, version),
      CHECK (version = 1 OR justification IS NOT NULL)
    );

    CREATE TABLE isolate (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      result_id uuid NOT NULL REFERENCES culture_result(id),
      organism text NOT NULL,
      quantity text,
      resistance_profile text CHECK (resistance_profile IN ('MDR', 'XDR', 'PDR')),
      mechanism text
    );
    CREATE INDEX isolate_result_idx ON isolate (result_id);

    CREATE TABLE susceptibility (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      isolate_id uuid NOT NULL REFERENCES isolate(id),
      antimicrobial text NOT NULL,
      mic text,
      interpretation text NOT NULL CHECK (interpretation IN ('S', 'I', 'R'))
    );
    CREATE INDEX susceptibility_isolate_idx ON susceptibility (isolate_id);

    CREATE TABLE iras_case (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      admission_id uuid NOT NULL REFERENCES admission(id),
      iras_type text NOT NULL CHECK (iras_type IN ('IPCS', 'PAV', 'ITU-AC', 'ISC', 'OUTRA')),
      status text NOT NULL CHECK (status IN ('suspeita', 'em_investigacao', 'confirmada', 'descartada')),
      event_date date NOT NULL,
      sector_id uuid NOT NULL REFERENCES sector(id),
      device_associated boolean,
      device_use_id uuid REFERENCES device_use(id),
      surgery_id uuid REFERENCES surgery(id),
      criterion_reference_id uuid REFERENCES clinical_reference(id),
      criterion_snapshot jsonb, -- title/version/source/validation at the time of the decision
      description text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_by uuid REFERENCES app_user(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1
    );
    CREATE INDEX iras_case_period_idx ON iras_case (institution_id, event_date);
    CREATE INDEX iras_case_admission_idx ON iras_case (admission_id);

    CREATE TABLE iras_case_status (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id uuid NOT NULL REFERENCES iras_case(id),
      from_status text,
      to_status text NOT NULL,
      justification text NOT NULL,
      decided_by uuid REFERENCES app_user(id),
      decided_by_name text NOT NULL,
      at timestamptz NOT NULL
    );
    CREATE INDEX iras_case_status_case_idx ON iras_case_status (case_id, at);

    CREATE TABLE iras_case_culture (
      case_id uuid NOT NULL REFERENCES iras_case(id),
      culture_id uuid NOT NULL REFERENCES culture(id),
      PRIMARY KEY (case_id, culture_id)
    );

    CREATE TABLE ccih_note (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      patient_id uuid NOT NULL REFERENCES patient(id),
      admission_id uuid REFERENCES admission(id),
      case_id uuid REFERENCES iras_case(id),
      kind text NOT NULL CHECK (kind IN ('avaliacao', 'conduta', 'recomendacao', 'acompanhamento', 'retificacao')),
      body text NOT NULL,
      amends_id uuid REFERENCES ccih_note(id),
      justification text,
      author_id uuid REFERENCES app_user(id),
      author_name text NOT NULL,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((kind = 'retificacao') = (amends_id IS NOT NULL)),
      CHECK (amends_id IS NULL OR justification IS NOT NULL)
    );
    CREATE INDEX ccih_note_patient_idx ON ccih_note (patient_id, created_at);

    CREATE TRIGGER iras_case_status_append_only BEFORE UPDATE OR DELETE ON iras_case_status FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER ccih_note_append_only BEFORE UPDATE OR DELETE ON ccih_note FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER culture_result_append_only BEFORE UPDATE OR DELETE ON culture_result FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER isolate_append_only BEFORE UPDATE OR DELETE ON isolate FOR EACH ROW EXECUTE FUNCTION append_only();
    CREATE TRIGGER susceptibility_append_only BEFORE UPDATE OR DELETE ON susceptibility FOR EACH ROW EXECUTE FUNCTION append_only();

    -- Existing installations: grant the new permissions to the profiles that use them.
    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['indicators:consolidate', 'patient:edit', 'surgery:view', 'surgery:edit']))
      WHERE code IN ('admin', 'enf_ccih');
    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['surgery:view'])) WHERE code IN ('infectologista', 'auditor');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS ccih_note, iras_case_culture, iras_case_status, iras_case, susceptibility, isolate, culture_result, culture,
      surgery, procedure_catalog, device_use, admission_movement, admission, patient CASCADE;
    DROP FUNCTION IF EXISTS append_only();
    ALTER TABLE unit DROP COLUMN IF EXISTS row_version;
    ALTER TABLE sector DROP COLUMN IF EXISTS row_version;
  `.execute(db);
}
