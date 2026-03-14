import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { userRoutes } from './routes/user.routes';
import { createLogger } from './utils/logger';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger('UserApp');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'user-service', timestamp: new Date().toISOString() });
});

app.use('', userRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('User service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
