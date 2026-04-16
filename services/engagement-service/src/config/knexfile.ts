import type { Knex } from 'knex';
import { config } from './index';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  },
  searchPath: ['alerts', 'notifications', 'public'],
  migrations: {
    directory: '../migrations',
    schemaName: 'alerts',
    tableName: 'knex_migrations',
  },
};

export default knexConfig;
