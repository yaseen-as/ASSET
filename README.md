# Asset Management

Full-stack asset management and trading platform for Indian equity markets (NSE/BSE). Monorepo with three backend services, a React frontend, PostgreSQL, Redis, and an offline ML pipeline that powers swing-trade recommendations.

## Stack

- **Frontend** — React 19, TypeScript, Vite 6, Tailwind, Zustand, React Router v7
- **Backend** — Node.js (>=18), Express 4, TypeScript 5.7 strict, Knex.js 3.1
- **Database** — PostgreSQL 15 (two databases: `core_db`, `insights_db`)
- **Cache** — Redis 7 (quote ticks, symbol master, BullMQ for backtests)
- **ML pipeline** — Python 3.11, LightGBM, ONNX (offline training → ONNX runtime in Node)
- **Broker** — Upstox via OAuth 2.0
- **Infra** — Kubernetes (Kustomize), k3d for dev, Jenkins CI

## Repository layout

```
.
├── packages/shared/        # @platform/shared — types, Zod validators, middleware
├── services/
│   ├── api-gateway/        # Port 3000 — JWT auth, rate limiting, proxy
│   ├── core-service/       # Port 3001 — auth, users, broker, portfolio, alerts
│   └── insights-service/   # Port 3004 — market data, features, ML inference, backtest
├── frontend/               # React SPA (Vite, port 5173)
├── ml/                     # Python offline training pipeline (LightGBM → ONNX)
└── k8s/
    ├── base/               # Shared K8s manifests
    └── overlays/{dev,prod} # Environment-specific overlays
```

## Prerequisites

- Node.js >= 18 (Node 20 recommended)
- Python 3.11 (for the ML pipeline)
- Docker + k3d (for local Kubernetes)
- PostgreSQL 15 and Redis 7 (run via k3d or standalone Docker)

## Quickstart

```bash
# Install dependencies (npm workspaces)
npm install

# Run services individually
npm run gateway          # api-gateway        :3000
npm run core             # core-service       :3001
npm run insights         # insights-service   :3004 (HTTP)
npm run insights-worker  # insights-service worker pod (crons + BullMQ)
npm run web              # frontend           :5173

# Or run all in parallel via Turborepo
npm run dev
```

### Environment files

Each service reads `.env` locally (in `services/<name>/.env`) or `ConfigMap`/`Secret` in K8s. Examples are checked in as `.env.example`. Required keys are documented in [CLAUDE.md](CLAUDE.md#key-config--environment-variables).

### Database migrations

Migrations are auto-run on service startup. To run manually:

```bash
cd services/core-service && npx knex migrate:latest
cd services/insights-service && npx knex migrate:latest
```

## Services

| Service | Port | Database | Responsibilities |
|---|---|---|---|
| `api-gateway` | 3000 | — | JWT validation, rate limiting, proxying `/v1/<area>/*` to upstream services |
| `core-service` | 3001 | `core_db` (schemas: `auth`, `users`, `broker`, `portfolio`, `engagement`) | Auth + OTP + JWT, profiles, Upstox OAuth, orders, holdings, watchlists, paper trading, alerts |
| `insights-service` (HTTP) | 3004 | `insights_db` (schemas: `market`, `recommendations`) | Quotes, OHLCV history, indicators, ranked recommendations, backtest API, model registry |
| `insights-service` (worker) | — | `insights_db` | Feature materialization, daily ranking, performance backfill, backtest BullMQ consumer |

Both insights pods ship from the same image; the worker is started with `command: node dist/worker.js`.

## API gateway routing

External requests go through the gateway. Path prefixes are stripped or rewritten before forwarding:

| External path | Upstream | Rewrite |
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

Internal service-to-service calls do **not** use the `/v1/<area>` prefix — that's external-only.

## ML pipeline

Offline training lives in [ml/](ml/) (Python). Four model pipelines: `technical`, `fundamental`, `sentiment`, `meta`. Each follows: **extract → transform → labels → train → evaluate → export_onnx → register**.

```bash
cd ml
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e .

# DB env (or put in ml/.env)
export DB_HOST=... DB_NAME=insights_db DB_USER=... DB_PASSWORD=...

# Train the technical model end-to-end
python -m pipelines.common.ingest --symbols-file nifty200.txt \
  --start 2020-01-01 --end 2026-05-01            # backfill OHLCV via yfinance
python -m pipelines.technical.extract --start 2020-01-01 --end 2026-05-01
python -m pipelines.technical.transform
python -m pipelines.technical.labels
python -m pipelines.technical.train
python -m pipelines.technical.evaluate
python -m pipelines.technical.export_onnx
python -m pipelines.common.registry --name technical --version 2026.05.26 \
  --feature-set technical_v1 \
  --onnx artifacts/technical_model.onnx \
  --meta artifacts/technical_model.meta.json \
  --eval artifacts/technical_eval.json

# Promote the new model to production (evicts the inference LRU cache)
curl -X POST http://localhost:3000/v1/models/<id>/promote \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"status":"production","rollout_percent":100}'
```

ONNX bytes live in `recommendations.model_artifacts` (BYTEA). The insights-service loads them via `OnnxLoaderService` with an LRU cache sized by `MODEL_CACHE_SIZE`.

## Local Kubernetes (k3d)

```bash
# Build local images and apply the dev overlay
kustomize build k8s/overlays/dev | kubectl apply -f -
# Or
kubectl apply -k k8s/overlays/dev
```

The dev overlay uses 1 replica per service, hot-reload via `hostPath` mounts, and exposes the gateway on `localhost:8080` (via the k3d ingress on port 80).

## Key conventions

- **Two databases, one DBMS** — no cross-database joins; schema isolation within each DB.
- **Polling, not streaming** — frontend uses `usePolling` (visibility-gated `setInterval`). No WebSockets, no Redis pub/sub.
- **JWT auth** — gateway validates, injects `x-user-id` header downstream. 24h tokens, no refresh.
- **Broker tokens encrypted at rest** — AES-256 in `broker.connections.access_token`. Upstox tokens expire daily; the user re-authorizes each trading day.
- **API response shape** — `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- **Frontend ↔ backend sync** — any backend API change must be mirrored in the frontend the same PR.

## Further reading

- [CLAUDE.md](CLAUDE.md) — detailed project guide (gotchas, env vars, schema layout)
- [services/insights-service/src/recommendations/](services/insights-service/src/recommendations/) — model registry + ONNX inference flow
- [ml/pipelines/](ml/pipelines/) — training pipeline source
