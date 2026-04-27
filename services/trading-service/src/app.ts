import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { brokerRoutes } from './broker/broker.routes';
import { portfolioRoutes } from './portfolio/portfolio.routes';
import { alertRoutes } from './engagement/alert.routes';
import { notificationRoutes } from './engagement/notification.routes';
import { ServiceError } from './broker/broker.service';
import { createLogger } from './utils/logger';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger('TradingApp');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'trading-service', timestamp: new Date().toISOString() });
});

// Broker domain: connection management, orders, market quotes, paper trading, symbols
app.use('', brokerRoutes);

// Portfolio domain: holdings, watchlists, broker sync
app.use('/portfolio', portfolioRoutes);

// Engagement domain: alerts + notifications (merged from engagement-service)
app.use('/alerts', alertRoutes);
app.use('/notifications', notificationRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }
  logger.error('Trading service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
