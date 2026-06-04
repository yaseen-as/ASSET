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

// ─── pathRewrite helper ──────────────────────────────────────────────────────
// Express auto-strips the mount prefix from req.url BEFORE the proxy sees it,
// so the regex form of pathRewrite (`{ '^/v1/foo': '...' }`) silently no-ops
// because it tries to match a prefix that's already gone. Using
// req.originalUrl bypasses that — originalUrl is never mutated by Express
// and always contains the full incoming path.
//
// The leading `/api` (added by Vite dev / k8s ingress) is stripped by the
// middleware in app.ts before this fires; pathRewrite here just strips the
// `/v1` (and optionally a domain segment).
const stripPrefix = (re: RegExp) => (_path: string, req: Request) => {
  const url = req.originalUrl.replace(/^\/api/, '');
  const rewritten = url.replace(re, '') || '/';
  return rewritten;
};

// Some service routers are mounted at root (with the domain embedded in
// individual route paths). For those, strip `/v1/<domain>` too so the path
// the service sees matches its router. The others keep `/<domain>` so the
// service's `app.use('/<domain>', ...)` mount matches.
const stripV1Domain = (domain: string) => stripPrefix(new RegExp(`^/v1/${domain}`));
const stripV1Only = stripPrefix(/^\/v1/);

// ─── Health Check ────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// ─── Auth  /v1/auth/* → core-service:/ ──────────────────────────────────────
// core-service mounts authRoutes at '' with router-paths /register, /login, ...
router.use(
  '/v1/auth',
  authLimiter,
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Domain('auth'),
    on: { proxyReq: makeProxyHandler(true) },
  })
);

// ─── User Profiles  /v1/users/* → core-service:/ ────────────────────────────
// core-service mounts profileRoutes at '' with router-paths /profile.
router.use(
  '/v1/users',
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Domain('users'),
    on: { proxyReq: makeProxyHandler(true) },
  })
);

// ─── Broker  /v1/broker/* → core-service:/broker ────────────────────────────
// core-service mounts brokerRoutes at '' but the router defines /broker/...
// (and /orders/..., /symbols/..., /paper/..., /connections, etc.). We must
// preserve /broker in the forwarded path.
//
// Note: `/v1/broker/orders` and `/v1/orders` are both order endpoints under
// the same router. The order-rate-limit is wired on the orders path.
router.use(
  '/v1/orders',
  orderLimiter,
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Only,
    on: { proxyReq: makeProxyHandler() },
  })
);

router.use(
  '/v1/broker',
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Only,
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Symbols / Paper / Connections (same router as broker) ──────────────────
for (const seg of ['symbols', 'paper', 'connections', 'disconnect', 'holdings'] as const) {
  router.use(
    `/v1/${seg}`,
    createProxyMiddleware({
      target: config.services.core,
      changeOrigin: true,
      pathRewrite: stripV1Only,
      on: { proxyReq: makeProxyHandler() },
    })
  );
}

// ─── Market  /v1/market/* → insights-service:/ ──────────────────────────────
// insights-service mounts marketRoutes at '' with router-paths /quote/...,
// /history/..., /indicators/... So strip /v1/market entirely.
router.use(
  '/v1/market',
  createProxyMiddleware({
    target: config.services.insights,
    changeOrigin: true,
    pathRewrite: stripV1Domain('market'),
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Portfolio  /v1/portfolio/* → core-service:/portfolio ───────────────────
router.use(
  '/v1/portfolio',
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Only,
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── Alerts + Notifications → core-service ──────────────────────────────────
router.use(
  '/v1/alerts',
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Only,
    on: { proxyReq: makeProxyHandler() },
  })
);

router.use(
  '/v1/notifications',
  createProxyMiddleware({
    target: config.services.core,
    changeOrigin: true,
    pathRewrite: stripV1Only,
    on: { proxyReq: makeProxyHandler() },
  })
);

// ─── ML domain → insights-service ───────────────────────────────────────────
// All insights ML modules are mounted via app.use('/<domain>', ...) inside
// the service, so we just strip /v1 here and forward the rest.
for (const seg of ['features', 'recommendations', 'models', 'backtest'] as const) {
  router.use(
    `/v1/${seg}`,
    createProxyMiddleware({
      target: config.services.insights,
      changeOrigin: true,
      pathRewrite: stripV1Only,
      on: { proxyReq: makeProxyHandler() },
    })
  );
}

export { router as proxyRoutes };
