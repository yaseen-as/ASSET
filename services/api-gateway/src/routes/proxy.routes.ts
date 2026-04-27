import { Router, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import { authLimiter, orderLimiter } from '../middleware/rate-limiter';

const router = Router();

// ─── Shared header injector factory ──────────────────────────────────────────
// Injects authenticated user info and correlation id into every proxied request.
function makeProxyHandler(includeEmail = false) {
  return (proxyReq: any, req: Request) => {
    if (req.user) {
      proxyReq.setHeader('x-user-id', req.user.userId);
      if (includeEmail) proxyReq.setHeader('x-user-email', req.user.email);
    }
    if (req.correlationId) {
      proxyReq.setHeader('x-correlation-id', req.correlationId);
    }
  };
}

// ─── Health Check ────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// ─── Auth Service  /v1/auth/* → auth-service:/ ───────────────────────────────
// Ingress strips /api prefix, so gateway receives /v1/auth/login etc.
// pathRewrite strips /v1/auth so auth-service receives /login, /register etc.
router.use(
  '/v1/auth',
  authLimiter,
  createProxyMiddleware({
    target: config.services.auth,
    changeOrigin: true,
    pathRewrite: { '^/v1/auth': '' },
    on: { proxyReq: makeProxyHandler(true) },
  })
);

// ─── User Profiles  /v1/users/* → auth-service:/ (merged) ───────────────────
router.use(
  '/v1/users',
  createProxyMiddleware({
    target: config.services.auth,
    changeOrigin: true,
    pathRewrite: { '^/v1/users': '' },
    on: { proxyReq: makeProxyHandler(true) },
  })
);

// ─── Trading Service  /v1/broker/* → trading-service:/ ──────────────────────
// Order routes get a stricter rate-limiter applied first.
router.use(
  '/v1/broker/orders',
  orderLimiter,
  createProxyMiddleware({
    target: config.services.trading,
    changeOrigin: true,
    pathRewrite: { '^/v1/broker': '' },
    on: { proxyReq: makeProxyHandler() },
  })
);

router.use(
  '/v1/broker',
  createProxyMiddleware({
    target: config.services.trading,
    changeOrigin: true,
    pathRewrite: { '^/v1/broker': '' },
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Market Service  /v1/market/* → market-service:/ ────────────────────────
router.use(
  '/v1/market',
  createProxyMiddleware({
    target: config.services.market,
    changeOrigin: true,
    pathRewrite: { '^/v1/market': '' },
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Portfolio (merged into trading-service)  /v1/portfolio/* → trading-service:/portfolio ──
router.use(
  '/v1/portfolio',
  createProxyMiddleware({
    target: config.services.trading,
    changeOrigin: true,
    pathRewrite: { '^/v1/portfolio': '/portfolio' },
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Recommendations (merged into market-service)  /v1/recommendations/* → market-service:/recommendations
router.use(
  '/v1/recommendations',
  createProxyMiddleware({
    target: config.services.market,
    changeOrigin: true,
    pathRewrite: { '^/v1/recommendations': '/recommendations' },
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Alerts + Notifications (merged into trading-service) ────────────────────
router.use(
  '/v1/alerts',
  createProxyMiddleware({
    target: config.services.trading,
    changeOrigin: true,
    pathRewrite: { '^/v1/alerts': '/alerts' },
    on: { proxyReq: makeProxyHandler() },
  })
);

router.use(
  '/v1/notifications',
  createProxyMiddleware({
    target: config.services.trading,
    changeOrigin: true,
    pathRewrite: { '^/v1/notifications': '/notifications' },
    on: { proxyReq: makeProxyHandler() },
  })
);

export { router as proxyRoutes };
