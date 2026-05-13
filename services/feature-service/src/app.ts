import express from 'express';
import {
  createLogger,
  requestLogger,
  helmetMiddleware,
  corsMiddleware,
} from '@platform/shared';
import { FeatureStoreRepository } from './feature-store/repository';
import { MaterializationCron } from './materialization/materialization.cron';
import { makeFeatureRoutes } from './feature-store/routes';

const logger = createLogger('FeatureApp');

export function makeApp() {
  const app = express();
  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'feature-service', timestamp: new Date().toISOString() });
  });

  const repo = new FeatureStoreRepository();
  const cron = new MaterializationCron(repo);

  app.use('/features', makeFeatureRoutes(repo, cron));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Feature service error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
  });

  return { app, cron };
}
