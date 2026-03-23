# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swing Trade Asset & Recommendation Platform for NSE/BSE markets. A microservices monorepo with a React frontend and 8 Node.js backend services targeting Angel One brokerage integration.

## Commands

### Monorepo (run from root)
```bash
npm run build          # Build all packages/services via Turbo
npm run dev            # Start all services in dev mode (hot-reload)
npm run lint           # Lint all workspaces
npm run test           # Run all tests (no test infrastructure exists yet)

# Target a specific workspace
npm run dev --workspace=services/market-data-service
npm run build --workspace=packages/shared
```

### Individual Services (run from service directory)
```bash
npm run dev            # ts-node-dev with hot-reload
npm run build          # tsc compile to dist/
npm run start          # node dist/server.js (production)
```

### Frontend
```bash
cd frontend
npm run dev            # Vite dev server
npm run build          # Vite production build
npm run preview        # Preview production build
```

### Kubernetes (local dev with k3d)
```bash
./init.sh                              # Initialize k3d cluster
kubectl apply -k k8s/overlays/dev      # Apply dev overlay
kubectl apply -k k8s/overlays/prod     # Apply prod overlay
```

## Architecture

### Monorepo Structure
- **`packages/shared`** — TypeScript types, Zod validators, constants (exchanges, intervals, indicators). All services and frontend import from `@platform/shared`. Build this first when making type changes.
- **`services/`** — 9 independent microservices (Express + TypeScript + Knex)
- **`frontend/`** — React 19 + Vite + Zustand + Tailwind CSS
- **`k8s/`** — Kustomize base + overlays (dev/prod) with k3d for local cluster

### Service Ports
| Service | HTTP | WebSocket |
|---------|------|-----------|
| api-gateway | 3000 | — |
| auth-service | 3001 | — |
| user-service | 3002 | — |
| broker-service | 3003 | — |
| market-data-service | 3004 | 3014 |
| portfolio-service | 3005 | — |
| recommendation-service | 3006 | — |
| alert-service | 3007 | — |
| notification-service | 3008 | 3018 |

All traffic from the browser routes through the API Gateway (port 3000) via NGINX ingress. The gateway handles JWT auth, rate limiting (100/min default, 50/min auth, 30/min orders), and HTTP proxying to internal services.

### Backend Service Layout (consistent across all services)
```
src/
├── server.ts         # Port binding, DB migration on startup
├── app.ts            # Express middleware stack
├── config/           # knexfile.ts, database.ts, env vars
├── routes/           # Route definitions
├── controllers/      # HTTP handlers
├── services/         # Business logic
├── repositories/     # Knex data access layer
├── middleware/       # Custom Express middleware
├── utils/            # logger (Winston), hashing, JWT
├── types/            # Local interfaces
└── migrations/       # Knex migrations (auto-run on startup)
```

### Database Architecture
Single PostgreSQL instance with **schema-per-service isolation** — no cross-schema queries or joins. Each service runs its own Knex migrations on startup. Schemas: `auth`, `users`, `broker`, `market`, `portfolio`, `alerts`, `recommendations`, `notifications`.

### Real-time Architecture
Angel One WebSocket → `market-data-service` → **Redis pub/sub** (`market:tick:{exchange}:{symbol}`) → `alert-service` (real-time condition evaluation) + `notification-service` → **WebSocket push** to browser clients.

Other Redis channels: `alert:triggered`, `recommendation:new`, `order:executed`, `notification:push`.

### Auth Flow
Registration → OTP verification → JWT access token (15 min) + refresh token (7 days). Refresh tokens use **family-based rotation** — the entire token family is revoked on reuse detection. Broker credentials are AES-encrypted at rest.

### Standard API Response Format
```typescript
{ success: boolean, data?: T, error?: string, message?: string }
```

### Frontend State
Zustand stores per feature in `frontend/src/stores/`. Feature modules live in `frontend/src/features/{feature}/` with their own components, hooks, and API calls.

## Key Implementation Gaps (Phase 3 context)
These are stubs/placeholders — refer to `docs/PHASE3_PLAN.md` before touching:
- Angel One WebSocket feed ingestion (no live market data yet)
- Symbol token resolution from Angel One master data (required for order placement)
- OTP SMS delivery (console-logged only)
- Portfolio broker sync
- Signal generation scheduled worker
- Email delivery (dev logs only)
- Redis-backed distributed rate limiting (currently in-memory)

## Environment Setup
Copy `.env.example` to `.env` in the repo root and each service directory. Key vars: `DB_HOST`, `REDIS_HOST`, `JWT_SECRET`, `ENCRYPTION_KEY` (AES for broker creds), SMTP settings.
