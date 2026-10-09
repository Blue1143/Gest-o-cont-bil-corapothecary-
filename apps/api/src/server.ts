import { buildApp } from './app';
import { createDb } from './db/client';
import { loadEnv } from './env';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ db, env });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'encerrando');
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: env.HOST });
