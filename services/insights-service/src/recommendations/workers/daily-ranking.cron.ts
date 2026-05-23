import { createLogger } from '@platform/shared';
import type { ScorerService } from '../scoring/scorer.service';

const logger = createLogger('DailyRankingCron');

// Polls every minute; only acts at the configured local hour:minute window.
// Lightweight on purpose — a real scheduler would add a dependency for a
// once-a-day batch we already have to gate behind a feature flag.
export class DailyRankingCron {
  private timer: NodeJS.Timeout | null = null;
  private inflight = false;

  constructor(
    private readonly scorer: ScorerService,
    private readonly exchange = 'NSE',
    private readonly fireHour = 1,         // 01:00 local — fires after feature materialization
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => logger.error(`cron tick failed: ${e.message}`)), 60_000);
    logger.info(`Daily ranking cron started (fires at ${this.fireHour}:00 local)`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    const now = new Date();
    if (now.getHours() !== this.fireHour || now.getMinutes() !== 0) return;
    this.inflight = true;
    try {
      const date = now.toISOString().slice(0, 10);
      logger.info(`Running daily meta ranking for ${this.exchange} on ${date}`);
      const results = await this.scorer.scoreUniverseMeta(this.exchange, date, 100);
      logger.info(`Ranking complete: ${results.length} symbols scored`);
    } finally {
      this.inflight = false;
    }
  }
}
