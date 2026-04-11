import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').createTable('symbol_master', (table) => {
    table.string('token', 20).notNullable();
    table.string('exchange', 10).notNullable();
    table.string('symbol', 50).notNullable();
    table.string('trading_symbol', 50).notNullable();
    table.string('instrument_type', 20).notNullable(); // EQ, FUTIDX, OPTIDX, etc.
    table.integer('lot_size').defaultTo(1);
    table.decimal('tick_size', 10, 4).defaultTo(0.05);
    table.date('expiry').nullable();
    table.decimal('strike', 12, 2).nullable();
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.primary(['token', 'exchange']);
    table.index(['symbol', 'exchange', 'instrument_type'], 'idx_symbol_master_lookup');
    table.index(['trading_symbol', 'exchange'], 'idx_symbol_master_trading');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').dropTableIfExists('symbol_master');
}
