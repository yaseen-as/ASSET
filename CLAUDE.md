# CLAUDE.md — Project Guide

## Project Overview

**SwingTrade** — A full-stack asset management and trading platform for Indian equity markets (NSE/BSE). Monorepo with 5 microservices, React frontend, PostgreSQL, Redis, and Kubernetes orchestration. Integrated with Upstox broker via OAuth 2.0 API.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS, Zustand, React Router v7, Chart.js/Recharts
- **Backend**: Node.js (>=18), Express 4, TypeScript 5.7 (strict), Knex.js 3.1 (query builder + migrations)
- **Database**: PostgreSQL 15 — database-per-service (auth_db, trading_db, market_db, engagement_db) on a single DBMS, with schema isolation within each database
- **Cache/Pubsub**: Redis 7 — tick caching, symbol caching, pub/sub events
- **Validation**: Zod schemas in `@platform/shared`
- **Monorepo**: npm workspaces + Turborepo
- **Infra**: Kubernetes (Kustomize), k3d for dev, Jenkins CI/CD

## Repository Layout

```
/
├── packages/shared/         → @platform/shared (types, validators, constants)
├── services/
│   ├── api-gateway/         → Port 3000 — JWT auth, rate limiting, proxy routing
│   ├── auth-service/        → Port 3001, schemas: auth + users — register, OTP, JWT, profiles, preferences
│   ├── trading-service/     → Port 3003, schemas: broker + portfolio — Upstox OAuth, orders, holdings, watchlists, paper trading
│   ├── market-service/      → Port 3004/3014(WS), schemas: market + recommendations — quotes, OHLCV, indicators, signals, scheduled signal generation
│   └── engagement-service/  → Port 3007/3018(WS), schemas: alerts + notifications — alerts, evaluation, notifications, WebSocket push
├── frontend/                → React SPA at port 5173 (Vite dev)
├── k8s/
│   ├── base/                → Shared K8s manifests (deployments, services, configmaps, secrets)
│   └── overlays/
│       ├── dev/             → k3d: 1 replica, hot-reload, hostPath mounts
│       └── prod/            → 2-3 replicas, resource limits, TLS, pre-built images
└── docs/                    → SERVICES.md, FEATURES.md, PHASE1_PLAN.md, PHASE3_PLAN.md, srs.md
```

## Commands

```bash
# Run individual services locally
npm run gateway          # api-gateway
npm run auth             # auth-service (includes user profiles)
npm run trading          # trading-service (broker + portfolio merged)
npm run market           # market-service (market data + recommendations merged)
npm run engagement       # engagement-service (alerts + notifications)
npm run web              # frontend (Vite)

# Monorepo-wide
npm run build            # turbo run build (all)
npm run dev              # turbo run dev (all)
npm run lint             # turbo run lint
npm run test             # turbo run test

# Database migrations (per service)
cd services/<service-name>
npx knex migrate:latest
npx knex migrate:rollback
npx knex migrate:make <name>

# Kubernetes (dev)
kustomize build k8s/overlays/dev | kubectl apply -f -
# or
kubectl apply -k k8s/overlays/dev
```

## Architecture Patterns

- **Database-per-service**: Each service owns its own PostgreSQL database (auth_db, trading_db, market_db, engagement_db) within a single DBMS. Schema isolation within each database (e.g., trading_db has `broker` + `portfolio` schemas). No cross-database or cross-schema joins.
- **Service-to-service calls**: Internal HTTP via Kubernetes DNS (`http://broker-service:3003`). No API gateway prefix internally.
- **API Gateway proxying**: External calls go through gateway at port 3000. Path rewrite strips `/v1/<service>` prefix before forwarding.
- **Event-driven**: Redis pub/sub channels: `market:tick:*`, `alert:triggered`, `recommendation:new`, `order:executed`.
- **JWT auth**: API gateway validates Bearer tokens. Protected routes inject `x-user-id` header to downstream services.
- **Rate limiting**: Tiered — default 100/min, auth 50/min, orders 30/min.
- **Token encryption**: Broker credentials (access_token, refresh_token, client_id) encrypted with AES before DB storage.

## Service Communication

| From | To | Method | URL Pattern |
|------|----|--------|-------------|
| API Gateway | Any service | HTTP Proxy | Strips `/v1/<name>` prefix |
| market-service | trading-service | HTTP | `http://trading-service/market/quote/:exchange/:symbol` |
| recommendations domain (market) | market domain (market) | Direct call | In-process function call — no HTTP |
| portfolio domain (trading) | broker domain (trading) | Direct call | In-process function call — no HTTP |
| portfolio domain (trading) | market-service | HTTP | `http://market-service/quote/:exchange/:symbol` |
| Any service | Redis | Pub/Sub | `market:tick:*`, `alert:triggered`, etc. |

**Important**: Internal service-to-service calls do NOT use the `/v1/<service>` prefix. That prefix is only for external requests through the API gateway.

## Shared Package (@platform/shared)

All DTOs, types, and validation schemas live in `packages/shared/`. Services import them as `@platform/shared`.

- **Types**: `src/types/*.types.ts` — auth, user, broker, market, portfolio, alert, recommendation, notification, common
- **Validators**: `src/validators/schemas.ts` — Zod schemas for all request DTOs
- **Constants**: `src/constants/` — exchanges (NSE/BSE), intervals (1m-1w), indicators (SMA, EMA, RSI, MACD)

When adding a new DTO or type, add it to the shared package and re-export from `index.ts`.

## Database Conventions

- **Database-per-service**: auth_db, trading_db, market_db, engagement_db — all on one PostgreSQL host. Each `database.ts` has `ensureDatabase()` that auto-creates the database on first startup (connects to `postgres` default DB, runs `CREATE DATABASE`, then reconnects). Requires PG user to have `CREATEDB` privilege.
- **Migrations**: Knex.js, located at `services/<name>/migrations/`. Auto-run on service startup.
- **Schema prefix**: All tables are qualified with schema name (e.g., `broker.connections`, `market.ohlcv_daily`).
- **Naming**: snake_case for columns. Timestamps: `created_at`, `updated_at`. UUIDs for primary keys.
- **Repository pattern**: Each service has `src/repositories/` with typed query methods.

| Service | Database | Schemas |
|---------|----------|---------|
| auth-service | auth_db | auth, users |
| trading-service | trading_db | broker, portfolio |
| market-service | market_db | market, recommendations |
| engagement-service | engagement_db | alerts, notifications |

## Key Config / Environment Variables

Each service reads from `.env` locally or ConfigMap/Secret in K8s.

- `UPSTOX_CLIENT_ID` — Upstox OAuth app client ID (required, secret)
- `UPSTOX_CLIENT_SECRET` — Upstox OAuth app client secret (required, secret)
- `UPSTOX_REDIRECT_URI` — OAuth callback URL (default: `http://localhost:3000/v1/broker/callback/upstox`)
- `BROKER_TOKEN_ENCRYPTION_KEY` — 32-byte hex for AES encryption of broker tokens
- `JWT_SECRET` — Secret for signing JWTs (auth-service + api-gateway)
- `REDIS_URL` — Redis connection string
- `DB_HOST/PORT/NAME/USER/PASSWORD` — PostgreSQL connection (DB_NAME differs per service)

## Upstox API Integration

- **OAuth flow**: User visits authorization URL → logs in on Upstox → redirected to `/v1/broker/callback/upstox?code=...&state=userId` → backend exchanges code for access_token → stored encrypted in DB
- **Auth service**: `services/trading-service/src/broker/upstox-auth.service.ts`
- **API client**: `services/trading-service/src/broker/upstox.client.ts` — all methods take `accessToken` param, token is always fetched from DB at call time (never from env)
- **Instrument master**: CSV download from Upstox public endpoint, stored in `broker.symbol_master` table. Instrument key format: `NSE_EQ|{symbol}`.
- **Session**: Access tokens are daily — expire end-of-trading-day. No silent refresh; user re-authorizes each day.
- **Onboarding**: After registration, user must connect broker before accessing trading features. Frontend checks `GET /v1/broker/status`.

## Frontend Sync Rule

**Always update the frontend when making backend changes.** Any time you add, modify, or remove API routes, request/response shapes, authentication flows, or service behavior, also update the corresponding frontend code in `frontend/src/`. This includes:
- API call sites in feature pages and stores
- TypeScript interfaces that mirror backend response shapes
- UI flows that reflect new or changed endpoint behavior (e.g. OAuth redirects, new form fields, removed form fields)
- New routes in `App.tsx` if a backend redirect target is added

Do not consider a backend task complete until the frontend reflects the change.

## Code Style

- TypeScript strict mode across all packages
- Express handlers follow: controller → service → repository
- Error handling: `ServiceError` class with `code`, `statusCode`, `message`
- API response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- No test framework configured yet

## Common Gotchas

- Internal service-to-service URLs must NOT use the API gateway prefix (`/v1/broker/...`). Use the direct route path.
- Instrument master must be synced before market quotes or order placement can work. Auto-syncs if stale when a symbol lookup misses.
- Broker tokens (Upstox access_token) are AES-encrypted in the DB. Use `encrypt()`/`decrypt()` from `services/trading-service/src/utils/encryption.ts`.
- Upstox tokens expire daily (end-of-trading-day). No refresh flow — user re-authorizes each trading day via OAuth.
- The `GET /v1/broker/callback/upstox` route is an OAuth redirect target — it receives `code` + `state` from Upstox, not from the frontend.
- `portfolio.service.ts` calls `brokerService.getConnections()` and `brokerService.getHoldings()` directly (no HTTP). Market data uses HTTP to `market-service`.
- trading-service domain layout: `src/broker/` owns broker/orders/paper-trading, `src/portfolio/` owns holdings/watchlists. Both wired via DI in `server.ts`.
- market-service domain layout: `src/market/` owns quotes/OHLCV/indicators/WebSocket, `src/recommendations/` owns signals/scheduling. `SignalGeneratorService` receives `MarketDataService` via constructor — no HTTP for historical data.
- Signal scheduler runs every 4 hours; on startup, skips if signals exist within last 20h.
- The frontend at `localhost:5173` proxies API calls to `localhost:3000` (gateway). In K8s, ingress handles this.
