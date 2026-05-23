// Worker entrypoint — same image as the HTTP pod, no Express server.
// Owns long-running batch jobs: feature materialization, daily ML ranking,
// performance backfill, and the backtest BullMQ consumer. Scales
// independently of the API pod so an OOM or CPU spike here doesn't take
// down request handling.

import { config } from './config';
import { initDatabase } from './config/database';

import { FeatureStoreRepository } from './features/repository';
import { MaterializationCron } from './features/materialization/materialization.cron';

import { ModelRegistryRepository } from './shared/model-registry.repository';
import { ScoreRepository } from './recommendations/data/score.repository';
import { OnnxLoaderService } from './recommendations/inference/onnx-loader.service';
import { InferenceService } from './recommendations/inference/inference.service';
import { ScorerService } from './recommendations/scoring/scorer.service';
import { DailyRankingCron } from './recommendations/workers/daily-ranking.cron';
import { PerformanceBackfillCron } from './recommendations/workers/performance-backfill.cron';

import { startBacktestWorker } from './backtest/workers/backtest.worker';

async function start() {
  try {
    await initDatabase();
    console.log('Insights Worker DB initialized');

    const featureRepo = new FeatureStoreRepository();
    const registry = new ModelRegistryRepository();
    const loader = new OnnxLoaderService(registry);
    const inference = new InferenceService(loader);
    const scoreRepo = new ScoreRepository();
    const scorer = new ScorerService(registry, inference, scoreRepo, featureRepo);

    const crons = {
      materialization: config.materializationCronEnabled ? new MaterializationCron(featureRepo) : null,
      ranking: config.dailyRankingCronEnabled ? new DailyRankingCron(scorer) : null,
      backfill: config.performanceBackfillCronEnabled ? new PerformanceBackfillCron() : null,
    };
    crons.materialization?.start();
    crons.ranking?.start();
    crons.backfill?.start();

    // BullMQ consumer for backtest jobs runs unconditionally — the queue is
    // the only path to start a backtest, so there's no value in gating it
    // behind a flag here.
    const backtestWorker = startBacktestWorker(registry);
    console.log(`Backtest worker started (concurrency=${config.backtestConcurrency})`);

    const enabledCrons = Object.entries(crons).filter(([, c]) => c).map(([k]) => k).join(',') || 'none';
    console.log(`Insights Worker started — enabled crons: ${enabledCrons}; queue consumers: backtest`);

    const shutdown = async (signal: string) => {
      console.log(`Worker received ${signal}, draining...`);
      crons.materialization?.stop();
      crons.ranking?.stop();
      crons.backfill?.stop();
      await backtestWorker.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start insights worker:', error);
    process.exit(1);
  }
}

start();
