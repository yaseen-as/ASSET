import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS portfolio');

  await knex.schema.withSchema('portfolio').createTable('portfolios', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('name', 100).defaultTo('Default');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id']);
  });

  await knex.schema.withSchema('portfolio').createTable('holdings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('portfolio_id').notNullable().references('id').inTable('portfolio.portfolios').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.string('symbol', 20).notNullable();
    table.string('exchange', 10).notNullable();
    table.integer('quantity').notNullable();
    table.decimal('avg_buy_price', 12, 2).notNullable();
    table.decimal('current_price', 12, 2);
    table.timestamp('last_synced_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id', 'symbol', 'exchange']);
  });

  await knex.schema.withSchema('portfolio').createTable('watchlists', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('name', 100).defaultTo('My Watchlist');
    table.jsonb('symbols').defaultTo('[]');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('portfolio').dropTableIfExists('watchlists');
  await knex.schema.withSchema('portfolio').dropTableIfExists('holdings');
  await knex.schema.withSchema('portfolio').dropTableIfExists('portfolios');
}
