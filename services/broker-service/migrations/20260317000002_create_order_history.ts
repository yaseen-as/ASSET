import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').createTable('order_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('connection_id').nullable().references('id').inTable('broker.connections').onDelete('SET NULL');
    table.string('broker_order_id', 50).nullable();
    table.string('symbol', 50).notNullable();
    table.string('exchange', 10).notNullable();
    table.string('action', 4).notNullable(); // BUY, SELL
    table.string('order_type', 20).notNullable(); // MARKET, LIMIT, SL, SL-M
    table.string('product_type', 20).notNullable().defaultTo('DELIVERY');
    table.integer('quantity').notNullable();
    table.decimal('price', 12, 2).nullable(); // limit price
    table.decimal('trigger_price', 12, 2).nullable(); // for SL orders
    table.integer('filled_quantity').defaultTo(0);
    table.decimal('avg_fill_price', 12, 2).nullable();
    table.string('status', 20).notNullable().defaultTo('PLACED');
    // PLACED, OPEN, PARTIALLY_FILLED, EXECUTED, CANCELLED, REJECTED, AMO_SUBMITTED
    table.string('source', 10).notNullable().defaultTo('live'); // 'live' or 'paper'
    table.text('rejection_reason').nullable();
    table.timestamp('placed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('filled_at', { useTz: true }).nullable();

    table.index(['user_id', 'placed_at'], 'idx_order_history_user');
    table.index(['status'], 'idx_order_history_pending');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').dropTableIfExists('order_history');
}
