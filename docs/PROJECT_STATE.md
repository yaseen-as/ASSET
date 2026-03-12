# SwingTrade Platform - Project State

> Last updated: 2026-03-12

## Overview

SwingTrade is a full-stack **asset management and trading platform** built as a monorepo with 9 backend microservices, a React frontend, PostgreSQL, Redis, and Kubernetes orchestration. It targets Indian equity markets (NSE/BSE) with Angel One broker integration.

---

## Architecture

```
                         ┌──────────────────┐
                         │   React Frontend │
                         │  (Vite + Tailwind)│
                         └────────┬─────────┘
                                  │ /api/*
                         ┌────────▼─────────┐
                         │   NGINX Ingress   │
                         │ (path rewrite)    │
                         └────────┬─────────┘
                                  │ /v1/*
                         ┌────────▼─────────┐
                         │   API Gateway     │
                         │  (JWT, CORS,      │
                         │   rate-limit,     │
                         │   proxy)          │
                         └────────┬─────────┘
                                  │
        ┌─────────┬───────┬───────┼───────┬──────────┬──────────┬───────────┐
        ▼         ▼       ▼       ▼       ▼          ▼          ▼           ▼
   ┌─────────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────────┐┌──────────┐┌──────────┐
   │  Auth   ││ User ││Broker││Market││Port- ││  Alert   ││Notifica- ││Recommend-│
   │ :3001   ││:3002 ││:3003 ││ Data ││folio ││  :3007   ││  tion    ││  ation   │
   │         ││      ││      ││:3004 ││:3005 ││          ││  :3008   ││  :3006   │
   └────┬────┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘└────┬─────┘└────┬─────┘└────┬─────┘
        │        │       │       │       │         │           │           │
        └────────┴───────┴───────┼───────┴─────────┴───────────┴───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
               ┌────▼─────┐            ┌─────▼────┐
               │PostgreSQL │            │  Redis   │
               │  :5432    │            │  :6379   │
               │(9 schemas)│            │(cache,   │
               └───────────┘            │ pub/sub) │
                                        └──────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router |
| API Gateway | Express, http-proxy-middleware, JWT, ioredis |
| Backend Services | Express, TypeScript, Knex.js (query builder) |
| Database | PostgreSQL 15 (one DB, schema-per-service isolation) |
| Cache / Pub-Sub | Redis 7 (quotes cache, rate-limiting, real-time events) |
| Real-time | WebSocket (ws) for market ticks and notifications |
| Shared | @platform/shared (types, Zod validators, constants) |
| Orchestration | Kubernetes (k3d for dev, Kustomize base + overlays) |
| CI/CD | Jenkins (deployed in-cluster) |
| Container Registry | Docker Hub (`yaseenas/*`) |

---

## Services Summary

| Service | Port | DB Schema | Purpose |
|---------|------|-----------|---------|
| **api-gateway** | 3000 | — | JWT auth, CORS, rate-limiting, request proxying |
| **auth-service** | 3001 | `auth` | Register, login, OTP verification, token refresh |
| **user-service** | 3002 | `users` | User profiles and preferences |
| **broker-service** | 3003 | `broker` | Angel One broker connections, order placement |
| **market-data-service** | 3004 | `market` | Quotes, OHLCV history, technical indicators, WebSocket feed |
| **portfolio-service** | 3005 | `portfolio` | Holdings, watchlists, P&L calculations, broker sync |
| **recommendation-service** | 3006 | `recommendations` | Trading signals (BUY/SELL/HOLD), rule engine |
| **alert-service** | 3007 | `alerts` | Price/volume alerts with real-time evaluation via Redis pub/sub |
| **notification-service** | 3008 | `notifications` | In-app + email notifications, WebSocket push, preferences |

---

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | LoginPage | Email + password login |
| `/register` | RegisterPage | Name, email, phone, password registration |
| `/verify-otp` | VerifyOtpPage | 6-digit phone OTP verification |
| `/` | DashboardPage | Market indices, portfolio summary, top holdings |
| `/portfolio` | PortfolioPage | Full holdings list with broker sync |
| `/watchlist` | WatchlistPage | Add/remove stock symbols to watch |
| `/alerts` | AlertsPage | Create/manage price alerts (7 condition types) |
| `/recommendations` | RecommendationsPage | AI/rule-engine trading signals |
| `/broker` | BrokerPage | Connect/disconnect Angel One broker |
| `/settings` | SettingsPage | Profile display, notification preferences |

---

## What a User Sees After First Registration and Login

### Step 1: Registration (`/register`)
The user fills in:
- Full name
- Email address
- Phone number (Indian mobile)
- Password

On submit, the backend creates the user account and sends a 6-digit OTP to the phone number.

### Step 2: OTP Verification (`/verify-otp`)
The user enters the OTP. The phone is marked as verified. The user is redirected to the login page.

### Step 3: Login (`/login`)
The user logs in with email and password. The backend returns JWT access + refresh tokens. The app navigates to the dashboard.

### Step 4: Dashboard (`/`)
On first login, the dashboard shows:

```
┌─────────────────────────────────────────────────────┐
│                    SwingTrade                        │
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │  Market Indices (NIFTY 50, SENSEX, etc.) │
│          │  ┌────────┐ ┌────────┐ ┌────────┐        │
│ Dashboard│  │ NIFTY  │ │ SENSEX │ │ BANK   │        │
│ Portfolio│  │ 50     │ │        │ │ NIFTY  │        │
│ Watchlist│  └────────┘ └────────┘ └────────┘        │
│ Alerts   │                                          │
│ Signals  │  Portfolio Summary                       │
│ Broker   │  ┌────────┐ ┌────────┐ ┌──────┐ ┌─────┐ │
│ Settings │  │Value   │ │ P&L    │ │Hold- │ │Alert│ │
│          │  │ ₹0     │ │ ₹0     │ │ings:0│ │ s:0 │ │
│          │  └────────┘ └────────┘ └──────┘ └─────┘ │
│          │                                          │
│          │  Top Holdings                            │
│          │  "No holdings yet. Connect your broker   │
│ [Logout] │   to sync."                              │
└──────────┴──────────────────────────────────────────┘
```

**Everything is empty** because the user has no data yet. Here's the recommended first-time flow:

### Step 5: Connect Broker (`/broker`)
The user navigates to **Broker** and connects their Angel One account by entering:
- Client ID
- API Key
- Password
- TOTP (6-digit time-based code)

Once connected, the broker card appears with toggle/disconnect controls.

### Step 6: Sync Portfolio (`/portfolio`)
After broker connection, the user clicks **Sync from Broker** on the Portfolio page. This:
- Pulls all holdings from Angel One
- Stores them locally with current prices
- Calculates P&L for each holding

The dashboard now shows actual portfolio value, P&L, and holdings count.

### Step 7: Build Watchlist (`/watchlist`)
The user adds stock symbols (e.g., RELIANCE, INFY, TCS) to their watchlist to track prices.

### Step 8: Set Alerts (`/alerts`)
The user creates price alerts with conditions like:
- Price above ₹2,500
- Price crosses below ₹1,000
- Volume above 10,000,000
- % change above 5%

When conditions are met, the alert-service triggers and notification-service delivers the alert.

### Step 9: View Signals (`/recommendations`)
The recommendation engine shows BUY/SELL/HOLD signals with confidence scores (0-100%) and reasoning based on technical indicators (SMA, EMA, RSI, MACD).

### Step 10: Notification Preferences (`/settings`)
The user configures:
- Email alerts on/off
- Email recommendations on/off
- Email order executions on/off
- Push notifications on/off

---

## Kubernetes Environments

### Development (k3d + Kustomize)

```bash
# Create cluster
k3d cluster create --config k8s/k3d-dev-config.yaml

# Deploy
kubectl apply -k k8s/overlays/dev

# Access
echo "127.0.0.1 asset.dev.local" >> /etc/hosts
open http://asset.dev.local:8080
```

- 1 replica per service
- Hot-reload enabled (ts-node-dev for backend, Vite HMR for frontend)
- Source code mounted from host via k3d volume → hostPath
- Image: `node:20-alpine` (no pre-built images needed)
- Host: `asset.dev.local:8080`

### Production (Kustomize overlay)

```bash
kubectl apply -k k8s/overlays/prod
```

- 2 replicas per backend service, 3 for frontend
- Pre-built Docker images tagged `1.0.0`
- Resource limits (512Mi/500m per backend pod)
- TLS via cert-manager + LetsEncrypt
- Host: `asset.yourdomain.com`

---

## Database Schemas

Each service owns its own PostgreSQL schema:

| Schema | Tables | Key Columns |
|--------|--------|------------|
| `auth` | users, refresh_tokens, otp_codes | email, password_hash, phone, token_hash, otp code |
| `users` | profiles | user_id, display_name, timezone, preferences (JSONB) |
| `broker` | connections | user_id, broker_name, encrypted client_id/tokens, is_active |
| `market` | ohlcv_daily | symbol, exchange, date, OHLCV, volume |
| `portfolio` | portfolios, holdings, watchlists | user_id, symbol, quantity, avg_buy_price, symbols (JSONB) |
| `alerts` | alerts | user_id, symbol, condition_type, threshold, status, trigger_count |
| `notifications` | notifications, preferences | user_id, type, channel, title, body, is_read |
| `recommendations` | signals, user_recommendations | symbol, signal_type, confidence, source, reasoning |

---

## API Response Format

All services follow a consistent response pattern:

```json
{
  "success": true,
  "data": { ... },
  "message": "optional message"
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authorization header"
  }
}
```

---

## Real-time Features

| Feature | Transport | Channel |
|---------|-----------|---------|
| Market ticks | WebSocket (port 3014) | `market:tick:NSE:SYMBOL` (Redis pub/sub) |
| Alert triggers | Redis pub/sub → WebSocket (port 3018) | `alert:triggered` |
| Notifications | WebSocket (port 3018) | Direct push to connected clients |
| Order executions | Redis pub/sub → notification | `order:executed` |
| New recommendations | Redis pub/sub → notification | `recommendation:new` |

---

## Current Status

- All 9 backend services running in k3d dev cluster
- Frontend accessible at `http://asset.dev.local:8080`
- PostgreSQL and Redis operational
- Database migrations auto-run on service startup
- Hot-reload working for all services
- Auth flow (register → OTP → login) functional
- Ingress routing with path rewrite operational
- Jenkins deployed (CI/CD pipeline not yet configured)
- Angel One broker integration code complete (requires real API credentials)
- Market data service has WebSocket infrastructure (needs real data feed)
- Recommendation rule engine ready (needs market data to generate signals)
