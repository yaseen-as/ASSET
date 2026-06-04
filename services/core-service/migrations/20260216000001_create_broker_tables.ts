import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS core');

  await knex.schema.withSchema('core').createTable('connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('broker_name', 50).notNullable();
    table.text('client_id').notNullable(); // encrypted
    table.text('access_token'); // encrypted
    table.text('refresh_token'); // encrypted
    table.timestamp('token_expiry', { useTz: true });
    table.boolean('is_active').defaultTo(true);
    table.timestamp('connected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.unique(['user_id', 'broker_name']);
    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('core').dropTableIfExists('connections');
}
