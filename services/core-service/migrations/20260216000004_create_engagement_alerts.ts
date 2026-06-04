import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS core');

  await knex.schema.withSchema('core').createTable('alerts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().index();
    t.string('symbol', 20).notNullable();
    t.string('exchange', 10).notNullable().defaultTo('NSE');

    t.enum('condition_type', [
      'price_above',
      'price_below',
      'price_crosses_above',
      'price_crosses_below',
      'percent_change_above',
      'percent_change_below',
      'volume_above',
    ]).notNullable();
    t.decimal('threshold', 18, 4).notNullable();
    t.decimal('last_evaluated_value', 18, 4).nullable();

    t.enum('status', ['active', 'triggered', 'disabled', 'expired']).notNullable().defaultTo('active');
    t.integer('trigger_count').notNullable().defaultTo(0);
    t.timestamp('last_triggered_at').nullable();

    t.string('label', 100).nullable();
    t.text('note').nullable();
    t.timestamp('expires_at').nullable();

    t.timestamps(true, true);
  });

  await knex.raw(`
    CREATE INDEX idx_alerts_active_symbol
    ON core.alerts (symbol, exchange)
    WHERE status = 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('core').dropTableIfExists('alerts');
}
