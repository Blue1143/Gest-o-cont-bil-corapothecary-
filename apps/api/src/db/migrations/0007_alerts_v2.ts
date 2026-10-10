import { sql, type Kysely } from 'kysely';

/**
 * Alert center v2 (evolution of the existing table, no second alert system): category, critical
 * severity, blocking (safety) alerts, deadline, CME step and unit; acknowledgment and resolution
 * records; why it was closed (manual, automatic, formal exception); and the append-only history of
 * every action taken on an alert.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE alert DROP CONSTRAINT alert_priority_check, DROP CONSTRAINT alert_status_check;
    ALTER TABLE alert
      ADD CONSTRAINT alert_priority_check CHECK (priority IN ('critica', 'alta', 'media', 'baixa')),
      ADD CONSTRAINT alert_status_check CHECK (status IN ('aberto', 'reconhecido', 'assumido', 'resolvido', 'encerrado')),
      ADD COLUMN category text,
      ADD COLUMN blocking boolean NOT NULL DEFAULT false,
      ADD COLUMN step text,
      ADD COLUMN due_on date,
      ADD COLUMN unit_id uuid REFERENCES unit(id),
      ADD COLUMN acknowledged_at timestamptz,
      ADD COLUMN acknowledged_by uuid REFERENCES app_user(id),
      ADD COLUMN acknowledged_name text,
      ADD COLUMN resolved_at timestamptz,
      ADD COLUMN resolved_by uuid REFERENCES app_user(id),
      ADD COLUMN resolved_name text,
      ADD COLUMN resolved_note text,
      ADD COLUMN closed_reason text CHECK (closed_reason IN ('manual', 'automatico', 'excecao'));

    UPDATE alert SET category = CASE kind
      WHEN 'mdr_novo' THEN 'seguranca' WHEN 'insumo_critico' THEN 'seguranca' WHEN 'cme_carga_recolhida' THEN 'seguranca'
      WHEN 'cme_liberada_com_falha' THEN 'seguranca' WHEN 'cme_bowie_dick_reprovado' THEN 'seguranca'
      WHEN 'plano_acao_atrasado' THEN 'nao_conformidade' WHEN 'cme_uso_sem_saida' THEN 'violacao_sequencia'
      ELSE 'pendencia_tempo' END;
    UPDATE alert SET blocking = kind IN ('cme_liberada_com_falha', 'cme_bowie_dick_reprovado');
    UPDATE alert SET closed_reason = CASE WHEN closed_by_name = 'Sistema' THEN 'automatico' ELSE 'manual' END WHERE status = 'encerrado';
    UPDATE alert a SET unit_id = s.unit_id FROM sector s WHERE s.id = a.sector_id;

    ALTER TABLE alert
      ALTER COLUMN category SET NOT NULL,
      ADD CONSTRAINT alert_category_check CHECK (category IN ('erro_operacional', 'violacao_sequencia', 'pendencia_tempo', 'falha_integracao', 'informacao_obrigatoria', 'nao_conformidade', 'seguranca')),
      ADD CONSTRAINT alert_closed_reason_state_check CHECK ((status = 'encerrado') = (closed_reason IS NOT NULL)),
      ADD CONSTRAINT alert_resolved_check CHECK ((resolved_at IS NULL) = (resolved_note IS NULL));
    CREATE INDEX alert_filter_idx ON alert (institution_id, category, priority, created_at DESC);

    CREATE TABLE alert_action (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_id uuid NOT NULL REFERENCES alert(id),
      action text NOT NULL CHECK (action IN ('criado', 'visualizado', 'reconhecido', 'assumido', 'comentado', 'resolvido', 'encerrado', 'encerrado_automatico', 'excecao')),
      user_id uuid REFERENCES app_user(id),
      user_name text NOT NULL,
      note text,
      at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX alert_action_alert_idx ON alert_action (alert_id, at);
    CREATE TRIGGER alert_action_append_only BEFORE UPDATE OR DELETE ON alert_action FOR EACH ROW EXECUTE FUNCTION append_only();
    -- History of the alerts that already exist.
    INSERT INTO alert_action (alert_id, action, user_id, user_name, note, at) SELECT id, 'criado', NULL, 'Sistema', NULL, created_at FROM alert;
    INSERT INTO alert_action (alert_id, action, user_id, user_name, note, at) SELECT id, 'assumido', assigned_to, assigned_name, NULL, assigned_at FROM alert WHERE assigned_at IS NOT NULL;
    INSERT INTO alert_action (alert_id, action, user_id, user_name, note, at)
      SELECT id, CASE WHEN closed_reason = 'automatico' THEN 'encerrado_automatico' ELSE 'encerrado' END, NULL, closed_by_name, resolution, closed_at FROM alert WHERE status = 'encerrado';

    UPDATE role SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['alerts:exception'])) WHERE code IN ('admin', 'enf_ccih');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS alert_action;
    DROP INDEX IF EXISTS alert_filter_idx;
    UPDATE alert SET status = 'aberto' WHERE status IN ('reconhecido', 'resolvido');
    UPDATE alert SET priority = 'alta' WHERE priority = 'critica';
    ALTER TABLE alert DROP CONSTRAINT IF EXISTS alert_category_check, DROP CONSTRAINT IF EXISTS alert_closed_reason_state_check, DROP CONSTRAINT IF EXISTS alert_resolved_check,
      DROP CONSTRAINT alert_priority_check, DROP CONSTRAINT alert_status_check,
      DROP COLUMN category, DROP COLUMN blocking, DROP COLUMN step, DROP COLUMN due_on, DROP COLUMN unit_id, DROP COLUMN acknowledged_at, DROP COLUMN acknowledged_by,
      DROP COLUMN acknowledged_name, DROP COLUMN resolved_at, DROP COLUMN resolved_by, DROP COLUMN resolved_name, DROP COLUMN resolved_note, DROP COLUMN closed_reason;
    ALTER TABLE alert ADD CONSTRAINT alert_priority_check CHECK (priority IN ('alta', 'media', 'baixa')), ADD CONSTRAINT alert_status_check CHECK (status IN ('aberto', 'assumido', 'encerrado'));
    UPDATE role SET permissions = array_remove(permissions, 'alerts:exception');
  `.execute(db);
}
