import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS core');

  await knex.schema.withSchema('core').createTable('profiles', (table) => {
    table.uuid('user_id').primary();
    table.string('display_name', 100);
    table.text('avatar_url');
    table.string('timezone', 50).defaultTo('Asia/Kolkata');
    table.jsonb('preferences').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('core').dropTableIfExists('profiles');
}
