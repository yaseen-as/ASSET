import express from 'express';
import { marketRoutes } from './market/market.routes';
import { recommendationRoutes } from './recommendations/api/recommendations.routes';
import { modelsRoutes } from './recommendations/api/models.routes';
import { featureRoutes } from './features/routes';
import { backtestRoutes } from './backtest/api/backtest.routes';
import {
  createLogger,
  requestLogger,
  helmetMiddleware,
  corsMiddleware,
} from '@platform/shared';

const logger = createLogger('InsightsApp');

const app = express();

app.use(helmetMiddleware());
app.use(corsMiddleware());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'insights-service', timestamp: new Date().toISOString() });
});

// Market domain: quotes, historical OHLCV, technical indicators
app.use('', marketRoutes);

// Feature store: point-in-time feature vectors + materialization trigger
app.use('/features', featureRoutes);

// ML recommendations: top-N, per-symbol scoring, universe ranking
app.use('/recommendations', recommendationRoutes);

// Model registry: list, get, promote
app.use('/models', modelsRoutes);

// Backtest: submit async runs, poll status, list past results
app.use('/backtest', backtestRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Insights service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
