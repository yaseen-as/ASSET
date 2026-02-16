import type { Knex } from 'knex';
import { config } from './index';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  },
  searchPath: [config.db.schema, 'public'],
  migrations: {
    directory: '../migrations',
    schemaName: config.db.schema,
    tableName: 'knex_migrations',
  },
};

export default knexConfig;
