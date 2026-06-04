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

// ─── Normalize public URL prefix ───
// Vite dev and k8s ingress send `/api/v1/*`; some callers send `/v1/*`
// directly. Strip a leading `/api` here so downstream routing only needs
// to care about `/v1/*`. req.originalUrl is preserved by Express and used
// later in pathRewrite to compute the upstream path.
app.use((req, _res, next) => {
  if (req.url === '/api') {
    req.url = '/';
  } else if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4); // '/api/v1/foo' -> '/v1/foo'
  }
  next();
});

// ─── Middleware ───
app.use(correlationIdMiddleware);
app.use(defaultLimiter);
app.use(authMiddleware);

// ─── Routes (proxy to services) ───
app.use(proxyRoutes);

// ─── Error Handling ───
app.use(errorHandler);

export { app };
