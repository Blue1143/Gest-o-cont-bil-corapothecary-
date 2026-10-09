import { sql, type Kysely } from 'kysely';

/**
 * CME processing flow with barcode reading: institutional flow settings, physical assets, reading
 * stations (paired workstations), processes (one reprocessing round of an asset or of loose
 * material) and the append-only reading events. Loads gain an assembly phase (no cycle start yet),
 * so package labels are issued when the load is assembled. Existing records are kept as they are:
 * packages created before this migration simply have no process.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE cme_flow_config (
      institution_id uuid PRIMARY KEY REFERENCES institution(id),
      storage_required boolean NOT NULL DEFAULT false,
      separation_required boolean NOT NULL DEFAULT false,
      -- Empty: using a package without a registered exit only raises an alert (transition period).
      exit_required_from date,
      manual_requires_justification boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1
    );

    CREATE TABLE instrument_asset (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      set_id uuid NOT NULL REFERENCES instrument_set(id),
      code text NOT NULL CHECK (code ~ '^AT-[2-9A-HJKMNP-Z]{7}[0-9A-Z]$'),
      tag text,
      status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao', 'baixado')),
      status_reason text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, code),
      CHECK (status = 'ativo' OR status_reason IS NOT NULL)
    );

    CREATE TABLE scan_station (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      sector_id uuid NOT NULL REFERENCES sector(id),
      name text NOT NULL,
      location text,
      steps text[] NOT NULL CHECK (cardinality(steps) > 0),
      input_methods text[] NOT NULL CHECK (cardinality(input_methods) > 0 AND input_methods <@ ARRAY['leitor', 'camera', 'manual']),
      symbologies text[] NOT NULL CHECK (symbologies <@ ARRAY['code128', 'code39']),
      -- Identifier printed on the reader or workstation, when there is one (not every reader has).
      device_label text,
      responsible_user_id uuid REFERENCES app_user(id),
      require_pairing boolean NOT NULL DEFAULT true,
      -- HID reader tuning: keystroke interval and minimum length that tell a reader from typing.
      scan_config jsonb NOT NULL DEFAULT '{}',
      enabled boolean NOT NULL DEFAULT true,
      last_seen_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      UNIQUE (institution_id, name)
    );

    -- A workstation browser paired to a station: only the token hash is stored.
    CREATE TABLE station_device (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      station_id uuid NOT NULL REFERENCES scan_station(id),
      token_hash text NOT NULL UNIQUE,
      label text NOT NULL,
      paired_by uuid REFERENCES app_user(id),
      paired_by_name text NOT NULL,
      paired_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      revoked_by_name text,
      last_seen_at timestamptz
    );

    CREATE TABLE cme_process (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      asset_id uuid REFERENCES instrument_asset(id),
      -- Loose material (no asset) gets an issued process code at reception.
      code text CHECK (code ~ '^PR-[2-9A-HJKMNP-Z]{7}[0-9A-Z]$'),
      set_id uuid REFERENCES instrument_set(id),
      description text NOT NULL,
      current_step text NOT NULL,
      state text NOT NULL CHECK (state IN ('em_processo', 'bloqueado', 'liberado', 'distribuido', 'devolvido', 'encerrado', 'descartado')),
      next_steps text[] NOT NULL DEFAULT '{}',
      load_item_id uuid UNIQUE REFERENCES load_item(id),
      destination_sector_id uuid REFERENCES sector(id),
      -- Created on the first reading of a package issued before the flow existed.
      legacy boolean NOT NULL DEFAULT false,
      previous_process_id uuid REFERENCES cme_process(id),
      opened_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      updated_at timestamptz NOT NULL DEFAULT now(),
      row_version integer NOT NULL DEFAULT 1,
      CHECK (asset_id IS NOT NULL OR code IS NOT NULL OR load_item_id IS NOT NULL),
      CHECK ((closed_at IS NULL) = (state IN ('em_processo', 'bloqueado', 'liberado', 'distribuido')))
    );
    CREATE UNIQUE INDEX cme_process_open_asset_idx ON cme_process (asset_id) WHERE closed_at IS NULL;
    CREATE UNIQUE INDEX cme_process_code_idx ON cme_process (institution_id, code) WHERE code IS NOT NULL;
    CREATE INDEX cme_process_step_idx ON cme_process (institution_id, current_step) WHERE closed_at IS NULL;

    CREATE TABLE cme_scan_event (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      station_id uuid REFERENCES scan_station(id),
      device_id uuid REFERENCES station_device(id),
      -- Idempotency: the same reading sent twice by a station is recorded once.
      client_event_id text,
      raw_code text NOT NULL,
      code_kind text NOT NULL,
      symbology text,
      input_method text NOT NULL CHECK (input_method IN ('leitor', 'camera', 'manual')),
      process_id uuid REFERENCES cme_process(id),
      asset_id uuid REFERENCES instrument_asset(id),
      load_item_id uuid REFERENCES load_item(id),
      load_id uuid REFERENCES sterilization_load(id),
      step text NOT NULL,
      operation text NOT NULL,
      outcome text,
      details jsonb,
      result text NOT NULL CHECK (result IN ('aceita', 'codigo_desconhecido', 'etapa_incorreta', 'duplicada', 'bloqueado', 'carga_nao_liberada', 'destino_incompativel', 'requer_conferencia', 'estacao_invalida', 'excecao_autorizada')),
      message text NOT NULL,
      user_id uuid REFERENCES app_user(id),
      user_name text NOT NULL,
      server_at timestamptz NOT NULL DEFAULT now(),
      device_at timestamptz,
      origin_sector_id uuid REFERENCES sector(id),
      destination_sector_id uuid REFERENCES sector(id),
      justification text,
      previous_event_id uuid REFERENCES cme_scan_event(id),
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      CHECK (result <> 'excecao_autorizada' OR justification IS NOT NULL)
    );
    CREATE UNIQUE INDEX cme_scan_event_idem_idx ON cme_scan_event (station_id, client_event_id) WHERE client_event_id IS NOT NULL;
    CREATE INDEX cme_scan_event_process_idx ON cme_scan_event (process_id, server_at);
    CREATE INDEX cme_scan_event_time_idx ON cme_scan_event (institution_id, server_at);
    CREATE INDEX cme_scan_event_station_idx ON cme_scan_event (station_id, server_at);
    CREATE TRIGGER cme_scan_event_append_only BEFORE UPDATE OR DELETE ON cme_scan_event FOR EACH ROW EXECUTE FUNCTION append_only();

    ALTER TABLE load_item ADD COLUMN process_id uuid REFERENCES cme_process(id);
    CREATE UNIQUE INDEX load_item_process_idx ON load_item (process_id) WHERE process_id IS NOT NULL;

    -- Assembly phase: a load can exist (and receive packages) before its cycle starts.
    ALTER TABLE sterilization_load ALTER COLUMN started_at DROP NOT NULL;
    ALTER TABLE sterilization_load ADD CONSTRAINT sterilization_load_started_check CHECK (started_at IS NOT NULL OR ended_at IS NULL);

    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['cme:scan', 'cme:stations:configure', 'cme:override'])) WHERE code IN ('admin', 'cme');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // started_at stays nullable: loads assembled in the meantime have no start to restore.
  await sql`
    ALTER TABLE sterilization_load DROP CONSTRAINT IF EXISTS sterilization_load_started_check;
    ALTER TABLE load_item DROP COLUMN IF EXISTS process_id;
    DROP TABLE IF EXISTS cme_scan_event, cme_process, station_device, scan_station, instrument_asset, cme_flow_config CASCADE;
  `.execute(db);
}
