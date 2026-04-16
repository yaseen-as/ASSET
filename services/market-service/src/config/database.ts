import knex from 'knex';
import { config } from './index';

async function ensureDatabase(): Promise<void> {
  const admin = knex({
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      database: 'postgres',
      user: config.db.user,
      password: config.db.password,
    },
  });
  try {
    await admin.raw(`CREATE DATABASE "${config.db.database}"`);
    console.log(`Created database "${config.db.database}"`);
  } catch (err: any) {
    if (!err.message.includes('already exists')) throw err;
  } finally {
    await admin.destroy();
  }
}

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
  await ensureDatabase();
  await db.raw('CREATE SCHEMA IF NOT EXISTS market');
  await db.raw('CREATE SCHEMA IF NOT EXISTS recommendations');
  await db.migrate.latest();
}
