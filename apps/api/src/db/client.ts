import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types';

// Calendar dates stay 'YYYY-MM-DD' strings (no time-zone shift); bigint ids stay strings.
pg.types.setTypeParser(1082, (v: string) => v);
// double precision → number is the default; numeric is not used for values the UI computes with.

export function createDb(connectionString: string, max = 10): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max, application_name: 'ccih-integra-api' }) }),
  });
}
