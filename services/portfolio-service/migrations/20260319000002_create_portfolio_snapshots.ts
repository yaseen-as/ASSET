import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS portfolio.snapshots (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL,
      date        DATE NOT NULL,
      total_value DECIMAL(14,2) NOT NULL,
      total_cost  DECIMAL(14,2) NOT NULL,
      total_pnl   DECIMAL(14,2) NOT NULL,
      pnl_percent DECIMAL(8,4) NOT NULL,
      holdings    JSONB NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON portfolio.snapshots (user_id, date DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS portfolio.snapshots');
}
