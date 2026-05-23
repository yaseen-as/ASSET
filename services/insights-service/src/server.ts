import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';

import { MarketDataService } from './market/market-data.service';
import { initMarketController } from './market/market.controller';

import { FeatureStoreRepository } from './features/repository';
import { MaterializationCron } from './features/materialization/materialization.cron';
import { initFeatureController } from './features/controller';

import { ModelRegistryRepository } from './shared/model-registry.repository';

import { ScoreRepository } from './recommendations/data/score.repository';
import { OnnxLoaderService } from './recommendations/inference/onnx-loader.service';
import { InferenceService } from './recommendations/inference/inference.service';
import { ScorerService } from './recommendations/scoring/scorer.service';
import { initRecommendationController } from './recommendations/api/recommendations.controller';
import { initModelsController } from './recommendations/api/models.controller';

import { BacktestRepository } from './backtest/data/backtest.repository';
import { initBacktestController } from './backtest/api/backtest.controller';

async function start() {
  try {
    await initDatabase();
    console.log('Insights Service DB initialized');

    // Market
    const marketDataService = new MarketDataService();
    initMarketController(marketDataService);

    // Features
    const featureRepo = new FeatureStoreRepository();
    const materializationCron = new MaterializationCron(featureRepo);
    initFeatureController(featureRepo, materializationCron);

    // Shared: one registry instance powers recommendations + backtest.
    const registry = new ModelRegistryRepository();

    // Recommendations (V2 ML)
    const loader = new OnnxLoaderService(registry);
    const inference = new InferenceService(loader);
    const scoreRepo = new ScoreRepository();
    const scorer = new ScorerService(registry, inference, scoreRepo, featureRepo);
    initRecommendationController(scorer, scoreRepo, registry);
    initModelsController(registry, loader);

    // Backtest API: enqueues BullMQ jobs only — the BullMQ Worker that
    // executes them lives in the insights-worker pod (see worker.ts).
    const backtestRepo = new BacktestRepository();
    initBacktestController(backtestRepo, registry);

    // HTTP pod does NOT run crons. Worker pod owns those (see worker.ts).
    // Materialization can still be triggered via POST /features/materialize.

    app.listen(config.port, () => {
      console.log(`Insights Service running on port ${config.port}`);
    });

    const shutdown = (signal: string) => {
      console.log(`Received ${signal}, draining...`);
      materializationCron.stop();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start insights service:', error);
    process.exit(1);
  }
}

start();
