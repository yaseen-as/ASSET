import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { JwtPayload } from '@platform/shared';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      correlationId?: string;
    }
  }
}

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/v1/auth/register' },
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'POST', path: '/api/v1/auth/verify-otp' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  { method: 'GET', path: '/health' },
];

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if route is public
  const isPublic = PUBLIC_ROUTES.some(
    (route) => req.method === route.method && req.path.startsWith(route.path)
  );

  if (isPublic) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('JWT verification failed', { error: (error as Error).message, ip: req.ip });
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }
}
