import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { portfolioRoutes } from './routes/portfolio.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { createLogger } from './utils/logger';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger('PortfolioApp');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'portfolio-service', timestamp: new Date().toISOString() });
});

app.use('', portfolioRoutes);
app.use('/analytics', analyticsRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Portfolio service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
