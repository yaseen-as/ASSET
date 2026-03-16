import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').alterTable('connections', (table) => {
    table.text('feed_token').nullable(); // encrypted feed token for real-time market data
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').alterTable('connections', (table) => {
    table.dropColumn('feed_token');
  });
}
