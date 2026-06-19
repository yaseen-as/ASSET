# CLAUDE.md — Project Guide

## Project Overview

**SwingTrade** — A full-stack asset management and trading platform for Indian equity markets (NSE/BSE). Monorepo with 3 backend services (api-gateway, core-service, insights-service), React frontend, PostgreSQL, Redis, and Kubernetes orchestration. Integrated with Upstox broker via OAuth 2.0 API.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS, Zustand, React Router v7, Chart.js/Recharts
- **Backend**: Node.js (>=18), Express 4, TypeScript 5.7 (strict), Knex.js 3.1 (query builder + migrations)
- **Database**: PostgreSQL 15 — two databases (`core_db`, `insights_db`) on a single DBMS, one schema per service (`core`, `insights`)
- **Cache**: Redis 7 — quote tick caching, symbol master caching (no pub/sub)
- **Validation**: Zod schemas in `@platform/shared`
- **Monorepo**: npm workspaces + Turborepo
- **Infra**: Kubernetes (Kustomize), k3d for dev, Jenkins CI/CD

## Repository Layout

```
/
├── packages/shared/         → @platform/shared (types, validators, constants, middleware, utils, errors)
├── services/
│   ├── api-gateway/         → Port 3000 — JWT auth, rate limiting, proxy routing
│   ├── core-service/        → Port 3001, schema: core
│   │                          (auth+OTP+JWT, profiles, Upstox OAuth, orders, holdings, watchlists,
│   │                           paper trading, alerts, in-app notifications)
│   └── insights-service/    → Port 3004, schema: insights
│                              (quotes/OHLCV/indicators + feature store + ML inference
│                               + ranking + backtest simulator + model registry).
│                              Ships two pods from one image:
│                                - HTTP pod (server.ts) handles requests.
│                                - Worker pod (worker.ts) runs feature
│                                  materialization, daily ranking, perf backfill,
│                                  and the backtest BullMQ consumer.
├── frontend/                → React SPA at port 5173 (Vite dev)
├── k8s/
│   ├── base/                → Shared K8s manifests (deployments, services, configmaps, secrets)
│   └── overlays/
│       ├── dev/             → k3d: 1 replica, hot-reload, hostPath mounts
│       └── prod/            → 2-3 replicas, resource limits, TLS, pre-built images
└── ml/                      → Python 3.11 offline ML training pipeline (LightGBM → ONNX).
                                Not a deployed service; runs locally or via Jenkins.
                                Produces ONNX artifacts uploaded into insights.model_registry.
```

## Commands

```bash
# Run individual services locally
npm run gateway          # api-gateway
npm run core             # core-service (auth + users + broker + portfolio + engagement)
npm run insights         # insights-service HTTP pod (market + features + recommendations + backtest API + model registry)
npm run insights-worker  # insights-service worker pod (feature materialization, daily ranking, perf backfill, backtest BullMQ consumer)
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

- **Two databases**: `core_db` (core-service) and `insights_db` (insights-service), both on one PostgreSQL host. One schema per service (`core` / `insights`). No cross-database joins.
- **Service-to-service calls**: Internal HTTP via Kubernetes DNS (`http://core-service`, `http://insights-service`). No API gateway prefix internally.
- **API Gateway proxying**: External calls go through gateway at port 3000. Path rewrite strips `/v1/<area>` prefix before forwarding.
- **Polling, not streaming**: Frontend polls REST endpoints with `usePolling` hook (visibility-gated `setInterval`). No WebSocket servers, no Redis pub/sub.
- **JWT auth**: API gateway validates Bearer tokens. Protected routes inject `x-user-id` header to downstream services. 24h access token, no refresh tokens.
- **Rate limiting**: Tiered — default 100/min, auth 50/min, orders 30/min.
- **Token encryption**: Broker credentials (access_token, client_id) encrypted with AES-256 before DB storage.

## Service Communication

| From | To | Method | URL Pattern |
|------|----|--------|-------------|
| API Gateway | core-service / insights-service | HTTP Proxy | Strips `/v1/<area>` prefix |
| insights-service (recommendations / backtest) | insights-service (market / features) | Direct call | In-process — no HTTP |
| insights-service (HTTP pod) | insights-service (worker pod) | Redis (BullMQ) | Backtest jobs only; consumer lives in worker pod |
| insights-service (market) | core-service (broker) | HTTP | `http://core-service/market/quote/:exchange/:symbol` (Upstox bridge) |
| core-service (portfolio) | core-service (broker) | Direct call | In-process — no HTTP |
| core-service (portfolio/paper) | insights-service | HTTP | `http://insights-service/quote/:exchange/:symbol` |
| core-service (broker) | core-service (users.profile) | Direct call | In-process — no HTTP |

**Important**: Internal service-to-service calls do NOT use the `/v1/<area>` prefix. That prefix is only for external requests through the API gateway.

## API Gateway Routing

| External path | Upstream | Path rewrite |
|---|---|---|
| `/v1/auth/*` | core-service | strip `/v1/auth` |
| `/v1/users/*` | core-service | strip `/v1/users` |
| `/v1/broker/*` | core-service | strip `/v1/broker` |
| `/v1/portfolio/*` | core-service | rewrite to `/portfolio/*` |
| `/v1/alerts/*` | core-service | rewrite to `/alerts/*` |
| `/v1/notifications/*` | core-service | rewrite to `/notifications/*` |
| `/v1/market/*` | insights-service | strip `/v1/market` |
| `/v1/features/*` | insights-service | rewrite to `/features/*` |
| `/v1/recommendations/*` | insights-service | rewrite to `/recommendations/*` |
| `/v1/models/*` | insights-service | rewrite to `/models/*` |
| `/v1/backtest/*` | insights-service | rewrite to `/backtest/*` |

## Shared Package (@platform/shared)

All cross-service code lives in `packages/shared/`. Services import as `@platform/shared`.

- **Types**: `src/types/*.types.ts` — auth, user, broker, market, portfolio, alert, recommendation, notification, common
- **Validators**: `src/validators/schemas.ts` — Zod schemas for all request DTOs
- **Constants**: `src/constants/` — exchanges (NSE/BSE), intervals (1m-1w), indicators (SMA, EMA, RSI, MACD)
- **Errors**: `src/errors/app-error.ts` — `AppError` class
- **Utils**: `src/utils/logger.ts` — `createLogger(serviceName)` factory (winston)
- **Middleware**: `src/middleware/` — `requestLogger`, `correlationIdMiddleware`, `errorHandler`, `helmetMiddleware`, `corsMiddleware`

When adding a new DTO, type, or shared middleware, add it here and re-export from `index.ts`.

## Database Conventions

- **Two databases**: `core_db` and `insights_db`. Each service's `database.ts` has `ensureDatabase()` that auto-creates the database on first startup (connects to `postgres` default DB, runs `CREATE DATABASE`, then reconnects). Requires PG user to have `CREATEDB` privilege.
- **Migrations**: Knex.js, located at `services/<name>/migrations/`. Auto-run on service startup.
- **knex_migrations table**: Lives in the service's schema (`core` for core-service, `insights` for insights-service).
- **Single schema per service**: every table lives in one schema — `core.*` (core-service) or `insights.*` (insights-service), e.g. `core.connections`, `insights.ohlcv_daily`. Always qualify table names with the schema.
- **Naming**: snake_case for columns. Timestamps: `created_at`, `updated_at`. UUIDs for primary keys.
- **Repository pattern**: Each domain has a `*.repository.ts` with typed query methods.

| Service | Database | Schema |
|---------|----------|--------|
| core-service | core_db | core |
| insights-service | insights_db | insights |

## ML Training Pipeline (`ml/`)

Python 3.11 offline pipeline that produces the ONNX models served by insights-service. **Not a deployed service** — runs locally or as a Jenkins job, never inside the Node services.

### Layout

```
ml/
├── pyproject.toml          → Python dependencies (pandas, lightgbm, onnx, yfinance, pyarrow, sqlalchemy)
├── .env                    → DB creds for the pipeline (separate from services/*/.env)
├── pipelines/
│   ├── common/             → Shared helpers: db.py, walk_forward.py, registry.py, ingest.py (yfinance loader)
│   ├── technical/          → v1 model: 16 TA features → LightGBM → ONNX
│   ├── technical_v2/       → v2 model: 23 features (cross-sectional ranks, Bollinger, drawdown), rank-based labels
│   ├── fundamental/        → P/E, EPS growth, ROE features. Dormant — source table empty in this repo.
│   ├── sentiment/          → VADER lexicon scoring of headlines. No training step.
│   └── meta/               → Stacked model: combines tech + fund + sent scores. Trains last.
└── artifacts/              → Parquet files + .onnx + .meta.json (gitignored)
```

### Pipeline stages

Each model follows: **ingest → extract → transform → labels → train → evaluate → export_onnx → registry**.

```bash
cd ml
python3.11 -m venv .venv && .venv/bin/pip install -e .
.venv/bin/python -m pipelines.common.ingest --symbols ... --start ... --end ...    # yfinance → insights.ohlcv_daily
.venv/bin/python -m pipelines.technical.extract --start ... --end ...
.venv/bin/python -m pipelines.technical.transform
.venv/bin/python -m pipelines.technical.labels
.venv/bin/python -m pipelines.technical.train       # ← LightGBM fit
.venv/bin/python -m pipelines.technical.evaluate    # ← held-out test metrics
.venv/bin/python -m pipelines.technical.export_onnx # ← LightGBM → ONNX, parity-check vs booster
.venv/bin/python -m pipelines.common.registry --name technical --version YYYY.MM.DD --feature-set technical_v1 \
  --onnx artifacts/technical_model.onnx --meta artifacts/technical_model.meta.json --eval artifacts/technical_model.eval.json
```

### Hand-off between Python and Node

- ONNX bytes get inserted into `insights.model_artifacts` (BYTEA) with metadata in `insights.model_registry`, `status='draft'`.
- Insights-service `OnnxLoaderService` reads bytes from BYTEA (or `file://` URIs), creates an `ort.InferenceSession`, LRU-caches it.
- `POST /v1/models/:id/promote` flips status to `production` and evicts the cache so new bytes load.
- **Feature contract:** `training_data.feature_cols` on the registry row is the source of truth for input column order. The Node `technical-builder.ts` MUST produce identical column names and order — drift between Python `FEATURE_COLS` and the Node feature builder silently breaks inference.

### Common Python pipeline gotchas

- All pipeline commands must be run from `ml/` (or with `ml/` on `PYTHONPATH`) so `python -m pipelines.X.Y` resolves the package.
- `pyproject.toml` requires Python 3.11. A 3.10 venv silently fails on type-annotation features.
- `pyarrow` is required for parquet I/O — pandas doesn't bundle it. Declared in `pyproject.toml`.
- Walk-forward split is anchored on `df["date"].max().date()` by default. Drop `--reference` to override; the val/test windows are short (months, not years) so a small universe produces tiny test splits and noisy metrics.

## Key Config / Environment Variables

Each service reads from `.env` locally or ConfigMap/Secret in K8s.

- `UPSTOX_CLIENT_ID` — Upstox OAuth app client ID (required, secret)
- `UPSTOX_CLIENT_SECRET` — Upstox OAuth app client secret (required, secret)
- `UPSTOX_REDIRECT_URI` — OAuth callback URL (default: `http://localhost:3000/v1/broker/callback/upstox`)
- `BROKER_TOKEN_ENCRYPTION_KEY` — 32-byte hex for AES encryption of broker tokens (core-service)
- `JWT_SECRET` — Secret for signing JWTs (must match between core-service and api-gateway)
- `REDIS_URL` — Redis connection string
- `DB_HOST/PORT/NAME/USER/PASSWORD` — PostgreSQL connection
- `CORE_SERVICE_URL` — Used by api-gateway and insights-service to reach core-service
- `INSIGHTS_SERVICE_URL` — Used by api-gateway and core-service to reach insights-service
- `MATERIALIZATION_HOUR`, `MATERIALIZATION_CRON_ENABLED` — Feature store materialization (insights-worker pod only)
- `DEFAULT_MODEL_NAME`, `MODEL_CACHE_SIZE` — ONNX inference (LRU cache size for loaded models)
- `DAILY_RANKING_CRON_ENABLED`, `PERFORMANCE_BACKFILL_CRON_ENABLED` — ML cron toggles (worker pod only)
- `BACKTEST_QUEUE_NAME`, `BACKTEST_CONCURRENCY` — BullMQ queue name + worker concurrency

## Upstox API Integration

- **OAuth flow**: User visits authorization URL → logs in on Upstox → redirected to `/v1/broker/callback/upstox?code=...&state=userId` → backend exchanges code for access_token → stored encrypted in DB
- **Auth service**: `services/core-service/src/broker/upstox-auth.service.ts`
- **API client**: `services/core-service/src/broker/upstox.client.ts` — all methods take `accessToken` param, token is always fetched from DB at call time (never from env)
- **Instrument master**: CSV download from Upstox public endpoint, stored in `core.symbol_master` table. Instrument key format: `NSE_EQ|{symbol}`.
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
- Error handling: `AppError` (from `@platform/shared`) for cross-cutting; `ServiceError` for broker-specific
- API response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- No test framework configured yet

## Common Gotchas

- **Local Postgres networking**: on machines also running k3d, the default `docker run -p 5432:5432 postgres:15` fails with `ECONNRESET` because k3d's iptables rules interfere with the docker bridge. Workaround: `docker run --network host postgres:15` instead of `-p` port mapping. Symptom: `psql` says "server closed the connection unexpectedly" even though `docker logs` shows Postgres healthy.
- **Local DB bootstrap**: [services/insights-service/src/scripts/init-local-db.ts](services/insights-service/src/scripts/init-local-db.ts) creates the database + schemas + runs migrations. Use it for fresh local setups: `DB_HOST=localhost DB_USER=postgres DB_PASSWORD=postgres DB_NAME=insights_db ../../node_modules/.bin/ts-node src/scripts/init-local-db.ts` from `services/insights-service/`. Requires Node 20 — older Node breaks on `??` operator in newer dependencies.
- Internal service-to-service URLs must NOT use the API gateway prefix (`/v1/...`). Use the direct route path.
- Instrument master must be synced before market quotes or order placement can work. Auto-syncs if stale (>24h) on core-service startup.
- Broker tokens (Upstox access_token) are AES-encrypted in the DB. Use `encrypt()`/`decrypt()` from `services/core-service/src/utils/encryption.ts`.
- Upstox tokens expire daily (end-of-trading-day). No refresh flow — user re-authorizes each trading day via OAuth.
- The `GET /v1/broker/callback/upstox` route is an OAuth redirect target — it receives `code` + `state` from Upstox, not from the frontend.
- `JWT_SECRET` must match between api-gateway and core-service (gateway verifies, core-service signs). Update both `k8s/base/services/api-gateway/configmap.yaml` and `k8s/base/services/core-service/secret.yaml` together.
- core-service domain layout: `src/auth/` (register/login/OTP/JWT), `src/users/` (profile), `src/broker/` (Upstox/orders/paper trading), `src/portfolio/` (holdings/watchlists), `src/engagement/` (alerts/notifications). All share one `db` Knex instance against `core_db`.
- insights-service domain layout: `src/market/` (quotes/OHLCV/indicators), `src/features/` (feature store + materialization), `src/recommendations/` (model registry, ONNX inference, scoring, ranking, model-promotion API, crons), `src/backtest/` (walk-forward simulator + BullMQ queue + worker). All share one `db` Knex instance against `insights_db`.
- **Two entrypoints, one image**: `src/server.ts` boots Express for HTTP traffic; `src/worker.ts` boots no HTTP, only the background jobs (feature materialization, daily ranking, performance backfill, backtest BullMQ consumer). Same image, different `command:`; deployed as separate `insights-service` and `insights-worker` Deployments.
- ML inference: `RegistryRepository` reads `insights.model_registry`; ONNX bytes are stored in `insights.model_artifacts` (BYTEA) and loaded by `OnnxLoaderService` with an LRU cache sized by `MODEL_CACHE_SIZE`. Promotion via `POST /v1/models/:id/promote` evicts the cache entry in-process.
- Feature → inference flow is **in-process**: `ScorerService` takes a `FeatureStoreRepository` (not an HTTP client). The pre-consolidation HTTP hop from `recommendation-service → feature-service` is gone.
- Backtest is BullMQ-shaped: HTTP `POST /v1/backtest/runs` inserts a row in `insights.backtest_results` and enqueues a job; the worker pod consumes it, runs `WalkForwardEngine`, and updates the same row. Frontend polls `GET /v1/backtest/runs/:id`.
- Frontend uses `usePolling` hook (visibility-gated): quotes 5s, notifications 30s, orders 30s (only when pending). No WebSocket clients.
- When deleting a service file, grep the entire service for imports of that file (`grep -r 'deleted-file-name'`) before removing it — missed imports won't surface until runtime (`Cannot find module`).
- The frontend at `localhost:5173` proxies API calls to `localhost:3000` (gateway). In K8s, ingress handles this.
- Logger usage: import `createLogger` from `@platform/shared` (factory) or `logger` from local `utils/logger.ts` (service-default instance). Both are fine; the local stub re-exports from shared.
