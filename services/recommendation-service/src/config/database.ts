import knex from 'knex';
import { config } from './index';

export const db = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  },
  searchPath: ['recommendations', 'market', 'public'],
  pool: { min: 2, max: 10 },
});

export async function pingDatabase(): Promise<void> {
  await db.raw('SELECT 1');
}
