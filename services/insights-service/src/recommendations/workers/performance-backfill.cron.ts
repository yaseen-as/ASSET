import { createLogger } from '@platform/shared';
import { db } from '../../config/database';

const logger = createLogger('PerfBackfillCron');

// Walks unresolved performance_logs rows and fills realized_5d/10d/20d using
// OHLCV closes. A row qualifies when as_of_date + horizon <= today, i.e. the
// future close exists. Updates resolved_at once at least one horizon is set.
export class PerformanceBackfillCron {
  private timer: NodeJS.Timeout | null = null;
  private inflight = false;

  constructor(private readonly fireHour = 2) {}    // 02:00 local — after daily ranking

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => logger.error(`tick failed: ${e.message}`)), 60_000);
    logger.info(`Performance backfill cron started (fires at ${this.fireHour}:00 local)`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async runOnce(): Promise<{ updated: number }> {
    const horizons: Array<{ days: number; col: 'realized_5d' | 'realized_10d' | 'realized_20d' }> = [
      { days: 5, col: 'realized_5d' },
      { days: 10, col: 'realized_10d' },
      { days: 20, col: 'realized_20d' },
    ];
    let total = 0;
    for (const h of horizons) {
      const updated = await db.raw(
        `
        WITH targets AS (
          SELECT p.id, p.symbol, p.as_of_date,
                 (
                   SELECT close FROM insights.ohlcv_daily o
                   WHERE o.symbol = p.symbol AND o.exchange = 'NSE'
                     AND o.date >= p.as_of_date + INTERVAL '${h.days} days'
                   ORDER BY o.date ASC LIMIT 1
                 ) AS future_close,
                 (
                   SELECT close FROM insights.ohlcv_daily o
                   WHERE o.symbol = p.symbol AND o.exchange = 'NSE'
                     AND o.date = p.as_of_date
                   LIMIT 1
                 ) AS entry_close
          FROM insights.performance_logs p
          WHERE p.${h.col} IS NULL
            AND p.as_of_date + INTERVAL '${h.days * 2} days' <= NOW()::date
        )
        UPDATE insights.performance_logs p
        SET ${h.col} = (t.future_close / NULLIF(t.entry_close, 0)) - 1,
            resolved_at = NOW()
        FROM targets t
        WHERE p.id = t.id AND t.future_close IS NOT NULL AND t.entry_close IS NOT NULL
        `,
      );
      total += (updated as any).rowCount ?? 0;
    }
    logger.info(`Backfill complete: ${total} rows updated across all horizons`);
    return { updated: total };
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    const now = new Date();
    if (now.getHours() !== this.fireHour || now.getMinutes() !== 0) return;
    this.inflight = true;
    try { await this.runOnce(); } finally { this.inflight = false; }
  }
}
