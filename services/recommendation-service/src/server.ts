import { makeApp } from './app';
import { config } from './config';
import { pingDatabase } from './config/database';
import { DailyRankingCron } from './workers/daily-ranking.cron';
import { PerformanceBackfillCron } from './workers/performance-backfill.cron';

async function start(): Promise<void> {
  try {
    await pingDatabase();
    console.log('Recommendation Service DB connected');

    const { app, scorer } = makeApp();
    const ranking = config.dailyRankingCronEnabled ? new DailyRankingCron(scorer) : null;
    const backfill = config.performanceBackfillCronEnabled ? new PerformanceBackfillCron() : null;
    ranking?.start();
    backfill?.start();

    app.listen(config.port, () => {
      console.log(`Recommendation Service running on port ${config.port}`);
    });

    const shutdown = (signal: string) => {
      console.log(`Received ${signal}, draining...`);
      ranking?.stop();
      backfill?.stop();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start recommendation service:', err);
    process.exit(1);
  }
}

start();
