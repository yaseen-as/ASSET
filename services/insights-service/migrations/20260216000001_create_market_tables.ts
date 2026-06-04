import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS insights');

  await knex.schema.withSchema('insights').createTable('ohlcv_daily', (table) => {
    table.string('symbol', 20).notNullable();
    table.string('exchange', 10).notNullable();
    table.date('date').notNullable();
    table.decimal('open', 12, 2);
    table.decimal('high', 12, 2);
    table.decimal('low', 12, 2);
    table.decimal('close', 12, 2);
    table.bigInteger('volume');

    table.primary(['symbol', 'exchange', 'date']);
    table.index(['symbol', 'exchange']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('insights').dropTableIfExists('ohlcv_daily');
}
