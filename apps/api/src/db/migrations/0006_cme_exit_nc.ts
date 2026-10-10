import { sql, type Kysely } from 'kysely';

/**
 * Institutional decisions of 09/10/2026 (second round):
 * - A package used without a registered CME exit is never blocked. The use is recorded and opens a
 *   non-conformity linked to the use and to the user who recorded it, who is notified.
 * - Manual conference in the system needs no justification.
 * Personal notifications are kept per user; they are marked as read, never deleted.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cme_flow_config DROP COLUMN exit_required_from, DROP COLUMN manual_requires_justification;

    ALTER TABLE nonconformity
      ADD COLUMN notified_user_id uuid REFERENCES app_user(id),
      ADD COLUMN notified_user_name text,
      ADD COLUMN source_entity text,
      ADD COLUMN source_id uuid,
      ADD CONSTRAINT nonconformity_source_check CHECK ((source_entity IS NULL) = (source_id IS NULL));
    -- One non-conformity per source record (a retried request never opens a second one).
    CREATE UNIQUE INDEX nonconformity_source_idx ON nonconformity (source_entity, source_id) WHERE source_id IS NOT NULL;

    CREATE TABLE user_notification (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_id uuid NOT NULL REFERENCES institution(id),
      user_id uuid NOT NULL REFERENCES app_user(id),
      kind text NOT NULL CHECK (kind IN ('nao_conformidade')),
      title text NOT NULL,
      detail text NOT NULL,
      entity text NOT NULL,
      entity_id uuid NOT NULL,
      link text,
      data_origin text NOT NULL CHECK (data_origin IN ('real', 'demo')),
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    );
    CREATE INDEX user_notification_user_idx ON user_notification (user_id, read_at, created_at DESC);
    CREATE UNIQUE INDEX user_notification_once_idx ON user_notification (user_id, entity, entity_id, kind);

    CREATE FUNCTION user_notification_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'user_notification: registros não podem ser excluídos';
    END $$;
    CREATE TRIGGER user_notification_keep BEFORE DELETE ON user_notification FOR EACH ROW EXECUTE FUNCTION user_notification_no_delete();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS user_notification;
    DROP FUNCTION IF EXISTS user_notification_no_delete();
    DROP INDEX IF EXISTS nonconformity_source_idx;
    ALTER TABLE nonconformity DROP CONSTRAINT IF EXISTS nonconformity_source_check,
      DROP COLUMN IF EXISTS notified_user_id, DROP COLUMN IF EXISTS notified_user_name, DROP COLUMN IF EXISTS source_entity, DROP COLUMN IF EXISTS source_id;
    ALTER TABLE cme_flow_config ADD COLUMN exit_required_from date, ADD COLUMN manual_requires_justification boolean NOT NULL DEFAULT false;
  `.execute(db);
}
