# CLAUDE.md — Project Guide

## Project Overview

**SwingTrade** — A full-stack asset management and trading platform for Indian equity markets (NSE/BSE). Monorepo with 6 microservices, React frontend, PostgreSQL, Redis, and Kubernetes orchestration. Integrated with Angel One broker via SmartAPI.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS, Zustand, React Router v7, Chart.js/Recharts
- **Backend**: Node.js (>=18), Express 4, TypeScript 5.7 (strict), Knex.js 3.1 (query builder + migrations)
- **Database**: PostgreSQL 15 — single DB, schema-per-service isolation (auth, users, broker, portfolio, market, alerts, recommendations, notifications)
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
│   ├── trading-service/     → Port 3003, schemas: broker + portfolio — Angel One SmartAPI, orders, holdings, watchlists, paper trading
│   ├── market-data-service/ → Port 3004/3014(WS), schema: market — quotes, OHLCV, indicators
│   ├── recommendation-service/ → Port 3006, schema: recommendations — rule-engine signals
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
npm run market           # market-data-service
npm run recommendation   # recommendation-service
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

- **Schema-per-service**: Each service owns its PostgreSQL schema. No cross-schema joins or foreign keys.
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
| market-data-service | trading-service | HTTP | `http://trading-service/market/quote/:exchange/:symbol` |
| portfolio domain (trading) | broker domain (trading) | Direct call | In-process function call — no HTTP |
| portfolio domain (trading) | market-data-service | HTTP | `http://market-data-service/quote/:exchange/:symbol` |
| Any service | Redis | Pub/Sub | `market:tick:*`, `alert:triggered`, etc. |

**Important**: Internal service-to-service calls do NOT use the `/v1/<service>` prefix. That prefix is only for external requests through the API gateway.

## Shared Package (@platform/shared)

All DTOs, types, and validation schemas live in `packages/shared/`. Services import them as `@platform/shared`.

- **Types**: `src/types/*.types.ts` — auth, user, broker, market, portfolio, alert, recommendation, notification, common
- **Validators**: `src/validators/schemas.ts` — Zod schemas for all request DTOs
- **Constants**: `src/constants/` — exchanges (NSE/BSE), intervals (1m-1w), indicators (SMA, EMA, RSI, MACD)

When adding a new DTO or type, add it to the shared package and re-export from `index.ts`.

## Database Conventions

- **Migrations**: Knex.js, located at `services/<name>/migrations/`. Auto-run on service startup.
- **Schema prefix**: All tables are qualified with schema name (e.g., `broker.connections`, `market.ohlcv_daily`).
- **Naming**: snake_case for columns. Timestamps: `created_at`, `updated_at`. UUIDs for primary keys.
- **Repository pattern**: Each service has `src/repositories/` with typed query methods.

## Key Config / Environment Variables

Each service reads from `.env` locally or ConfigMap/Secret in K8s.

- `ANGEL_ONE_API_KEY` — SmartAPI key (required, secret)
- `ANGEL_ONE_API_URL` — Base URL without `/rest` suffix (default: `https://apiconnect.angelone.in`)
- `ANGEL_ONE_SCRIP_MASTER_URL` — Symbol master JSON (default: `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`)
- `BROKER_TOKEN_ENCRYPTION_KEY` — 32-byte hex for AES encryption of broker tokens
- `JWT_SECRET` — Secret for signing JWTs (auth-service + api-gateway)
- `REDIS_URL` — Redis connection string
- `DB_HOST/PORT/NAME/USER/PASSWORD` — PostgreSQL connection

## Angel One SmartAPI Integration

- **Client**: `services/trading-service/src/broker/angelone.client.ts`
- **Auth flow**: `POST /rest/auth/angelbroking/user/v1/loginByPassword` with clientcode + password + TOTP
- **Market quotes**: `POST /rest/secure/angelbroking/market/v1/quote` with `exchangeTokens: { NSE: [token] }`
- **Symbol master**: Downloaded from ScripMaster JSON URL, stored in `broker.symbol_master` table
- **Token format**: Angel One uses numeric token IDs (e.g., "2885" for RELIANCE). Must map symbol name → token before any API call.
- **Session**: Access tokens expire in ~24h. Refresh via `/rest/auth/angelbroking/jwt/v1/generateTokens`.

## Code Style

- TypeScript strict mode across all packages
- Express handlers follow: controller → service → repository
- Error handling: `ServiceError` class with `code`, `statusCode`, `message`
- API response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- No test framework configured yet

## Common Gotchas

- The `apiUrl` config for Angel One should NOT include `/rest` — the client code appends `/rest/...` to all endpoints.
- Internal service-to-service URLs must NOT use the API gateway prefix (`/v1/broker/...`). Use the direct route path.
- Symbol master must be synced before market quotes or order placement can work. Auto-syncs on trading-service startup if stale.
- Broker credentials are AES-encrypted in the DB. Use `encrypt()`/`decrypt()` from `services/trading-service/src/utils/encryption.ts`.
- `portfolio.service.ts` calls `brokerService.getConnections()` and `brokerService.getHoldings()` directly (no HTTP). Market data still uses HTTP to `market-data-service`.
- trading-service domain layout: `src/broker/` owns broker/orders/paper-trading, `src/portfolio/` owns holdings/watchlists. Both are wired in `server.ts`.
- The frontend at `localhost:5173` proxies API calls to `localhost:3000` (gateway). In K8s, ingress handles this.
