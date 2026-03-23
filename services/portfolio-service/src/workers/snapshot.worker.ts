import { SnapshotRepository } from '../repositories/snapshot.repository';
import { PortfolioService } from '../services/portfolio.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('SnapshotWorker');

export class SnapshotWorker {
  private snapshotRepo = new SnapshotRepository();
  private portfolioService = new PortfolioService();
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    // Run immediately on start, then check every hour
    this.takeSnapshots();
    this.timer = setInterval(() => this.checkAndSnapshot(), 60 * 60 * 1000);
    logger.info('Snapshot worker started — will capture daily at ~16:00 IST');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private checkAndSnapshot() {
    // IST = UTC+5:30, market closes at 15:30 IST, snapshot at 16:00 IST
    // 16:00 IST = 10:30 UTC
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    // Check if it's between 10:00–11:00 UTC (15:30–16:30 IST)
    if (utcHour === 10 && utcMinute >= 0 && utcMinute <= 59) {
      this.takeSnapshots();
    }
  }

  async takeSnapshots() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const userIds = await this.snapshotRepo.getAllUserIds();
      logger.info(`Taking snapshots for ${userIds.length} users on ${today}`);

      let created = 0;
      let skipped = 0;

      for (const userId of userIds) {
        try {
          // Skip if already exists
          const exists = await this.snapshotRepo.existsForDate(userId, today);
          if (exists) {
            skipped++;
            continue;
          }

          const portfolio = await this.portfolioService.getHoldings(userId);
          if (portfolio.holdings.length === 0) continue;

          const totalCost = portfolio.holdings.reduce(
            (sum, h) => sum + h.avgBuyPrice * h.quantity, 0,
          );

          const holdingsSnapshot = portfolio.holdings.map(h => ({
            symbol: h.symbol,
            exchange: h.exchange,
            quantity: h.quantity,
            avgBuyPrice: h.avgBuyPrice,
            currentPrice: h.currentPrice,
            pnl: h.pnl,
            pnlPercent: h.pnlPercentage,
          }));

          await this.snapshotRepo.create({
            user_id: userId,
            date: today,
            total_value: portfolio.totalValue,
            total_cost: Math.round(totalCost * 100) / 100,
            total_pnl: portfolio.totalPnl,
            pnl_percent: portfolio.pnlPercentage,
            holdings: holdingsSnapshot,
          });

          created++;
        } catch (err) {
          logger.error(`Snapshot failed for user ${userId}:`, err);
        }
      }

      logger.info(`Snapshots done: ${created} created, ${skipped} skipped`);
    } catch (err) {
      logger.error('Snapshot worker error:', err);
    }
  }
}
