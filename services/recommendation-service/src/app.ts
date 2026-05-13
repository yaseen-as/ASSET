import express from 'express';
import {
  createLogger,
  requestLogger,
  helmetMiddleware,
  corsMiddleware,
} from '@platform/shared';
import { RegistryRepository } from './data/registry.repository';
import { ScoreRepository } from './data/score.repository';
import { FeatureClient } from './data/feature.client';
import { OnnxLoaderService } from './inference/onnx-loader.service';
import { InferenceService } from './inference/inference.service';
import { ScorerService } from './scoring/scorer.service';
import { makeRecommendationRoutes } from './api/recommendations.routes';
import { makeModelsRoutes } from './api/models.routes';

const logger = createLogger('RecommendationApp');

export function makeApp() {
  const app = express();
  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'recommendation-service', timestamp: new Date().toISOString() });
  });

  const registry = new RegistryRepository();
  const loader = new OnnxLoaderService(registry);
  const inference = new InferenceService(loader);
  const scoreRepo = new ScoreRepository();
  const featureClient = new FeatureClient();
  const scorer = new ScorerService(registry, inference, scoreRepo, featureClient);

  app.use('/recommendations', makeRecommendationRoutes(scorer, scoreRepo, registry));
  app.use('/models', makeModelsRoutes(registry, loader));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Recommendation service error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
  });

  return { app, scorer, loader };
}
