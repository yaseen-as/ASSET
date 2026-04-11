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
  searchPath: ['broker', 'portfolio', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: 'broker',
    tableName: 'knex_migrations',
  },
});

export async function initDatabase(): Promise<void> {
  await db.raw('CREATE SCHEMA IF NOT EXISTS broker');
  await db.raw('CREATE SCHEMA IF NOT EXISTS portfolio');
  await db.migrate.latest();
}
