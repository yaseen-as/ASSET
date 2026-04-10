import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRoutes } from './routes/auth.routes';
import { profileRoutes } from './routes/profile.routes';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';

const app = express();

// ─── Middleware ───
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ─── Health Check ───
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// ─── Routes ───
app.use('/', authRoutes);
app.use('/', profileRoutes);

// ─── Error Handling ───
app.use(errorHandler);

export { app };
