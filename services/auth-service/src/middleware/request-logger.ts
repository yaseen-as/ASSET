import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('RequestLogger');

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    
    logger.info({
      message: 'HTTP Request',
      method,
      endpoint: originalUrl,
      statusCode,
      duration: `${duration}ms`,
      ip,
    });
  });

  next();
}
