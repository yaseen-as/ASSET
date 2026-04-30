import express from 'express';
import { brokerRoutes } from './broker/broker.routes';
import { portfolioRoutes } from './portfolio/portfolio.routes';
import { alertRoutes } from './engagement/alert.routes';
import { notificationRoutes } from './engagement/notification.routes';
import { authRoutes } from './auth/auth.routes';
import { profileRoutes } from './users/profile.routes';
import { ServiceError } from './broker/broker.service';
import {
  AppError,
  createLogger,
  requestLogger,
  helmetMiddleware,
  corsMiddleware,
} from '@platform/shared';

const logger = createLogger('CoreApp');

const app = express();

app.use(helmetMiddleware());
app.use(corsMiddleware());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'core-service', timestamp: new Date().toISOString() });
});

// Auth domain: register, login, otp, logout
app.use('', authRoutes);

// Users domain: profile
app.use('', profileRoutes);

// Broker domain: connection management, orders, market quotes, paper trading, symbols
app.use('', brokerRoutes);

// Portfolio domain: holdings, watchlists, broker sync
app.use('/portfolio', portfolioRoutes);

// Engagement domain: alerts + notifications
app.use('/alerts', alertRoutes);
app.use('/notifications', notificationRoutes);

// Unified error handler — covers ServiceError (broker) and AppError (auth/engagement)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ServiceError || err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }
  logger.error('Core service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
