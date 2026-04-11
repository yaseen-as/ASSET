import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { alertRoutes } from './alerts/alert.routes';
import { notificationRoutes } from './notifications/notification.routes';
import { requestLogger } from './middleware/request-logger';
import { createLogger } from './utils/logger';

const logger = createLogger('EngagementApp');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'engagement-service' });
});

// Two domain route groups — gateway rewrites /v1/alerts → /alerts, /v1/notifications → /notifications
app.use('/alerts', alertRoutes);
app.use('/notifications', notificationRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
