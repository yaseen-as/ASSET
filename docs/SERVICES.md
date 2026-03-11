# Swing Trade Platform — Services Documentation

> Asset & Recommendation Platform for Indian Stock Markets (NSE/BSE) with Angel One broker integration.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [API Gateway](#1-api-gateway)
3. [Auth Service](#2-auth-service)
4. [User Service](#3-user-service)
5. [Broker Service](#4-broker-service)
6. [Market Data Service](#5-market-data-service)
7. [Portfolio Service](#6-portfolio-service)
8. [Recommendation Service](#7-recommendation-service)
9. [Alert Service](#8-alert-service)
10. [Notification Service](#9-notification-service)
11. [Shared Package](#10-shared-package)
12. [Data Flows](#data-flows)
13. [Redis Pub/Sub Channels](#redis-pubsub-channels)
14. [Database Schemas](#database-schemas)
15. [Environment Variables](#environment-variables)

---

## System Architecture

```
Browser / Mobile Client
        │
        ▼
┌───────────────┐   HTTP/WebSocket
│  Nginx Ingress│ ◄─────────────────────────
│  (port 80)    │
└──────┬────────┘
       │ rewrites /api/* → /*
       ▼
┌─────────────────────────────────┐
│          API Gateway            │  port 3000
│  - JWT verification             │
│  - Rate limiting                │
│  - CORS                         │
│  - Request logging              │
│  - Path rewrite + proxy         │
└────┬───┬───┬───┬───┬───┬───┬───┘
     │   │   │   │   │   │   │   │
     ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼
  Auth User Broker Market Portfolio Recommend Alert Notify
  3001 3002  3003  3004    3005      3006     3007  3008
                    │WS                              │WS
                   3014                            3018
                    │                                │
              ┌─────┴────────────────────────────────┤
              │              Redis                   │
              │    Pub/Sub + Cache                   │
              └──────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │          PostgreSQL            │
              │  (separate schema per service) │
              └───────────────────────────────┘
```

**Each service owns its own PostgreSQL schema** — no cross-schema joins, no shared tables.

| Service               | Port | Schema          | Redis |
|-----------------------|------|-----------------|-------|
| auth-service          | 3001 | `auth`          | ✓     |
| user-service          | 3002 | `users`         |       |
| broker-service        | 3003 | `broker`        |       |
| market-data-service   | 3004 | `market`        | ✓     |
| portfolio-service     | 3005 | `portfolio`     |       |
| recommendation-service| 3006 | `recommendations`|      |
| alert-service         | 3007 | `alerts`        | ✓     |
| notification-service  | 3008 | `notifications` | ✓     |

---

## 1. API Gateway

**Port:** `3000`
**Role:** Single entry point for all client traffic. Authenticates requests, rate-limits, and proxies to downstream services.

### Middleware Stack (applied in order)

```
Request
  → Helmet (security headers)
  → CORS (allowed: localhost:5173, asset.dev.local:8080)
  → Request Logger
  → Correlation ID injector (x-correlation-id header)
  → Rate Limiter
  → JWT Auth Middleware
  → Proxy Router
```

### JWT Auth Middleware

Verifies `Authorization: Bearer <token>` on every request **except** public routes:

| Method | Path                    |
|--------|-------------------------|
| POST   | /v1/auth/register       |
| POST   | /v1/auth/login          |
| POST   | /v1/auth/verify-otp     |
| POST   | /v1/auth/refresh        |
| GET    | /health                 |

On success, injects into the proxied request:
- `x-user-id` — authenticated user's UUID
- `x-user-email` — user's email
- `x-correlation-id` — request trace ID

### Rate Limits

| Tier     | Routes              | Limit          |
|----------|---------------------|----------------|
| Default  | all routes          | 100 req/min    |
| Auth     | /v1/auth/*          | 50 req/min     |
| Orders   | /v1/broker/orders   | 30 req/min     |

### Proxy Route Table

After the ingress strips `/api`, the gateway receives `/v1/...` and rewrites before forwarding:

| Gateway Path         | Forwarded To              | Stripped Prefix   |
|----------------------|---------------------------|-------------------|
| `/v1/auth/*`         | auth-service:80           | `/v1/auth`        |
| `/v1/users/*`        | user-service:80           | `/v1/users`       |
| `/v1/broker/orders`  | broker-service:80         | `/v1/broker`      |
| `/v1/broker/*`       | broker-service:80         | `/v1/broker`      |
| `/v1/market/*`       | market-data-service:80    | `/v1/market`      |
| `/v1/portfolio/*`    | portfolio-service:80      | `/v1/portfolio`   |
| `/v1/recommendations/*` | recommendation-service:80 | `/v1/recommendations` |
| `/v1/alerts/*`       | alert-service:80          | `/v1/alerts`      |
| `/v1/notifications/*`| notification-service:80   | `/v1/notifications` |

**Example full path:**
```
Browser → POST http://asset.dev.local:8080/api/v1/auth/login
Ingress  → strips /api → /v1/auth/login
Gateway  → matches /v1/auth → strips → /login
Auth-Svc → POST /login
```

---

## 2. Auth Service

**Port:** `3001`
**Schema:** `auth`
**Role:** User registration, phone verification, JWT issuance, token rotation.

### Routes

| Method | Path           | Auth | Description                          |
|--------|----------------|------|--------------------------------------|
| POST   | /register      | No   | Create account, send OTP to phone    |
| POST   | /verify-otp    | No   | Confirm phone with 6-digit code      |
| POST   | /login         | No   | Authenticate, receive tokens         |
| POST   | /refresh       | No   | Exchange refresh token for new pair  |
| POST   | /logout        | Yes  | Revoke refresh token                 |
| GET    | /health        | No   | Health check                         |

### Registration Flow

```
POST /register { email, password, phone }
  1. Validate: email format, password strength*, phone format (+91XXXXXXXXXX)
  2. Hash password (bcrypt, 10 rounds)
  3. Insert into users table
  4. Generate 6-digit OTP, store in otp_codes (expires 10 min)
  5. Send OTP via SMS (currently mocked — OTP is logged to console)
  ← 201 { userId, phone }
```

*Password rules: min 8 chars, uppercase, lowercase, number, special character.

### Login Flow

```
POST /login { email, password }
  1. Find user by email
  2. Verify password with bcrypt
  3. Check phone_verified = true
  4. Generate JWT access token (15 min expiry)
  5. Generate refresh token → hash → store with family_id
  ← 200 { accessToken, refreshToken, expiresIn: 900 }
```

### Token Rotation & Security

Refresh tokens use a **family-based rotation** system to detect reuse attacks:

```
Every refresh:
  1. Receive refreshToken
  2. Hash it, find in DB
  3. Check NOT revoked and NOT expired
  4. Revoke the current token
  5. Issue new access + refresh token with SAME family_id
  6. If token already revoked → revoke entire family → user must re-login
```

### Database Tables

```sql
-- auth.users
id            UUID PRIMARY KEY
email         VARCHAR UNIQUE NOT NULL
password_hash VARCHAR NOT NULL
phone         VARCHAR(15) UNIQUE NOT NULL
phone_verified BOOLEAN DEFAULT false
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ

-- auth.refresh_tokens
id         UUID PRIMARY KEY
user_id    UUID REFERENCES users(id)
token_hash VARCHAR NOT NULL         -- SHA-256 of the raw token
family_id  UUID NOT NULL            -- Groups all rotations together
expires_at TIMESTAMPTZ NOT NULL
revoked    BOOLEAN DEFAULT false
created_at TIMESTAMPTZ

-- auth.otp_codes
id         UUID PRIMARY KEY
phone      VARCHAR NOT NULL
code       CHAR(6) NOT NULL
attempts   INT DEFAULT 0            -- Max 5
verified   BOOLEAN DEFAULT false
expires_at TIMESTAMPTZ NOT NULL     -- 10 minutes
created_at TIMESTAMPTZ
```

---

## 3. User Service

**Port:** `3002`
**Schema:** `users`
**Role:** User profile management.

### Routes

| Method | Path      | Auth | Description             |
|--------|-----------|------|-------------------------|
| GET    | /profile  | Yes  | Get (or auto-create) profile |
| PATCH  | /profile  | Yes  | Update profile fields   |
| GET    | /health   | No   | Health check            |

### Profile Auto-Creation

On `GET /profile`, if the user has no profile yet (new user), one is created automatically with defaults:
- `timezone`: Asia/Kolkata
- `preferences`: `{ theme: "dark", notificationEmail: true, notificationInApp: true }`

### Database Tables

```sql
-- users.profiles
user_id      UUID PRIMARY KEY     -- matches auth.users.id
display_name VARCHAR(100)
avatar_url   VARCHAR(500)
timezone     VARCHAR(50) DEFAULT 'Asia/Kolkata'
preferences  JSONB DEFAULT '{}'
created_at   TIMESTAMPTZ
updated_at   TIMESTAMPTZ
```

---

## 4. Broker Service

**Port:** `3003`
**Schema:** `broker`
**Role:** Connect to Angel One broker, place orders, fetch holdings.

### Routes

| Method | Path                              | Auth | Description                   |
|--------|-----------------------------------|------|-------------------------------|
| POST   | /connect                          | Yes  | Connect Angel One account     |
| DELETE | /disconnect/:connectionId         | Yes  | Remove broker connection      |
| GET    | /connections                      | Yes  | List connected brokers        |
| PATCH  | /connections/:connectionId/toggle | Yes  | Enable or disable connection  |
| POST   | /orders                           | Yes  | Place a trade order           |
| GET    | /holdings/:connectionId           | Yes  | Fetch holdings from broker    |
| GET    | /health                           | No   | Health check                  |

### Angel One Integration

```
POST /connect { clientId, password, totp }
  1. Call Angel One login API with credentials
  2. Receive access_token, refresh_token
  3. Encrypt tokens using AES before storing in DB
  ← Return connection details (no raw tokens exposed)

POST /orders { connectionId, symbol, exchange, action, quantity, orderType }
  1. Look up connection, decrypt stored token
  2. If token expired → auto-refresh using broker refresh_token
  3. Forward order to Angel One order API
  ← Return { orderId, status }

GET /holdings/:connectionId
  1. Decrypt access_token
  2. Call Angel One holdings API
  ← Return holdings array with current prices
```

### Security

Broker credentials (accessToken, refreshToken) are **encrypted with AES** before being stored. The encryption key comes from `BROKER_TOKEN_ENCRYPTION_KEY` env var.

### Database Tables

```sql
-- broker.connections
id            UUID PRIMARY KEY
user_id       UUID NOT NULL (indexed)
broker_name   VARCHAR DEFAULT 'angel_one'
client_id     VARCHAR NOT NULL (AES encrypted)
access_token  TEXT (AES encrypted)
refresh_token TEXT (AES encrypted)
token_expiry  TIMESTAMPTZ
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
```

### Order Types

| Type   | Description                     |
|--------|---------------------------------|
| MARKET | Execute at current market price |
| LIMIT  | Execute at specified price      |
| SL     | Stop-loss with limit price      |
| SL-M   | Stop-loss with market price     |

### Product Types

| Type     | Description                    |
|----------|--------------------------------|
| DELIVERY | CNC (hold overnight)           |
| INTRADAY | MIS (square off same day)      |

---

## 5. Market Data Service

**Port:** `3004` (REST) | `3014` (WebSocket)
**Schema:** `market`
**Role:** Historical OHLCV data, technical indicators, real-time price streaming.

### REST Routes

| Method | Path                             | Auth | Description                   |
|--------|----------------------------------|------|-------------------------------|
| GET    | /quote/:exchange/:symbol         | Yes  | Latest price quote            |
| GET    | /history/:exchange/:symbol       | Yes  | Historical OHLCV data         |
| GET    | /indicators/:exchange/:symbol    | Yes  | Technical indicator values    |
| GET    | /health                          | No   | Health check                  |

**Query Parameters:**

`GET /history/:exchange/:symbol`
- `interval` — `1m | 5m | 15m | 30m | 1h | 1d | 1w` (default: `1d`)
- `from` — start date `YYYY-MM-DD`
- `to` — end date `YYYY-MM-DD`

`GET /indicators/:exchange/:symbol`
- `indicators` — comma-separated list: `sma_20,ema_50,rsi_14,macd`
- `period` — lookback days (default: 200)

### Supported Technical Indicators

| Indicator | Description                        |
|-----------|------------------------------------|
| sma_20    | Simple Moving Average (20 period)  |
| sma_50    | Simple Moving Average (50 period)  |
| sma_200   | Simple Moving Average (200 period) |
| ema_20    | Exponential Moving Average (20)    |
| ema_50    | Exponential Moving Average (50)    |
| rsi_14    | Relative Strength Index (14)       |
| macd      | MACD line, signal, histogram       |

### WebSocket (port 3014)

**Connect:**
```
ws://market-data-service:3014/?userId=<uuid>
```

**Subscribe to symbols:**
```json
{ "action": "subscribe", "symbols": ["NSE:RELIANCE", "NSE:TCS"] }
```

**Unsubscribe:**
```json
{ "action": "unsubscribe", "symbols": ["NSE:RELIANCE"] }
```

**Incoming tick message:**
```json
{
  "type": "tick",
  "data": {
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "ltp": 2450.50,
    "change": 12.30,
    "changePercent": 0.50,
    "volume": 1204500,
    "timestamp": "2026-03-10T07:38:38.830Z"
  }
}
```

**Internal Data Flow:**
```
External feed → publishes to Redis channel market:tick:NSE:RELIANCE
Market-Data-Service subscribes to market:tick:* via Redis
  → broadcasts tick to all WebSocket clients subscribed to that symbol
```

### Database Tables

```sql
-- market.ohlcv_daily
symbol   VARCHAR NOT NULL
exchange VARCHAR NOT NULL           -- NSE or BSE
date     DATE NOT NULL
open     NUMERIC(12,4)
high     NUMERIC(12,4)
low      NUMERIC(12,4)
close    NUMERIC(12,4)
volume   BIGINT
PRIMARY KEY (symbol, exchange, date)
```

---

## 6. Portfolio Service

**Port:** `3005`
**Schema:** `portfolio`
**Role:** Manage user holdings and watchlists.

### Routes

| Method | Path              | Auth | Description                       |
|--------|-------------------|------|-----------------------------------|
| GET    | /holdings         | Yes  | Portfolio summary + P&L           |
| POST   | /sync             | Yes  | Sync holdings from broker         |
| GET    | /watchlists       | Yes  | List user's watchlists            |
| POST   | /watchlists       | Yes  | Create watchlist                  |
| PATCH  | /watchlists/:id   | Yes  | Update watchlist name/symbols     |
| DELETE | /watchlists/:id   | Yes  | Delete watchlist                  |
| GET    | /health           | No   | Health check                      |

### P&L Calculation

```
For each holding:
  pnl = (currentPrice - avgBuyPrice) × quantity
  pnlPercentage = ((currentPrice - avgBuyPrice) / avgBuyPrice) × 100

Portfolio summary:
  totalValue = Σ (currentPrice × quantity)
  totalPnl = Σ pnl
  pnlPercentage = (totalPnl / (totalValue - totalPnl)) × 100
```

### Database Tables

```sql
-- portfolio.portfolios
id         UUID PRIMARY KEY
user_id    UUID NOT NULL (indexed)
name       VARCHAR DEFAULT 'Default'
created_at TIMESTAMPTZ

-- portfolio.holdings
id              UUID PRIMARY KEY
portfolio_id    UUID REFERENCES portfolios(id)
user_id         UUID NOT NULL
symbol          VARCHAR NOT NULL
exchange        VARCHAR NOT NULL
quantity        INT NOT NULL
avg_buy_price   NUMERIC(12,4)
current_price   NUMERIC(12,4)
last_synced_at  TIMESTAMPTZ
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ

-- portfolio.watchlists
id         UUID PRIMARY KEY
user_id    UUID NOT NULL
name       VARCHAR NOT NULL (1-100 chars)
symbols    JSONB NOT NULL       -- [{symbol: "RELIANCE", exchange: "NSE"}, ...]
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

## 7. Recommendation Service

**Port:** `3006`
**Schema:** `recommendations`
**Role:** Generate and serve stock trading signals using three signal engines.

### Routes

| Method | Path            | Auth | Description                            |
|--------|-----------------|------|----------------------------------------|
| GET    | /               | Yes  | All signals (filterable)               |
| GET    | /personalized   | Yes  | Signals scored for the specific user   |
| GET    | /health         | No   | Health check                           |

**Query params for `GET /`:**
- `source` — `rule_engine | ml_model | sentiment`
- `minConfidence` — number 0-100
- `symbol` — filter by symbol
- `limit` — max results

### Signal Engines

| Engine        | Weight | Description                               |
|---------------|--------|-------------------------------------------|
| rule_engine   | 40%    | Technical indicator-based rules (TODO)    |
| ml_model      | 40%    | ML prediction model (TODO)                |
| sentiment     | 20%    | News/social sentiment analysis (TODO)     |

Final confidence = weighted average across all sources that produced a signal.

### Signal Types

| Signal | Meaning                     |
|--------|-----------------------------|
| BUY    | Strong buy recommendation   |
| SELL   | Strong sell recommendation  |
| HOLD   | No change recommended       |

### Database Tables

```sql
-- recommendations.signals
id           UUID PRIMARY KEY
symbol       VARCHAR NOT NULL
exchange     VARCHAR NOT NULL
signal_type  VARCHAR NOT NULL       -- BUY / SELL / HOLD
source       VARCHAR NOT NULL       -- rule_engine / ml_model / sentiment
confidence   INT (0-100)
reasoning    TEXT
metadata     JSONB
valid_until  TIMESTAMPTZ
created_at   TIMESTAMPTZ

-- recommendations.user_recommendations
id                   UUID PRIMARY KEY
user_id              UUID NOT NULL
signal_id            UUID REFERENCES signals(id)
personalization_score INT (0-100)
is_viewed            BOOLEAN DEFAULT false
created_at           TIMESTAMPTZ
```

---

## 8. Alert Service

**Port:** `3007`
**Schema:** `alerts`
**Role:** Create price/volume alerts, evaluate them in real-time against market ticks.

### Routes

| Method | Path               | Auth | Description                     |
|--------|--------------------|------|---------------------------------|
| POST   | /                  | Yes  | Create alert                    |
| GET    | /                  | Yes  | List alerts (filter by status)  |
| GET    | /:id               | Yes  | Get single alert                |
| PATCH  | /:id               | Yes  | Update alert                    |
| DELETE | /:id               | Yes  | Delete alert                    |
| POST   | /:id/reactivate    | Yes  | Re-enable triggered/disabled    |
| GET    | /health            | No   | Health check                    |

### Alert Conditions

| Condition Type          | Triggers When                                        |
|-------------------------|------------------------------------------------------|
| `price_above`           | price ≥ threshold                                    |
| `price_below`           | price ≤ threshold                                    |
| `price_crosses_above`   | previous price < threshold AND current price ≥ threshold |
| `price_crosses_below`   | previous price > threshold AND current price ≤ threshold |
| `percent_change_above`  | % change from open ≥ threshold                       |
| `percent_change_below`  | % change from open ≤ threshold (negative)            |
| `volume_above`          | current volume ≥ threshold                           |

### Alert Lifecycle

```
              create
                │
                ▼
           ┌─────────┐
           │  ACTIVE  │ ──── tick evaluates ────► TRIGGERED
           └─────────┘                              │
                ▲                                   │ (maxTriggerCount reached)
                │ reactivate                        ▼
           ┌──────────┐                        DISABLED
           │ TRIGGERED│
           └──────────┘

           Also: EXPIRED (expires_at passed)
```

### Real-Time Evaluation Engine

On service start, subscribes to Redis `market:tick:*`. On every tick:

```
1. Find all ACTIVE alerts for the ticked symbol
2. For each alert:
   a. Evaluate the condition against current + previous price
   b. If triggered:
      - Check cooldown (5 min default) to prevent spam
      - Increment trigger_count
      - Update last_triggered_at, last_evaluated_value
      - If maxTriggerCount reached → set status = DISABLED
      - Publish to Redis: alert:triggered { alertId, userId, symbol, ... }
3. Update last_evaluated_value for cross-detection
```

### Database Tables

```sql
-- alerts.alerts
id                   UUID PRIMARY KEY
user_id              UUID NOT NULL (indexed)
symbol               VARCHAR NOT NULL
exchange             VARCHAR NOT NULL    -- NSE or BSE
condition_type       VARCHAR NOT NULL    -- enum (see above)
threshold            NUMERIC NOT NULL
last_evaluated_value NUMERIC             -- for cross detection
status               VARCHAR DEFAULT 'active'  -- active/triggered/disabled/expired
trigger_count        INT DEFAULT 0
last_triggered_at    TIMESTAMPTZ
label                VARCHAR(100)        -- optional user label
note                 TEXT
expires_at           TIMESTAMPTZ
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

---

## 9. Notification Service

**Port:** `3008` (REST) | `3018` (WebSocket)
**Schema:** `notifications`
**Role:** Deliver in-app and email notifications triggered by system events.

### REST Routes

| Method | Path                  | Auth | Description                      |
|--------|-----------------------|------|----------------------------------|
| GET    | /                     | Yes  | List notifications (paginated)   |
| PATCH  | /:id/read             | Yes  | Mark notification as read        |
| POST   | /mark-all-read        | Yes  | Mark all as read                 |
| GET    | /preferences          | Yes  | Get notification preferences     |
| PATCH  | /preferences          | Yes  | Update notification preferences  |
| GET    | /health               | No   | Health check                     |

### WebSocket (port 3018)

**Connect:**
```
ws://notification-service:3018/?userId=<uuid>
```

**Incoming notification push:**
```json
{
  "event": "notification",
  "data": {
    "id": "uuid",
    "type": "alert_triggered",
    "title": "RELIANCE crossed ₹2500",
    "body": "NSE:RELIANCE price crossed above your ₹2500 alert",
    "isRead": false,
    "createdAt": "2026-03-10T08:00:00.000Z"
  }
}
```

### Event Sources (Redis Pub/Sub)

| Channel              | Published By          | Triggers               |
|----------------------|-----------------------|------------------------|
| `alert:triggered`    | alert-service         | Alert notification     |
| `recommendation:new` | recommendation-service| New signal notification|
| `order:executed`     | broker-service        | Order confirmation     |

### Notification Types

| Type                | Description                           |
|---------------------|---------------------------------------|
| `alert_triggered`   | A user's price/volume alert fired     |
| `recommendation`    | New trading signal available          |
| `order_executed`    | Trade order confirmed by broker       |
| `system`            | Platform announcements                |

### User Preferences

```json
{
  "emailAlerts": true,
  "emailRecommendations": true,
  "emailOrders": true,
  "pushEnabled": true,
  "inAppEnabled": true
}
```

The service checks these before sending. e.g. if `emailAlerts = false`, alert triggers only appear in-app.

### Cleanup Job

A daily cron job deletes all notifications older than **90 days** to keep the table lean.

### Database Tables

```sql
-- notifications.notifications
id         UUID PRIMARY KEY
user_id    UUID NOT NULL (indexed)
type       VARCHAR NOT NULL     -- alert_triggered / recommendation / order_executed / system
channel    VARCHAR NOT NULL     -- in_app / email / push / sms
title      VARCHAR NOT NULL
body       TEXT NOT NULL
metadata   JSONB                -- additional context (e.g. symbol, alertId)
is_read    BOOLEAN DEFAULT false
read_at    TIMESTAMPTZ
created_at TIMESTAMPTZ

-- notifications.preferences
id                   UUID PRIMARY KEY
user_id              UUID UNIQUE NOT NULL
email_alerts         BOOLEAN DEFAULT true
email_recommendations BOOLEAN DEFAULT true
email_orders         BOOLEAN DEFAULT true
push_enabled         BOOLEAN DEFAULT true
in_app_enabled       BOOLEAN DEFAULT true
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

---

## 10. Shared Package

**Location:** `packages/shared`
**Consumed by:** all 9 services

### Exports

#### Types

| Module         | Key Types                                                         |
|----------------|-------------------------------------------------------------------|
| `auth`         | `JwtPayload`, `AuthTokens`, `LoginDTO`, `RegisterDTO`             |
| `user`         | `UserProfile`, `UserPreferences`                                  |
| `broker`       | `BrokerConnection`, `PlaceOrderDTO`, `OrderType`, `ProductType`   |
| `market`       | `Quote`, `OHLCV`, `TechnicalIndicators`, `CandleInterval`         |
| `portfolio`    | `Holding`, `PortfolioSummary`, `Watchlist`                        |
| `alert`        | `Alert`, `AlertConditionType`, `AlertStatus`                      |
| `recommendation` | `Signal`, `SignalType`, `SignalSource`, `UserRecommendation`    |
| `notification` | `Notification`, `NotificationType`, `NotificationPreferences`     |

#### Validators (Zod schemas)

| Schema            | Validates                              |
|-------------------|----------------------------------------|
| `registerSchema`  | email, strong password, phone (+91)    |
| `loginSchema`     | email + password                       |
| `verifyOtpSchema` | phone + 6-digit OTP                    |
| `refreshTokenSchema` | refreshToken string                 |
| `placeOrderSchema`| connectionId, symbol, exchange, action, quantity, orderType |
| `watchlistSchema` | name (1-100), symbols (1-50 items)     |
| `alertSchema`     | symbol, exchange, alertType, condition |

#### Constants

| Constant       | Values                                          |
|----------------|-------------------------------------------------|
| `EXCHANGES`    | `NSE`, `BSE`                                   |
| `INTERVALS`    | `1m`, `5m`, `15m`, `30m`, `1h`, `1d`, `1w`    |
| `INDICATORS`   | `sma_20`, `ema_50`, `rsi_14`, `macd`, etc.     |

---

## Data Flows

### 1. User Registration & First Login

```
Client                   Gateway              Auth-Service          SMS Provider
  │                         │                     │                      │
  ├─POST /api/v1/auth/register──►                  │                      │
  │                         ├─POST /register──────►│                      │
  │                         │                     ├─ hash password        │
  │                         │                     ├─ insert user          │
  │                         │                     ├─ generate OTP ───────►│ (mock: log)
  │◄─ 201 {userId, phone} ──┤◄─────────────────── │                      │
  │                         │                     │                      │
  ├─POST /api/v1/auth/verify-otp──►                │                      │
  │                         ├─POST /verify-otp────►│                      │
  │                         │                     ├─ validate OTP         │
  │                         │                     ├─ phone_verified=true  │
  │◄─ 200 {success} ────────┤◄─────────────────── │                      │
  │                         │                     │                      │
  ├─POST /api/v1/auth/login──►                     │                      │
  │                         ├─POST /login─────────►│                      │
  │                         │                     ├─ verify password      │
  │                         │                     ├─ issue JWT (15m)      │
  │                         │                     ├─ issue refresh (7d)   │
  │◄─ 200 {accessToken, refreshToken} ────────────┤                      │
```

### 2. Real-Time Alert Evaluation

```
External Feed          Redis                Alert-Service          Notification-Service
     │                   │                       │                       │
     ├─ price tick ──────►│                       │                       │
     │                   │ market:tick:NSE:RELIANCE                       │
     │                   ├───────────────────────►│                       │
     │                   │                       ├─ evaluate alerts       │
     │                   │                       ├─ condition met?        │
     │                   │                       ├─ check cooldown        │
     │                   │ alert:triggered        │                       │
     │                   │◄───────────────────────┤                       │
     │                   ├──────────────────────────────────────────────►│
     │                   │                       │    create notification │
     │                   │                       │    push via WebSocket  │
     │                   │                       │    send email (pref.)  │
```

### 3. Order Placement

```
Client          Gateway         Broker-Service         Angel One API
  │                │                  │                     │
  ├─ POST /orders──►                  │                     │
  │                ├─ verify JWT      │                     │
  │                ├─ POST /orders───►│                     │
  │                │                 ├─ decrypt token       │
  │                │                 ├─ POST placeOrder────►│
  │                │                 │◄─ {orderId, status}─ │
  │◄─ 200 ─────────┤◄─────────────── │                     │
  │                │                 ├─ publish order:executed → Redis
```

---

## Redis Pub/Sub Channels

| Channel                | Publisher            | Subscribers                  | Payload                                        |
|------------------------|----------------------|------------------------------|------------------------------------------------|
| `market:tick:*`        | market-data-service  | alert-service, market WS     | `{symbol, exchange, ltp, volume, timestamp}`   |
| `alert:triggered`      | alert-service        | notification-service         | `{alertId, userId, symbol, condition, value}`  |
| `recommendation:new`   | recommendation-service | notification-service       | `{userId, symbol, signalType, confidence}`     |
| `order:executed`       | broker-service       | notification-service         | `{userId, symbol, action, quantity, price}`    |

---

## Database Schemas

Each service runs its own migrations against the **same PostgreSQL instance** but a **separate schema**:

```
PostgreSQL: asset_management database
├── auth schema         (auth-service)
├── users schema        (user-service)
├── broker schema       (broker-service)
├── market schema       (market-data-service)
├── portfolio schema    (portfolio-service)
├── recommendations schema (recommendation-service)
├── alerts schema       (alert-service)
└── notifications schema (notification-service)
```

Migrations run automatically on service startup via `db.migrate.latest()`.

---

## Environment Variables

### API Gateway

| Variable                   | Default                          | Description                     |
|----------------------------|----------------------------------|---------------------------------|
| `PORT`                     | 3000                             | HTTP port                       |
| `JWT_SECRET`               | dev-secret-change-in-production  | Must match auth-service         |
| `REDIS_URL`                | redis://localhost:6379           | Redis connection                |
| `AUTH_SERVICE_URL`         | http://localhost:3001            | Auth service address            |
| `USER_SERVICE_URL`         | http://localhost:3002            |                                 |
| `BROKER_SERVICE_URL`       | http://localhost:3003            |                                 |
| `MARKET_DATA_SERVICE_URL`  | http://localhost:3004            |                                 |
| `PORTFOLIO_SERVICE_URL`    | http://localhost:3005            |                                 |
| `RECOMMENDATION_SERVICE_URL` | http://localhost:3006          |                                 |
| `ALERT_SERVICE_URL`        | http://localhost:3007            |                                 |
| `NOTIFICATION_SERVICE_URL` | http://localhost:3008            |                                 |
| `CORS_ORIGIN`              | http://localhost:5173            | Comma-separated allowed origins |
| `RATE_LIMIT_MAX_REQUESTS`  | 100                              | Global rate limit per minute    |

### Auth Service

| Variable                | Default | Description                        |
|-------------------------|---------|------------------------------------|
| `PORT`                  | 3001    |                                    |
| `DB_HOST`               |         | PostgreSQL host                    |
| `DB_NAME`               |         | Database name                      |
| `DB_USER`               |         | Database user                      |
| `DB_PASSWORD`           |         |                                    |
| `DB_SCHEMA`             | auth    | PostgreSQL schema                  |
| `JWT_SECRET`            |         | Must match api-gateway             |
| `JWT_ACCESS_EXPIRY`     | 15m     | Access token lifetime              |
| `JWT_REFRESH_EXPIRY_DAYS` | 7    | Refresh token lifetime in days     |
| `REDIS_URL`             |         |                                    |
| `OTP_PROVIDER`          | mock    | `mock` logs OTP / production: SMS  |

### Broker Service

| Variable                    | Default | Description                        |
|-----------------------------|---------|------------------------------------|
| `BROKER_TOKEN_ENCRYPTION_KEY` |       | AES key for token encryption       |
| `ANGEL_ONE_API_KEY`         |         | Angel One API key                  |
| `ANGEL_ONE_API_URL`         | https://apiconnect.angelbroking.com | |

### Market Data Service

| Variable  | Default | Description              |
|-----------|---------|--------------------------|
| `PORT`    | 3004    | REST port                |
| `WS_PORT` | 3014    | WebSocket port           |
| `REDIS_URL` |       | Subscribes to tick data  |

### Alert Service

| Variable             | Default | Description                        |
|----------------------|---------|------------------------------------|
| `ALERT_POLL_INTERVAL`| 5000    | Tick evaluation interval (ms)      |
| `ALERT_BATCH_SIZE`   | 200     | Alerts evaluated per batch         |
| `ALERT_MAX_TRIGGERS` | 0       | Max triggers before disable (0=∞)  |
| `ALERT_COOLDOWN_MS`  | 300000  | Minimum ms between triggers (5min) |

### Notification Service

| Variable    | Default             | Description              |
|-------------|---------------------|--------------------------|
| `PORT`      | 3008                | REST port                |
| `WS_PORT`   | 3018                | WebSocket port           |
| `SMTP_HOST` | smtp.mailtrap.io    | Email SMTP host          |
| `SMTP_PORT` | 587                 |                          |
| `SMTP_USER` |                     | Mailtrap credentials     |
| `SMTP_PASS` |                     |                          |
| `SMTP_FROM` | noreply@swingplatform.dev | Sender address      |

---

## Known Limitations / TODOs

| Area                | Status  | Notes                                              |
|---------------------|---------|----------------------------------------------------|
| OTP SMS             | Mock    | Logs OTP to console. Needs MSG91/Twilio            |
| Portfolio Sync      | Stub    | `POST /sync` not implemented                       |
| Recommendation Engines | Stub | Rule engine, ML model, sentiment not implemented   |
| WebSocket Auth      | Weak    | Uses `?userId=` query param — should verify JWT    |
| Angel One Token     | Partial | Symbol token lookup for order validation missing   |
| Tests               | None    | No unit or integration tests                       |
| Monitoring          | None    | No Prometheus/Grafana metrics                      |
