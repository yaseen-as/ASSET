import knex, { Knex } from 'knex';
import { config } from './index';

const db: Knex = knex({
  client: 'pg',
  connection: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  },
  searchPath: [config.database.schema, 'public'],
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: config.database.schema,
    tableName: 'knex_migrations',
  },
});

export default db;
