import { createLogger } from '@platform/shared';
import { config } from '../config';
import { buildTechnicalFor } from './technical-builder';
import { FeatureStoreRepository } from '../feature-store/repository';

const logger = createLogger('MaterializationCron');

export class MaterializationCron {
  private timer: NodeJS.Timeout | null = null;
  private inflight = false;

  constructor(private readonly repo: FeatureStoreRepository, private readonly exchange = 'NSE') {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => logger.error(`tick failed: ${e.message}`)), 60_000);
    logger.info(`Materialization cron started (fires at ${config.materializationHour}:00 local for ${this.exchange})`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async runOnce(date?: string): Promise<{ rows: number; date: string }> {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const vecs = await buildTechnicalFor(this.exchange, d);
    const rows = await this.repo.upsertBatch(vecs);
    logger.info(`Materialized ${rows} technical_v1 rows for ${this.exchange} on ${d}`);
    return { rows, date: d };
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    const now = new Date();
    if (now.getHours() !== config.materializationHour || now.getMinutes() !== 0) return;
    this.inflight = true;
    try {
      await this.runOnce();
    } finally {
      this.inflight = false;
    }
  }
}
