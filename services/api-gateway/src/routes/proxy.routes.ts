import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import { authLimiter, orderLimiter } from '../middleware/rate-limiter';

const router = Router();

// ─── Auth Service ───
router.use(
  '/api/v1/auth',
  authLimiter,
  createProxyMiddleware({
    target: config.services.auth,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
          proxyReq.setHeader('x-user-email', req.user.email);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── User Service ───
router.use(
  '/api/v1/users',
  createProxyMiddleware({
    target: config.services.user,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
          proxyReq.setHeader('x-user-email', req.user.email);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Broker Service ───
router.use(
  '/api/v1/broker/orders',
  orderLimiter,
  createProxyMiddleware({
    target: config.services.broker,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

router.use(
  '/api/v1/broker',
  createProxyMiddleware({
    target: config.services.broker,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Market Data Service ───
router.use(
  '/api/v1/market',
  createProxyMiddleware({
    target: config.services.marketData,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Portfolio Service ───
router.use(
  '/api/v1/portfolio',
  createProxyMiddleware({
    target: config.services.portfolio,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Recommendation Service ───
router.use(
  '/api/v1/recommendations',
  createProxyMiddleware({
    target: config.services.recommendation,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Alert Service ───
router.use(
  '/api/v1/alerts',
  createProxyMiddleware({
    target: config.services.alert,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Notification Service ───
router.use(
  '/api/v1/notifications',
  createProxyMiddleware({
    target: config.services.notification,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
        }
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
      },
    },
  })
);

// ─── Health Check ───
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

export { router as proxyRoutes };
