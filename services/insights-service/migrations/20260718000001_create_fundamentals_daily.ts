import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS insights');

  await knex.schema.withSchema('insights').createTable('fundamentals_daily', (table) => {
    table.string('symbol', 20).notNullable();
    table.string('exchange', 10).notNullable();
    table.date('as_of_date').notNullable();

    table.decimal('pe_ratio', 14, 6);
    table.decimal('eps', 14, 6);
    table.decimal('eps_growth_yoy', 14, 6);
    table.decimal('roe', 14, 6);
    table.decimal('debt_to_equity', 14, 6);
    table.decimal('revenue_growth_yoy', 14, 6);
    table.string('sector', 80);

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.primary(['symbol', 'exchange', 'as_of_date']);
    table.index(['exchange', 'as_of_date'], 'idx_fundamentals_daily_exchange_date');
    table.index(['symbol', 'exchange'], 'idx_fundamentals_daily_symbol_exchange');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('insights').dropTableIfExists('fundamentals_daily');
}