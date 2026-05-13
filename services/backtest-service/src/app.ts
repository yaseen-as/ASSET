import express from 'express';
import {
  createLogger,
  requestLogger,
  helmetMiddleware,
  corsMiddleware,
} from '@platform/shared';
import { backtestRoutes } from './api/backtest.routes';

const logger = createLogger('BacktestApp');

const app = express();

app.use(helmetMiddleware());
app.use(corsMiddleware());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backtest-service', timestamp: new Date().toISOString() });
});

app.use('/backtest', backtestRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Backtest service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
