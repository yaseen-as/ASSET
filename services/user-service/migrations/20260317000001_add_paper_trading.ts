import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('users').alterTable('profiles', (table) => {
    table.boolean('paper_trading').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('users').alterTable('profiles', (table) => {
    table.dropColumn('paper_trading');
  });
}
