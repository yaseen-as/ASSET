import knex, { Knex } from 'knex';
import { config } from './index';

async function ensureDatabase(): Promise<void> {
  const admin = knex({
    client: 'pg',
    connection: {
      host: config.database.host,
      port: config.database.port,
      database: 'postgres',
      user: config.database.user,
      password: config.database.password,
    },
  });
  try {
    await admin.raw(`CREATE DATABASE "${config.database.name}"`);
    console.log(`Created database "${config.database.name}"`);
  } catch (err: any) {
    if (!err.message.includes('already exists')) throw err;
  } finally {
    await admin.destroy();
  }
}

const db: Knex = knex({
  client: 'pg',
  connection: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  },
  searchPath: ['alerts', 'notifications', 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: 'alerts',
    tableName: 'knex_migrations',
  },
});

export async function initDatabase(): Promise<void> {
  await ensureDatabase();
  await db.raw('CREATE SCHEMA IF NOT EXISTS alerts');
  await db.raw('CREATE SCHEMA IF NOT EXISTS notifications');
  await db.migrate.latest();
}

export default db;
