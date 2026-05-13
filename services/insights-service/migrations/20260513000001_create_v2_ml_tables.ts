import type { Knex } from 'knex';

// V2 ML platform tables — added alongside the V1 `recommendations.signals`
// table from 20260216000002. Both coexist; V1 stays online behind the
// RECOMMENDATION_ENGINE feature flag.

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS recommendations');

  // ─── feature_store ──────────────────────────────────────────────────────
  // Partitioned by month on as_of_date. Knex doesn't support PARTITION BY,
  // so raw SQL is used. A bootstrap partition for the current month is
  // created here; future partitions are managed by a Node cron job.
  await knex.raw(`
    CREATE TABLE recommendations.feature_store (
      symbol       TEXT        NOT NULL,
      exchange     TEXT        NOT NULL,
      as_of_date   DATE        NOT NULL,
      feature_set  TEXT        NOT NULL,
      features     JSONB       NOT NULL,
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, exchange, as_of_date, feature_set)
    ) PARTITION BY RANGE (as_of_date)
  `);
  await knex.raw(`
    CREATE INDEX idx_feature_store_lookup
      ON recommendations.feature_store (symbol, exchange, as_of_date DESC, feature_set)
  `);
  // Default partition catches anything outside explicit ranges.
  await knex.raw(`
    CREATE TABLE recommendations.feature_store_default
      PARTITION OF recommendations.feature_store DEFAULT
  `);

  // ─── model_registry ─────────────────────────────────────────────────────
  await knex.schema.withSchema('recommendations').createTable('model_registry', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();                   // 'technical' | 'fundamental' | 'sentiment' | 'meta'
    t.text('version').notNullable();                // semver-ish
    t.text('framework').notNullable();              // 'lightgbm' | 'finbert' | ...
    t.text('artifact_uri').notNullable();           // file:// | s3:// | pg-lo://oid
    t.text('feature_set').notNullable();
    t.jsonb('training_data').notNullable();
    t.jsonb('metrics').notNullable();
    t.text('status').notNullable().defaultTo('draft'); // draft|canary|production|retired
    t.integer('rollout_percent').notNullable().defaultTo(0);
    t.text('created_by');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('promoted_at', { useTz: true });
    t.unique(['name', 'version']);
  });
  await knex.raw(`
    CREATE INDEX idx_model_registry_active
      ON recommendations.model_registry (name, status, rollout_percent)
      WHERE status IN ('canary', 'production')
  `);

  // ─── score tables (technical / fundamental / sentiment) ─────────────────
  for (const kind of ['technical', 'fundamental', 'sentiment'] as const) {
    await knex.schema.withSchema('recommendations').createTable(`${kind}_scores`, (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.text('symbol').notNullable();
      t.text('exchange').notNullable();
      t.date('as_of_date').notNullable();
      t.uuid('model_id').notNullable().references('id').inTable('recommendations.model_registry');
      t.decimal('score', 6, 4).notNullable();
      t.jsonb('features_ref').notNullable();
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.unique(['symbol', 'exchange', 'as_of_date', 'model_id']);
      t.index(['as_of_date', 'score'], `idx_${kind}_scores_lookup`);
    });
  }

  // ─── final_scores (meta-model output) ───────────────────────────────────
  await knex.schema.withSchema('recommendations').createTable('final_scores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('symbol').notNullable();
    t.text('exchange').notNullable();
    t.date('as_of_date').notNullable();
    t.uuid('meta_model_id').notNullable().references('id').inTable('recommendations.model_registry');
    t.decimal('technical_score', 6, 4);
    t.decimal('fundamental_score', 6, 4);
    t.decimal('sentiment_score', 6, 4);
    t.decimal('final_score', 6, 4).notNullable();
    t.integer('rank');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['symbol', 'exchange', 'as_of_date', 'meta_model_id']);
    t.index(['as_of_date', 'rank'], 'idx_final_scores_rank');
  });

  // ─── backtest_results ───────────────────────────────────────────────────
  await knex.schema.withSchema('recommendations').createTable('backtest_results', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('model_id').notNullable().references('id').inTable('recommendations.model_registry');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.jsonb('params').notNullable();
    t.decimal('sharpe_ratio', 8, 4);
    t.decimal('max_drawdown', 6, 4);
    t.decimal('win_rate', 6, 4);
    t.decimal('cagr', 6, 4);
    t.integer('total_trades');
    t.jsonb('equity_curve');
    t.jsonb('trades');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['model_id', 'created_at'], 'idx_backtest_results_model');
  });

  // ─── performance_logs (live model tracking) ─────────────────────────────
  await knex.schema.withSchema('recommendations').createTable('performance_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('model_id').notNullable().references('id').inTable('recommendations.model_registry');
    t.text('symbol').notNullable();
    t.date('as_of_date').notNullable();
    t.decimal('predicted', 6, 4).notNullable();
    t.decimal('realized_5d', 8, 4);
    t.decimal('realized_10d', 8, 4);
    t.decimal('realized_20d', 8, 4);
    t.timestamp('resolved_at', { useTz: true });
    t.index(['model_id', 'as_of_date'], 'idx_perf_logs_model');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('recommendations').dropTableIfExists('performance_logs');
  await knex.schema.withSchema('recommendations').dropTableIfExists('backtest_results');
  await knex.schema.withSchema('recommendations').dropTableIfExists('final_scores');
  await knex.schema.withSchema('recommendations').dropTableIfExists('sentiment_scores');
  await knex.schema.withSchema('recommendations').dropTableIfExists('fundamental_scores');
  await knex.schema.withSchema('recommendations').dropTableIfExists('technical_scores');
  await knex.schema.withSchema('recommendations').dropTableIfExists('model_registry');
  await knex.raw('DROP TABLE IF EXISTS recommendations.feature_store CASCADE');
}
