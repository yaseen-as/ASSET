import knex, { Knex } from 'knex';
import { config } from './index';

async function ensureDatabase(databaseName: string): Promise<void> {
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
    await admin.raw(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created database "${databaseName}"`);
  } catch (err: any) {
    if (!err.message.includes('already exists')) throw err;
  } finally {
    await admin.destroy();
  }
}

export const db: Knex = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  },
  searchPath: ['auth', 'users', 'broker', 'portfolio', 'engagement', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: 'core',
    tableName: 'knex_migrations',
  },
});

export async function initDatabase(): Promise<void> {
  await ensureDatabase(config.db.database);
  await db.raw('CREATE SCHEMA IF NOT EXISTS core');
  await db.raw('CREATE SCHEMA IF NOT EXISTS auth');
  await db.raw('CREATE SCHEMA IF NOT EXISTS users');
  await db.raw('CREATE SCHEMA IF NOT EXISTS broker');
  await db.raw('CREATE SCHEMA IF NOT EXISTS portfolio');
  await db.raw('CREATE SCHEMA IF NOT EXISTS engagement');
  await db.migrate.latest();
}
