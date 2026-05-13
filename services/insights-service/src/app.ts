import express from 'express';
import { marketRoutes } from './market/market.routes';
import { recommendationRoutes } from './recommendations/recommendation.routes';
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
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'insights-service', timestamp: new Date().toISOString() });
});

// Market domain: quotes, historical OHLCV, technical indicators
app.use('', marketRoutes);

// V1 rule-engine recommendations — kept for internal/legacy callers only.
// External traffic now hits recommendation-service via the api-gateway.
// Will be removed once no internal service depends on it.
app.use('/recommendations', recommendationRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Insights service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
