import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS insights');

  await knex.schema.withSchema('insights').createTable('signals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('symbol', 20).notNullable();
    table.string('exchange', 10).notNullable();
    table.string('signal_type', 30).notNullable(); // BUY, SELL, HOLD
    table.string('source', 30).notNullable(); // rule_engine, ml_model, sentiment
    table.smallint('confidence').notNullable(); // 0–100
    table.text('reasoning');
    table.jsonb('metadata');
    table.timestamp('valid_until', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['symbol', 'exchange', 'created_at']);
    table.index(['source']);
  });

  await knex.schema.withSchema('insights').createTable('user_recommendations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('signal_id').notNullable().references('id').inTable('insights.signals').onDelete('CASCADE');
    table.smallint('personalization_score').defaultTo(50);
    table.boolean('is_viewed').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('insights').dropTableIfExists('user_recommendations');
  await knex.schema.withSchema('insights').dropTableIfExists('signals');
}
