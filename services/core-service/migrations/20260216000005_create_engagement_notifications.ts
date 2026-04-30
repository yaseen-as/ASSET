import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // engagement schema is already created by the alerts migration; idempotent here too
  await knex.raw('CREATE SCHEMA IF NOT EXISTS engagement');

  await knex.schema.withSchema('engagement').createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().index();

    t.enum('type', ['alert_triggered', 'recommendation', 'order_executed', 'system', 'info']).notNullable();
    t.enum('channel', ['in_app', 'email', 'push', 'sms']).notNullable().defaultTo('in_app');

    t.string('title', 200).notNullable();
    t.text('body').notNullable();
    t.jsonb('metadata').defaultTo('{}');

    t.boolean('is_read').notNullable().defaultTo(false);
    t.timestamp('read_at').nullable();

    t.timestamps(true, true);
  });

  await knex.raw(`
    CREATE INDEX idx_notifications_user_unread
    ON engagement.notifications (user_id, created_at DESC)
    WHERE is_read = false
  `);

  await knex.schema.withSchema('engagement').createTable('preferences', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().unique();

    t.boolean('email_alerts').notNullable().defaultTo(true);
    t.boolean('email_recommendations').notNullable().defaultTo(true);
    t.boolean('email_orders').notNullable().defaultTo(false);
    t.boolean('push_enabled').notNullable().defaultTo(true);
    t.boolean('in_app_enabled').notNullable().defaultTo(true);

    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('engagement').dropTableIfExists('preferences');
  await knex.schema.withSchema('engagement').dropTableIfExists('notifications');
}
