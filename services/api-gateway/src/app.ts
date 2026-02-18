import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authMiddleware } from './middleware/auth.middleware';
import { correlationIdMiddleware } from './middleware/correlation-id';
import { defaultLimiter } from './middleware/rate-limiter';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { proxyRoutes } from './routes/proxy.routes';

const app = express();

// ─── Security ───
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
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
