import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('core').alterTable('connections', (table) => {
    // client_id was the Angel One user code — Upstox stores the broker's user id instead
    table.renameColumn('client_id', 'broker_user_id');

    // Upstox tokens expire end-of-day — track exact expiry
    table.timestamp('expires_at', { useTz: true }).nullable();

    // OAuth scopes granted during authorization
    table.text('scopes').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('core').alterTable('connections', (table) => {
    table.renameColumn('broker_user_id', 'client_id');
    table.dropColumn('expires_at');
    table.dropColumn('scopes');
  });
}
