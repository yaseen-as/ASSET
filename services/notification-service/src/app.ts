import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import notificationRoutes from './routes/notification.routes';
import { createLogger } from './utils/logger';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger('NotificationApp');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

// Routes
app.use('/api/v1/notifications', notificationRoutes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
