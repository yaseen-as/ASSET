import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('RequestLogger');

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      message: 'HTTP Request',
      method,
      endpoint: originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip,
    });
  });

  next();
}
