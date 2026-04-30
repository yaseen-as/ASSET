# Simplification Plan — 5 services → 3 services + 2 DBs

Phased plan to reduce over-engineering. Each phase ends with a deployable, working app.

## Target architecture

```
api-gateway (3000)  →  core-service (3001)       →  core_db
                       insights-service (3004)   →  insights_db
```

- **core-service** = auth + users + broker + portfolio + engagement (alerts/notifications), schemas in `core_db`
- **insights-service** = market + recommendations (no ticks, no WS, on-request signals + ML later), `insights_db`
- **api-gateway** unchanged externally; just two upstreams

## Phase order (each ends deployable)

| # | Phase | Coordination |
|---|---|---|
| **A** | Frontend trim — drop WS clients, analytics route, notification.store | FE only |
| **B** | Per-service internal trim — kill tick generator, WS managers, signal scheduler, order tracker, ws-notifier, email, refresh tokens | BE only |
| **C** | Merge engagement-service → trading-service (dual-Knex bookkeeping) | FE+BE |
| **D** | Merge auth-service → trading-service (third Knex) | FE+BE |
| **E** | Rename market-service → insights-service | FE+BE |
| **F** | Rename trading-service → core-service; extract shared middleware to `@platform/shared` | FE+BE |
| **G** | DB consolidation: drop auth_db/trading_db/engagement_db/market_db, recreate `core_db` + `insights_db`, collapse to one Knex per service | BE only, dev data wiped |

**Why this order:** frontend first shrinks the contract surface; service trimming next is internal-only; then merges happen one at a time using a dual-Knex pattern so each merge is safe; renames come after the code is stable; DB consolidation last because by F we already have one process talking to three DBs — G is just pointing it at one.

---

## Phase A — Frontend simplifications

**Delete:**
- `frontend/src/hooks/useWebSocket.ts`
- `frontend/src/hooks/useMarketTicks.ts`
- `frontend/src/stores/analytics.store.ts`
- `frontend/src/stores/notification.store.ts`
- `frontend/src/features/analytics/` (entire folder)

**Add:**
- `frontend/src/hooks/usePolling.ts` — generic hook with `setInterval` gated on `document.visibilityState === 'visible'`, fires once on mount, pauses on tab hidden

**Edit:**
| File | Change |
|---|---|
| `App.tsx` | Remove `/analytics` route + import |
| `layouts/DashboardLayout.tsx` | Remove WS notification subscription; `usePolling(fetchNotifications, 30_000)` |
| `features/market/pages/MarketPage.tsx` | `usePolling(fetchQuotes, 5_000)` |
| `features/dashboard/pages/DashboardPage.tsx` | Same; drop analytics widget |
| `features/orders/pages/OrderPage.tsx` | `usePolling(fetchOrders, 30_000, { enabled: hasPending })` |
| `features/broker/pages/BrokerPage.tsx` | Drop realtime hook; refetch on mount + on action |

**Polling intervals:** quotes 5s, notifications 30s, orders 30s (only when pending). Alerts/portfolio/watchlist/recommendations/broker — no polling, refetch on mount + after CRUD.

**Verify:** SPA loads, no `ws://` in DevTools, prices update in 5s, no `/analytics` link.

---

## Phase B — Per-service internal trim

### B.1 market-service
**Delete:** `mock-tick-generator.ts`, `websocket.manager.ts`, `signal.scheduler.ts`
**Edit:** `server.ts` (remove WS/scheduler wiring), `config/index.ts` (drop `wsPort`/`mockTicks`/`trackedSymbols`, add `signalCacheHours: 4`), `recommendation.controller.ts` (on-request: if no signal newer than cache window, generate synchronously)
**K8s:** drop port 3014 from deployment+service+configmap; remove `WS_PORT`/`MOCK_TICKS`/`TRACKED_SYMBOLS`
**Drop deps:** `ws`

### B.2 trading-service
**Delete:** `src/workers/order-tracker.ts` (folder)
**Edit:** `server.ts` (remove tracker), `order.controller.ts` (`GET /orders` fetches Upstox status if any pending), `paper-trading.service.ts` (remove `redis.publish('order:executed', ...)`)
**Drop deps:** `node-cron`

### B.3 auth-service
**Edit:** Remove refresh-token flow entirely — `auth.service.refresh()`, `/refresh` route, `RefreshTokenRepository`, `generateRefreshToken`, `jwt.refreshExpiryDays`, `AuthTokens.refreshToken`, `refreshTokenSchema`
**Frontend:** `auth.store.ts` + `lib/api.ts` — drop refresh interceptor, on 401 redirect to `/login`
(Table `auth.refresh_tokens` is left until Phase G's wipe)

### B.4 engagement-service
**Delete:** `services/email.service.ts`, `services/ws-notifier.ts`
**Edit:** `evaluation.engine.ts` (remove Redis tick subscription; expose `evaluateForUser(userId)` called on alert read), `notification.service.ts` (remove `redisSub.subscribe('alert:triggered'/'order:executed'/'recommendation:new')`), `server.ts` (no WsNotifier, no SMTP), `config/index.ts` (drop `wsPort`/`email`/`redis` blocks)
**K8s:** drop port 3018, remove `WS_PORT`/`REDIS_HOST`/`REDIS_PORT`
**Drop deps:** `nodemailer`, `ws`, `ioredis` (if unused)

**Verify (B end):** all 4 services build; `kubectl apply -k k8s/overlays/dev` all Ready; login returns just `accessToken`; no "Subscribed to market:tick:*", no "OrderTracker started", no "WebSocket server listening" in logs.

---

## Phase C — Merge engagement-service → trading-service

**Move (code):**
- `engagement-service/src/alerts/*` → `trading-service/src/engagement/`
- `engagement-service/src/notifications/*` → `trading-service/src/engagement/`
- `engagement-service/src/services/evaluation.engine.ts` → `trading-service/src/engagement/`

**Move (migrations):**
- `engagement-service/migrations/*` → `trading-service/migrations-engagement/` (keep separate folder during C–F)

**Dual-Knex strategy:** add `engagementDb` Knex instance to `trading-service/src/config/database.ts` pointing at `engagement_db`, with its own `searchPath: ['alerts','notifications','public']` and `migrations.directory: './migrations-engagement'`. Inject it into the moved repos. Don't rename schemas yet.

**Edit:**
| File | Change |
|---|---|
| `trading-service/src/app.ts` | Mount `/alerts` and `/notifications` routes |
| `trading-service/src/server.ts` | Wire `AlertService`, `NotificationService`, `EvaluationEngine` (no Redis, no WS); call `initEngagementDatabase()` |
| `trading-service/src/config/index.ts` | Add `engagementDb.database` from `ENGAGEMENT_DB_NAME` |
| `api-gateway/src/routes/proxy.routes.ts` | `/v1/alerts` and `/v1/notifications` → `services.trading` |
| `api-gateway/src/config/index.ts` | Drop `services.engagement` |

**Delete after move:** entire `services/engagement-service/` and `k8s/base/services/engagement-service/` folders.

**K8s:**
- `k8s/base/services/kustomization.yaml`: remove `- engagement-service/`
- `k8s/base/services/api-gateway/configmap.yaml`: drop `ENGAGEMENT_SERVICE_URL`
- `k8s/base/services/trading-service/configmap.yaml`: add `ENGAGEMENT_DB_NAME: engagement_db`

**Verify:** `kubectl get deploy` no engagement-service; `/v1/alerts` and `/v1/notifications` still 200; trading pod logs show two DB inits.

---

## Phase D — Merge auth-service → trading-service

**Move:**
- `auth-service/src/controllers/auth.controller.ts` → `trading-service/src/auth/`
- `auth-service/src/services/{auth,otp,profile}.service.ts` → `trading-service/src/auth/` (profile to `src/users/`)
- `auth-service/src/repositories/{user,profile}.repository.ts` → `trading-service/src/{auth,users}/`
- `auth-service/src/routes/{auth,profile}.routes.ts` → `trading-service/src/{auth,users}/`
- `auth-service/src/utils/{jwt,hash}.ts` → `trading-service/src/auth/`
- `auth-service/src/middleware/{validate,error-handler}.ts` → `trading-service/src/middleware/`
- `auth-service/migrations/*` → `trading-service/migrations-auth/` (separate folder until G)

**Add third Knex** `authDb` in `trading-service/src/config/database.ts` (`searchPath: ['auth','users','public']`, `migrations.directory: './migrations-auth'`).

**Edit:**
| File | Change |
|---|---|
| `trading-service/src/app.ts` | Mount auth+profile routes; replace inline error handler with shared `errorHandler` |
| `trading-service/src/server.ts` | `await initAuthDatabase()` |
| `api-gateway/src/routes/proxy.routes.ts` | `/v1/auth`, `/v1/users` → `services.trading` |
| `k8s/base/services/trading-service/configmap.yaml` | Add `AUTH_DB_NAME: auth_db`, `OTP_PROVIDER: mock` |
| `k8s/base/services/trading-service/secret.yaml` | Add `JWT_SECRET` (must match gateway) |

**Delete:** entire `services/auth-service/` and `k8s/base/services/auth-service/`; remove from kustomization; drop `AUTH_SERVICE_URL` from gateway configmap.

**Verify:** 4 deployments only (gateway, trading, market, frontend). Login + register + profile + alerts + orders all 200. Trading pod logs show three DB inits.

---

## Phase E — Rename market-service → insights-service

**Folder rename:** `services/market-service/` → `services/insights-service/`; `k8s/base/services/market-service/` → `k8s/base/services/insights-service/`

**Edit:**
| File | Change |
|---|---|
| `insights-service/package.json` | name `@platform/insights-service` |
| `insights-service/src/config/index.ts` | `tradingServiceUrl` (later renamed in F to `coreServiceUrl`) — keep working |
| `insights-service/src/config/database.ts` | `database: 'insights_db'` |
| `api-gateway/src/config/index.ts` | `services.insights` (default `http://insights-service:80`); remove `services.market` |
| `api-gateway/src/routes/proxy.routes.ts` | `/v1/market`, `/v1/recommendations` → `services.insights` |
| `k8s/base/services/insights-service/*.yaml` | Names, image `yaseenas/insights-service:latest`, `DB_NAME: insights_db` |
| `k8s/base/services/kustomization.yaml` | Replace `- market-service/` with `- insights-service/` |
| `k8s/base/services/api-gateway/configmap.yaml` | `INSIGHTS_SERVICE_URL` |
| `Jenkinsfile`, `init.sh`, root `package.json`, `turbo.json` | Replace `market-service` references |

**Verify:** `kubectl get deploy` shows `insights-service`; `/v1/market/quote/...` and `/v1/recommendations` both 200.

---

## Phase F — Rename trading-service → core-service + shared middleware

**Folder rename:** `services/trading-service/` → `services/core-service/`; `k8s/base/services/trading-service/` → `k8s/base/services/core-service/`

**New shared modules in `packages/shared/src/`:**
- `middleware/request-logger.ts`
- `middleware/error-handler.ts`
- `middleware/correlation-id.ts`
- `middleware/security.ts` (helmet+cors defaults)
- `utils/logger.ts` — `createLogger(serviceName)` factory
- `errors/app-error.ts` — single `AppError`
- Re-export from `index.ts`

**Delete duplicates:**
- `core-service/src/middleware/request-logger.ts`
- `core-service/src/utils/logger.ts`
- `insights-service/src/middleware/request-logger.ts`, `utils/logger.ts`
- `api-gateway/src/middleware/{request-logger,correlation-id,error-handler}.ts`, `utils/logger.ts`

**Edit:**
| File | Change |
|---|---|
| `core-service/package.json` | name `@platform/core-service` |
| `core-service/src/config/index.ts` | `port: 3001` |
| `core-service/src/{app,server}.ts` | Use shared middleware; log "Core Service" |
| `insights-service/src/app.ts` + `api-gateway/src/app.ts` | Use shared middleware |
| `api-gateway/src/config/index.ts` | `services.core` (default `http://core-service:80`); remove `services.trading` |
| `api-gateway/src/routes/proxy.routes.ts` | All `services.trading` → `services.core` |
| `k8s/base/services/core-service/*.yaml` | name `core-service`, image `yaseenas/core-service:latest`, `containerPort: 3001`, `targetPort: 3001`, configmap/secret names |
| `k8s/base/services/core-service/configmap.yaml` | `PORT: "3001"`, `DB_NAME: core_db` (forward-looking) |
| `k8s/base/services/api-gateway/configmap.yaml` | `CORE_SERVICE_URL: http://core-service` |
| `k8s/base/services/kustomization.yaml` | `- core-service/` |
| `Jenkinsfile`, root `package.json`, `init.sh`, `turbo.json` | trading-service → core-service |

**Critical:** preserve `BROKER_TOKEN_ENCRYPTION_KEY` and `JWT_SECRET` values across the rename.

**Verify:** exactly 4 deployments (`api-gateway`, `core-service`, `insights-service`, `react-frontend`); all flows work; `grep -rn 'helmet()' services/` shows no per-service duplication.

---

## Phase G — DB consolidation (recommended option: drop & re-migrate)

**Tradeoff:** all dev data in `auth_db`, `trading_db`, `engagement_db`, `market_db` is destroyed. Symbol master re-syncs from Upstox on first boot (~30–60s).

### G.1 Consolidate migrations into `core-service/migrations/`

| From → To | Notes |
|---|---|
| `migrations-auth/20260216000001_create_auth_tables.ts` → `migrations/20260216000001_create_auth_tables.ts` | No collision |
| `migrations-auth/20260216000002_create_profiles_table.ts` → `migrations/20260216000003_create_profiles_table.ts` | Renumber |
| `migrations-auth/20260317000002_add_paper_trading.ts` → `migrations/20260317000010_add_paper_trading.ts` | Renumber (collision) |
| `migrations/20260216000001_create_broker_tables.ts` | Keep |
| `migrations/20260316000001_add_feed_token.ts` | Keep |
| `migrations/20260317000001_create_symbol_master.ts` | Keep |
| `migrations/20260317000002_create_order_history.ts` | Keep |
| `migrations/20260317000003_create_paper_account.ts` | Keep |
| `migrations/20260317000004_create_portfolio_tables.ts` | Keep |
| `migrations/20260417000001_update_broker_connections_upstox.ts` | Keep |
| `migrations-engagement/20260216000001_create_alerts_table.ts` → `migrations/20260216000004_create_engagement_alerts.ts` | **Edit** schema `alerts` → `engagement` |
| `migrations-engagement/20260216000002_create_notification_tables.ts` → `migrations/20260216000005_create_engagement_notifications.ts` | **Edit** schema `notifications` → `engagement` |

**Repository edits (schema rename):**
- `engagement/alert.repository.ts`: `alerts.alerts` → `engagement.alerts`
- `engagement/notification.repository.ts`: `notifications.notifications` → `engagement.notifications`; `notifications.preferences` → `engagement.preferences`

Delete `migrations-auth/` and `migrations-engagement/` folders after move.

### G.2 Collapse to one Knex per service

`core-service/src/config/database.ts`:
- Single `db` instance, `database: 'core_db'`
- `searchPath: ['auth','users','broker','portfolio','engagement','public']`
- `migrations.directory: './migrations'`, `schemaName: 'core'`
- `initDatabase()` creates schemas: `auth`, `users`, `broker`, `portfolio`, `engagement`, `core`, then `migrate.latest()`
- Remove `authDb` and `engagementDb` exports

`core-service/src/server.ts`: one `await initDatabase()` only.

`insights-service/src/config/database.ts`: `database: 'insights_db'`, `searchPath: ['market','recommendations','public']` (already correct).

### G.3 K8s
- `k8s/base/services/core-service/configmap.yaml`: `DB_NAME: core_db` (drop `AUTH_DB_NAME`, `ENGAGEMENT_DB_NAME`)
- `k8s/base/services/insights-service/configmap.yaml`: `DB_NAME: insights_db`

### G.4 Cutover (one-shot)

```bash
kubectl exec -n database deploy/postgres -- psql -U admin -d postgres \
  -c "DROP DATABASE IF EXISTS auth_db; DROP DATABASE IF EXISTS trading_db; DROP DATABASE IF EXISTS engagement_db; DROP DATABASE IF EXISTS market_db;"
kubectl rollout restart deploy/core-service deploy/insights-service
```

**Verify:**
- `\l` shows only `core_db`, `insights_db`, `postgres`, system DBs
- `\dn` in `core_db` shows `auth, users, broker, portfolio, engagement, core, public`
- End-to-end: register → login → connect Upstox → set alert → place paper order → see notification

---

## Final state

| Component | Count | Was |
|---|---|---|
| Backend deployments | 3 | 5 |
| Databases | 2 | 4 |
| Redis pub/sub channels | 0 | 5 |
| Background workers/schedulers | 0 | 3 |
| WebSocket servers | 0 | 2 |
| Frontend stores | 3 (auth, portfolio, order) | 5 |
| Frontend routes | 11 | 12 |

## Open questions / risks

1. **`signal-generator.service.ts` and `market-data.service.ts`** call back to trading for live quotes — need confirmation of import paths during F.
2. **`alert.repository.ts` query form** (string vs `withSchema`) — verify before G's schema rename.
3. **`VITE_WS_URL`** in any `.env` / `vite.config.ts` / overlay configmap — must remove in A.
4. **`Jenkinsfile`, `init.sh`, root scripts** — likely contain all 4 service names; sweep in F.
5. **Symbol master first boot** after G's wipe takes 30–60s — flag during cutover.

## Out of scope (confirmed)

ML model for recommendations (rule-engine only; ML stub future), tests, prod deploy strategy, multi-tenant/RBAC, real email/SMS, re-introducing real-time ticks.
