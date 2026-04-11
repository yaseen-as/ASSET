import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { marketRoutes } from './market/market.routes';
import { recommendationRoutes } from './recommendations/recommendation.routes';
import { createLogger } from './utils/logger';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger('MarketApp');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'market-service', timestamp: new Date().toISOString() });
});

// Market domain: quotes, historical OHLCV, technical indicators
app.use('', marketRoutes);

// Recommendations domain: signals and personalized recommendations
app.use('/recommendations', recommendationRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Market service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
