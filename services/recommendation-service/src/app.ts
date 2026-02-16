import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { recommendationRoutes } from './routes/recommendation.routes';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'recommendation-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/recommendations', recommendationRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Recommendation service error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
});

export { app };
