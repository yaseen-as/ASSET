# Service Consolidation Plan — 9 to 5 Services

> Created: 2026-04-10

## Why Consolidate

| Problem | Impact |
|---------|--------|
| 9 services for a single-team project | Excessive deployment/debug overhead |
| portfolio-service makes 3 HTTP calls to broker + market just to load holdings | Latency, fragility |
| user-service is 2 endpoints (~400 LOC) running as its own pod | Wasted resources |
| alert-service publishes events, notification-service subscribes to them | Unnecessary network hop for same-domain concern |
| recommendation-service HTTP-calls market-data for candles | Could be a direct function call |
| 9 configmaps, 9 deployments, 9 services in K8s | Operational complexity |

## Target Architecture

```
BEFORE (9 services + gateway)              AFTER (5 services + gateway)
──────────────────────────────              ────────────────────────────

api-gateway ─────────────────────────────► api-gateway
                                             Port 3000 (unchanged)

auth-service (3 tables, 5 routes)  ┐
                                   ├─────► auth-service
user-service (1 table, 2 routes)   ┘         Port 3001
                                             Schemas: auth + users
                                             Tables: users, refresh_tokens, otp_codes, profiles
                                             Routes: 7

broker-service (4 tables, 18 routes)  ┐
                                      ├──► trading-service
portfolio-service (3 tables, 6 routes)┘      Port 3003
                                             Schemas: broker + portfolio
                                             Tables: connections, orders, symbol_master,
                                                     paper_accounts, portfolios, holdings, watchlists
                                             Routes: 24

market-data-service (1 table, 3 routes)     ┐
                                            ├► market-service
recommendation-service (1 table, 2 routes)  ┘    Port 3004 / WS 3014
                                                 Schemas: market + recommendations
                                                 Tables: ohlcv_daily, ohlcv_intraday,
                                                         signals, user_recommendations
                                                 Routes: 5

alert-service (1 table, 6 routes)        ┐
                                         ├──► engagement-service
notification-service (2 tables, 4 routes)┘      Port 3007 / WS 3018
                                                Schemas: alerts + notifications
                                                Tables: alerts, notifications, preferences
                                                Routes: 10
```

## What Gets Eliminated

| Eliminated | How |
|-----------|-----|
| portfolio → broker HTTP calls (2) | Direct function call inside trading-service |
| portfolio → market-data HTTP call (1) | Internal call to market-service (1 remaining) |
| recommendation → market-data HTTP call (1) | Direct function call inside market-service |
| broker → user-service HTTP call (1) | Direct DB query to users.profiles inside auth-service call or trading-service owns the check |
| alert → notification Redis pub/sub hop | Direct function call inside engagement-service |
| 4 K8s Deployments | Gone |
| 4 K8s Services | Gone |
| 4 ConfigMaps | Gone |
| 4 Docker images to build/push | Gone |

## Implementation Phases

---

### Phase A: auth-service + user-service (1-2 days, low risk)

**Why first**: user-service is the smallest (2 endpoints, 1 table). Zero outbound dependencies. Simplest merge.

#### Step 1: Move DB schema

The `users.profiles` table stays in its own schema. auth-service already connects to PostgreSQL — just add the `users` schema to its search path.

**Files to change:**
- `services/auth-service/src/config/database.ts` — add `users` to search path
- Move migration files from `services/user-service/migrations/` into `services/auth-service/migrations/`:
  - `20260216000001_create_profiles_table.ts` → rename to `20260216000002_create_profiles_table.ts`
  - `20260317000001_add_paper_trading.ts` → rename to `20260317000002_add_paper_trading.ts`

#### Step 2: Move source code

Copy into auth-service:
```
user-service/src/repositories/user.repository.ts  → auth-service/src/repositories/user.repository.ts
user-service/src/services/user.service.ts          → auth-service/src/services/user.service.ts
user-service/src/controllers/user.controller.ts    → auth-service/src/controllers/user.controller.ts
```

Add routes to auth-service:
```typescript
// auth-service/src/routes/auth.routes.ts — add:
import { UserController } from '../controllers/user.controller';

router.get('/profile', UserController.getProfile);
router.patch('/profile', UserController.updateProfile);
```

#### Step 3: Update gateway proxy

```typescript
// api-gateway/src/routes/proxy.routes.ts
// Remove the /v1/users proxy block entirely.
// Add user routes to auth proxy:

router.use(
  '/v1/users',           // keep same external URL
  createProxyMiddleware({
    target: config.services.auth,  // now points to auth-service
    changeOrigin: true,
    pathRewrite: { '^/v1/users': '/profile' },  // rewrite to match auth routes
    on: { proxyReq: makeProxyHandler(true) },
  })
);
```

#### Step 4: Update gateway config

```typescript
// api-gateway/src/config/index.ts
services: {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  // user: REMOVED
  broker: ...,
  ...
}
```

#### Step 5: Update broker-service call

`broker-service/src/services/broker.service.ts` calls `http://user-service/api/v1/users/profile` to check `paper_trading`. Change to call auth-service:

```typescript
// broker.service.ts — isPaperTradingEnabled()
const { data } = await axios.get(
  `${config.authServiceUrl}/profile`,  // was userServiceUrl
  { headers: { 'x-user-id': userId }, timeout: 3000 }
);
```

#### Step 6: K8s cleanup

- Delete `k8s/base/services/user-service/` directory entirely
- Update `k8s/base/services/kustomization.yaml` — remove `user-service/` from resources
- Update `k8s/base/services/broker-service/configmap.yaml` — change `USER_SERVICE_URL` to `AUTH_SERVICE_URL`

#### Step 7: Delete

- Delete `services/user-service/` directory entirely

---

### Phase B: alert-service + notification-service → engagement-service (2-3 days, low risk)

**Why second**: Both handle user-facing events. Alert publishes to Redis `alert:triggered`, notification subscribes. Merging removes the pub/sub hop.

#### Step 1: Create new service directory

```bash
cp -r services/alert-service services/engagement-service
```

Use alert-service as the base because it has more complex logic (tick subscription, condition evaluation).

#### Step 2: Merge DB schemas

Keep both schemas (`alerts` + `notifications`). Add second schema to database config search path.

Move migrations from notification-service:
- `20260216000001_create_notification_tables.ts` → `20260216000003_create_notification_tables.ts`

#### Step 3: Move notification code into engagement-service

```
notification-service/src/repositories/notification.repository.ts → engagement-service/src/repositories/
notification-service/src/repositories/preference.repository.ts   → engagement-service/src/repositories/
notification-service/src/services/notification.service.ts         → engagement-service/src/services/
notification-service/src/controllers/notification.controller.ts   → engagement-service/src/controllers/
notification-service/src/services/ws-server.ts                    → engagement-service/src/services/notification-ws.ts
```

#### Step 4: Merge routes

```typescript
// engagement-service/src/routes/index.ts
import { alertRoutes } from './alert.routes';
import { notificationRoutes } from './notification.routes';

router.use('/alerts', alertRoutes);           // /alerts/*
router.use('/notifications', notificationRoutes); // /notifications/*
```

#### Step 5: Replace Redis pub/sub with direct call

In the alert evaluation logic, where it currently does:
```typescript
redis.publish('alert:triggered', JSON.stringify(payload));
```

Replace with direct function call:
```typescript
await notificationService.createFromAlert(payload);
```

Keep `alert:triggered` Redis publish as well for any external consumers, but the notification is now created directly.

#### Step 6: Merge WebSocket servers

Alert-service currently has no WebSocket. Notification-service runs WS on port 3018. Keep the notification WS server inside engagement-service, running on port 3018.

#### Step 7: Update gateway proxy

```typescript
// Two proxy entries point to same service:
router.use('/v1/alerts', proxy → engagement-service, pathRewrite → /alerts);
router.use('/v1/notifications', proxy → engagement-service, pathRewrite → /notifications);
```

Gateway config:
```typescript
services: {
  engagement: process.env.ENGAGEMENT_SERVICE_URL || 'http://localhost:3007',
  // alert: REMOVED
  // notification: REMOVED
}
```

#### Step 8: K8s cleanup

- Delete `k8s/base/services/alert-service/` and `k8s/base/services/notification-service/`
- Create `k8s/base/services/engagement-service/` (deployment, service, configmap)
- The new service listens on port 3007 (HTTP) + 3018 (WebSocket)

#### Step 9: Delete old services

- Delete `services/alert-service/`
- Delete `services/notification-service/`

---

### Phase C: broker-service + portfolio-service → trading-service (3-4 days, medium risk)

**Why**: portfolio-service makes 3 HTTP calls to broker + market-data every time it loads. They're the same trading domain.

#### Step 1: Use broker-service as base

Broker-service is the larger codebase (26 files, 18 routes). Rename to trading-service.

```bash
mv services/broker-service services/trading-service
```

Update `package.json` name to `@platform/trading-service`.

#### Step 2: Merge DB schemas

Add `portfolio` schema to search path alongside `broker`.

Move portfolio migrations into trading-service:
- `20260216000001_create_portfolio_tables.ts` → rename with later timestamp

#### Step 3: Move portfolio code

```
portfolio-service/src/repositories/portfolio.repository.ts  → trading-service/src/repositories/
portfolio-service/src/repositories/holding.repository.ts    → trading-service/src/repositories/
portfolio-service/src/repositories/watchlist.repository.ts  → trading-service/src/repositories/
portfolio-service/src/services/portfolio.service.ts         → trading-service/src/services/
portfolio-service/src/controllers/portfolio.controller.ts   → trading-service/src/controllers/
portfolio-service/src/controllers/watchlist.controller.ts   → trading-service/src/controllers/
```

#### Step 4: Eliminate HTTP calls

In `portfolio.service.ts`, replace:
```typescript
// OLD: HTTP call to broker-service
const { data } = await axios.get(`${config.brokerServiceUrl}/connections`, ...);
const { data: holdings } = await axios.get(`${config.brokerServiceUrl}/holdings/${connId}`, ...);

// NEW: Direct function call (same process)
const connections = await brokerService.getConnections(userId);
const holdings = await brokerService.getHoldings(userId, connId);
```

#### Step 5: Merge routes

```typescript
// trading-service/src/routes/index.ts
router.use('/', brokerRoutes);           // existing: /connect, /orders, /market/quote, etc.
router.use('/portfolio', portfolioRoutes); // new: /portfolio/holdings, /portfolio/sync, etc.
```

#### Step 6: Update gateway proxy

```typescript
// Keep both external URL prefixes, point to same service:
router.use('/v1/broker', proxy → trading-service, pathRewrite → strip /v1/broker);
router.use('/v1/portfolio', proxy → trading-service, pathRewrite → /v1/broker → /portfolio);
```

Gateway config:
```typescript
services: {
  trading: process.env.TRADING_SERVICE_URL || 'http://localhost:3003',
  // broker: REMOVED
  // portfolio: REMOVED
}
```

#### Step 7: K8s cleanup

- Rename `k8s/base/services/broker-service/` to `k8s/base/services/trading-service/`
- Delete `k8s/base/services/portfolio-service/`
- Merge configmaps

#### Step 8: Delete

- Delete `services/portfolio-service/`

---

### Phase D: market-data-service + recommendation-service → market-service (2-3 days, low risk)

**Why**: recommendation-service HTTP-calls market-data for OHLCV candles. Both use `technicalindicators` library. Same analytics domain.

#### Step 1: Use market-data-service as base

```bash
mv services/market-data-service services/market-service
```

#### Step 2: Merge DB schemas

Add `recommendations` schema to search path.

Move recommendation migrations.

#### Step 3: Move recommendation code

```
recommendation-service/src/repositories/signal.repository.ts   → market-service/src/repositories/
recommendation-service/src/services/rule-engine.service.ts      → market-service/src/services/
recommendation-service/src/services/signal.service.ts           → market-service/src/services/
recommendation-service/src/controllers/recommendation.controller.ts → market-service/src/controllers/
```

#### Step 4: Eliminate HTTP call

In `signal.service.ts`, replace:
```typescript
// OLD: HTTP call to market-data-service
const { data } = await axios.get(`${config.marketDataUrl}/history/${exchange}/${symbol}`, ...);

// NEW: Direct function call
const history = await marketDataService.getHistorical(exchange, symbol, '1d', from, to);
```

#### Step 5: Merge routes

```typescript
router.use('/', marketRoutes);                     // /quote, /history, /indicators
router.use('/recommendations', recommendationRoutes); // /recommendations, /recommendations/personalized
```

#### Step 6: Update gateway

```typescript
router.use('/v1/market', proxy → market-service, pathRewrite → strip /v1/market);
router.use('/v1/recommendations', proxy → market-service, pathRewrite → /recommendations);
```

#### Step 7: K8s cleanup and delete old service

---

## Final State

### Services (5 + gateway)

| Service | Port | WS Port | DB Schemas | Routes | Est. LOC |
|---------|------|---------|------------|--------|----------|
| api-gateway | 3000 | — | — | proxy only | ~600 |
| auth-service | 3001 | — | auth, users | 7 | ~1200 |
| trading-service | 3003 | — | broker, portfolio | 24 | ~2400 |
| market-service | 3004 | 3014 | market, recommendations | 5 | ~1400 |
| engagement-service | 3007 | 3018 | alerts, notifications | 10 | ~1200 |

### API Gateway Proxy Map (after)

| External Path | Target Service | Internal Path |
|--------------|---------------|---------------|
| `/v1/auth/*` | auth-service:3001 | `/*` |
| `/v1/users/*` | auth-service:3001 | `/profile/*` |
| `/v1/broker/*` | trading-service:3003 | `/*` |
| `/v1/portfolio/*` | trading-service:3003 | `/portfolio/*` |
| `/v1/market/*` | market-service:3004 | `/*` |
| `/v1/recommendations/*` | market-service:3004 | `/recommendations/*` |
| `/v1/alerts/*` | engagement-service:3007 | `/alerts/*` |
| `/v1/notifications/*` | engagement-service:3007 | `/notifications/*` |

External API URLs stay the same. Frontend needs zero changes.

### K8s Deployments (after)

```
k8s/base/services/
├── api-gateway/
├── auth-service/
├── trading-service/        (was broker + portfolio)
├── market-service/         (was market-data + recommendation)
└── engagement-service/     (was alert + notification)
```

### Redis Pub/Sub (after)

| Channel | Publisher | Subscriber |
|---------|----------|-----------|
| `market:tick:*` | market-service | engagement-service (alert evaluation) |
| `alert:triggered` | engagement-service | (internal — no longer cross-service) |
| `recommendation:new` | market-service | engagement-service |
| `order:executed` | trading-service | engagement-service |

## Implementation Order & Timeline

| Phase | Merge | Risk | Effort | Week |
|-------|-------|------|--------|------|
| A | auth + user | Low | 1-2 days | Week 1 |
| B | alert + notification → engagement | Low | 2-3 days | Week 1 |
| C | broker + portfolio → trading | Medium | 3-4 days | Week 2 |
| D | market-data + recommendation → market | Low | 2-3 days | Week 2 |

**Total: ~2 weeks**

## Checklist Per Phase

- [ ] Move migrations (renumber timestamps)
- [ ] Move repositories, services, controllers
- [ ] Merge routes with sub-path prefixes
- [ ] Update database config (multi-schema search path)
- [ ] Replace HTTP calls with direct function calls
- [ ] Update api-gateway proxy routes + config
- [ ] Update K8s manifests (deployment, service, configmap)
- [ ] Update inter-service URLs in remaining services
- [ ] Update `CLAUDE.md` and `SERVICES.md`
- [ ] Delete old service directories
- [ ] Test all endpoints via gateway
- [ ] Verify K8s deployment

## What NOT to Change

- **External API URLs** — `/v1/auth`, `/v1/broker`, `/v1/market`, etc. stay identical. Frontend and any external clients are unaffected.
- **Database schemas** — Keep separate schemas (`auth`, `users`, `broker`, `portfolio`, etc.) even within merged services. Schema isolation is good for data boundaries.
- **Redis pub/sub channels** — Keep the channel names. Only the `alert:triggered` hop becomes optional.
- **@platform/shared types** — All types stay. No breaking changes to the shared package.
