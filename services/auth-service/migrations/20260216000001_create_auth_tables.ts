import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create schema
  await knex.raw('CREATE SCHEMA IF NOT EXISTS auth');

  // Users table
  await knex.schema.withSchema('auth').createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('phone', 15).unique();
    table.boolean('phone_verified').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Refresh tokens table
  await knex.schema.withSchema('auth').createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('auth.users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable();
    table.uuid('family_id').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('revoked').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['family_id']);
    table.index(['token_hash']);
  });

  // OTP table (for phone verification)
  await knex.schema.withSchema('auth').createTable('otp_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('phone', 15).notNullable();
    table.string('code', 6).notNullable();
    table.integer('attempts').defaultTo(0);
    table.boolean('verified').defaultTo(false);
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['phone', 'code']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('auth').dropTableIfExists('otp_codes');
  await knex.schema.withSchema('auth').dropTableIfExists('refresh_tokens');
  await knex.schema.withSchema('auth').dropTableIfExists('users');
}
