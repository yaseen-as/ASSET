import type { Knex } from 'knex';

// Stores raw ONNX bytes alongside the model_registry row. Simpler than
// pg_largeobject and keeps deployments self-contained until any single
// model exceeds ~100 MB, at which point we move to S3/MinIO (the plan
// covers that future transition).

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('insights').createTable('model_artifacts', (t) => {
    t.uuid('model_id').primary().references('id').inTable('insights.model_registry').onDelete('CASCADE');
    t.binary('bytes').notNullable();
    t.integer('size_bytes').notNullable();
    t.text('sha256').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('insights').dropTableIfExists('model_artifacts');
}
