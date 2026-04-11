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
  searchPath: ['market', 'recommendations', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: 'market',
    tableName: 'knex_migrations',
  },
});

export async function initDatabase(): Promise<void> {
  await db.raw('CREATE SCHEMA IF NOT EXISTS market');
  await db.raw('CREATE SCHEMA IF NOT EXISTS recommendations');
  await db.migrate.latest();
}
