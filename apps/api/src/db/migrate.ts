import { Migrator, sql, type Kysely, type Migration, type MigrationProvider } from 'kysely';
import type { DB } from './types';
import * as m0001 from './migrations/0001_foundation';

/** Migrations are registered statically (works the same under tsx, tests and the bundled build). */
const MIGRATIONS: Record<string, Migration> = {
  '0001_foundation': m0001,
};

const provider: MigrationProvider = { getMigrations: async () => MIGRATIONS };

export async function migrateToLatest(ownerDb: Kysely<DB>): Promise<string[]> {
  const { error, results } = await new Migrator({ db: ownerDb, provider }).migrateToLatest();
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

/**
 * Least privilege for the runtime role: DML on business tables, INSERT/SELECT only on audit_log,
 * nothing on the migration bookkeeping tables, no DDL.
 */
export async function grantAppRole(ownerDb: Kysely<DB>, appRole: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) throw new Error('Nome de papel inválido');
  const role = sql.id(appRole);
  await sql`GRANT USAGE ON SCHEMA public TO ${role}`.execute(ownerDb);
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`.execute(ownerDb);
  await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`.execute(ownerDb);
  await sql`REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ${role}`.execute(ownerDb);
  await sql`REVOKE ALL ON kysely_migration, kysely_migration_lock FROM ${role}`.execute(ownerDb);
}

/** Drops everything (development and tests only). */
export async function resetSchema(ownerDb: Kysely<DB>): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS public CASCADE`.execute(ownerDb);
  await sql`CREATE SCHEMA public`.execute(ownerDb);
}
