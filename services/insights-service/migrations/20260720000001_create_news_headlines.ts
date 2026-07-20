import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS insights');

  await knex.schema.withSchema('insights').createTable('news_headlines', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('symbol', 20).notNullable();
    table.string('exchange', 10).notNullable();
    table.text('headline').notNullable();
    table.text('source');
    table.text('url');
    table.timestamp('published_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['published_at'], 'idx_news_headlines_published_at');
    table.index(['symbol', 'exchange', 'published_at'], 'idx_news_headlines_symbol_exchange_published_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('insights').dropTableIfExists('news_headlines');
}
