import express from 'express';
import {
  requestLogger,
  correlationIdMiddleware,
  errorHandler,
  helmetMiddleware,
  corsMiddleware,
} from '@platform/shared';
import { authMiddleware } from './middleware/auth.middleware';
import { defaultLimiter } from './middleware/rate-limiter';
import { proxyRoutes } from './routes/proxy.routes';

const app = express();

// ─── Security ───
app.use(helmetMiddleware());
app.use(
  corsMiddleware({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:5173', 'http://asset.dev.local:8080'],
    credentials: true,
  }),
);

// ─── Logging ───
app.use(requestLogger);

// ─── Middleware ───
app.use(correlationIdMiddleware);
app.use(defaultLimiter);
app.use(authMiddleware);

// ─── Routes (proxy to services) ───
app.use(proxyRoutes);

// ─── Error Handling ───
app.use(errorHandler);

export { app };
