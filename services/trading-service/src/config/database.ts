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
  searchPath: ['broker', 'portfolio', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: 'broker',
    tableName: 'knex_migrations',
  },
});

export const engagementDb: Knex = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.engagementDb.database,
    user: config.db.user,
    password: config.db.password,
  },
  searchPath: ['alerts', 'notifications', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations-engagement',
    schemaName: 'alerts',
    tableName: 'knex_migrations',
  },
});

export const authDb: Knex = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.authDb.database,
    user: config.db.user,
    password: config.db.password,
  },
  searchPath: ['auth', 'users', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations-auth',
    schemaName: 'auth',
    tableName: 'knex_migrations',
  },
});

export async function initDatabase(): Promise<void> {
  await ensureDatabase(config.db.database);
  await db.raw('CREATE SCHEMA IF NOT EXISTS broker');
  await db.raw('CREATE SCHEMA IF NOT EXISTS portfolio');
  await db.migrate.latest();
}

export async function initEngagementDatabase(): Promise<void> {
  await ensureDatabase(config.engagementDb.database);
  await engagementDb.raw('CREATE SCHEMA IF NOT EXISTS alerts');
  await engagementDb.raw('CREATE SCHEMA IF NOT EXISTS notifications');
  await engagementDb.migrate.latest();
}

export async function initAuthDatabase(): Promise<void> {
  await ensureDatabase(config.authDb.database);
  await authDb.raw('CREATE SCHEMA IF NOT EXISTS auth');
  await authDb.raw('CREATE SCHEMA IF NOT EXISTS users');
  await authDb.migrate.latest();
}
