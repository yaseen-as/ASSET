# SwingTrade Platform - Features Roadmap

> Last updated: 2026-03-12

---

## Implemented Features

### auth-service (Port 3001)

| Feature | Status | Details |
|---------|--------|--------|
| User registration | Done | Email, phone, password with validation (Zod) |
| Password hashing | Done | bcryptjs with salt rounds |
| JWT access tokens | Done | 15-min expiry, signed with secret |
| Refresh token rotation | Done | Family-based rotation, revocation tracking |
| OTP generation | Done | 6-digit code, 10-min expiry, max 5 attempts |
| Phone verification | Done | OTP verify marks phone_verified = true |
| Logout / token revocation | Done | Revokes refresh token family |

### user-service (Port 3002)

| Feature | Status | Details |
|---------|--------|--------|
| Get user profile | Done | Auto-creates profile on first access |
| Update profile | Done | Display name, avatar URL, timezone, preferences (JSONB) |
| Default timezone | Done | Asia/Kolkata |

### broker-service (Port 3003)

| Feature | Status | Details |
|---------|--------|--------|
| Angel One login | Done | Real API call to SmartAPI `/loginByPassword` |
| Connect broker | Done | Stores encrypted access/refresh tokens (AES) |
| Disconnect broker | Done | Deletes connection record |
| Toggle connection | Done | Enable/disable without deleting |
| List connections | Done | Returns masked client IDs |
| Fetch holdings | Done | Real API call to Angel One holdings endpoint |
| Place order | Done | Real API call to Angel One order endpoint |
| Token encryption | Done | AES encryption for stored broker credentials |

### market-data-service (Port 3004)

| Feature | Status | Details |
|---------|--------|--------|
| Quote endpoint | Done | Returns cached LTP from Redis/DB |
| Historical OHLCV | Done | Database-backed daily candle data |
| Technical indicators | Done | SMA, EMA, RSI, MACD via `technicalindicators` library |
| WebSocket server | Done | Streams ticks from Redis pub/sub to connected clients |
| Symbol subscription | Done | Clients subscribe/unsubscribe to specific symbols |
| Heartbeat | Done | 30s ping/pong for connection health |

### portfolio-service (Port 3005)

| Feature | Status | Details |
|---------|--------|--------|
| Get holdings summary | Done | Returns all holdings with P&L calculations |
| P&L calculation | Done | `(current_price - avg_buy_price) * quantity` |
| Portfolio totals | Done | Aggregated value, total P&L, P&L % |
| Create watchlist | Done | Named watchlists with symbol array (JSONB) |
| Update watchlist | Done | Add/remove symbols |
| Delete watchlist | Done | Removes watchlist record |
| List watchlists | Done | Returns all user watchlists |

### recommendation-service (Port 3006)

| Feature | Status | Details |
|---------|--------|--------|
| Rule engine | Done | 5 technical analysis rules implemented |
| Golden/Death Cross | Done | SMA 50 vs SMA 200 crossover detection |
| RSI overbought/oversold | Done | RSI > 70 (SELL) / RSI < 30 (BUY) |
| MACD crossover | Done | Bullish/bearish signal line crossover |
| Volume spike detection | Done | Volume > 2x average triggers signal |
| EMA trend analysis | Done | Price position relative to EMA 20/50 |
| Get signals | Done | Filter by source, confidence, symbol |
| Personalized recommendations | Done | User-specific signals with personalization score |

### alert-service (Port 3007)

| Feature | Status | Details |
|---------|--------|--------|
| Create alert | Done | 7 condition types supported |
| Price above/below | Done | Threshold comparison |
| Price crosses above/below | Done | Previous vs current value crossing logic |
| Percent change above/below | Done | Based on tick change_pct |
| Volume above | Done | Volume threshold trigger |
| Real-time evaluation | Done | Subscribes to Redis `market:tick:*` channels |
| Trigger cooldown | Done | Configurable cooldown between repeated triggers |
| Auto-disable | Done | After max trigger count reached |
| Alert expiry | Done | Periodic check disables expired alerts |
| Trigger notification | Done | Publishes to Redis `alert:triggered` channel |
| CRUD operations | Done | Create, read, update, delete, reactivate |

### notification-service (Port 3008)

| Feature | Status | Details |
|---------|--------|--------|
| In-app notifications | Done | Database-persisted with unread tracking |
| WebSocket push | Done | Real-time delivery to connected clients |
| Event listener | Done | Subscribes to `alert:triggered`, `recommendation:new`, `order:executed` |
| List notifications | Done | Paginated (default 20, max 100) |
| Mark as read | Done | Single or mark-all-read |
| Notification preferences | Done | Per-user email/push toggles |
| Unread count | Done | Tracked and queryable |

### api-gateway (Port 3000)

| Feature | Status | Details |
|---------|--------|--------|
| JWT authentication | Done | Bearer token validation on protected routes |
| Public route bypass | Done | Register, login, OTP, refresh, health |
| Request proxying | Done | Routes to all 8 backend services |
| Header injection | Done | `x-user-id`, `x-user-email`, `x-correlation-id` |
| Path rewriting | Done | Strips service prefix before forwarding |
| CORS | Done | Configurable origins with credentials |
| Rate limiting (default) | Done | Configurable window + max requests |
| Rate limiting (auth) | Done | 10 req/min for brute-force protection |
| Rate limiting (orders) | Done | 5 req/min for order placement |
| Helmet security headers | Done | Standard security headers |
| Correlation ID tracing | Done | UUID injected into every request |
| Error handler | Done | Centralized error formatting |

### Frontend (React + Vite)

| Feature | Status | Details |
|---------|--------|--------|
| Login page | Done | Email + password with error toasts |
| Registration page | Done | Name, email, phone, password with validation |
| OTP verification page | Done | 6-digit input with auto-redirect |
| Dashboard | Done | Market indices, portfolio summary cards, top holdings table |
| Portfolio page | Done | Full holdings list with sync button |
| Watchlist page | Done | Add/remove symbols with exchange selector |
| Alerts page | Done | Create alerts with 7 condition types, status table |
| Recommendations page | Done | Signal cards with confidence and reasoning |
| Broker page | Done | Connect Angel One form, connection list with toggle |
| Settings page | Done | Profile display, notification preferences |
| Sidebar navigation | Done | 7 nav items with active state, mobile responsive |
| Auth state persistence | Done | Zustand + localStorage |
| Token auto-refresh | Done | Axios interceptor with silent refresh |
| Dark theme | Done | Full dark mode UI with Tailwind |

### Infrastructure

| Feature | Status | Details |
|---------|--------|--------|
| Kustomize base + overlays | Done | Dev and prod environment separation |
| k3d dev cluster | Done | Local Kubernetes with source code mounting |
| Dev hot-reload (backend) | Done | ts-node-dev via batch patch on all 9 services |
| Dev hot-reload (frontend) | Done | Vite HMR via dev patch |
| NGINX ingress | Done | Path rewrite routing for API + frontend |
| PostgreSQL deployment | Done | PVC-backed, 15-alpine, init container wait |
| Redis deployment | Done | Append-only persistence, health checks |
| Jenkins deployment | Done | In-cluster with Docker socket mount |
| Schema-per-service DB | Done | 8 isolated schemas in single database |
| Auto-migrations | Done | All services run `db.migrate.latest()` on startup |

---

## Stub / Partially Implemented Features

These features have code structure in place but need real integrations:

### auth-service

| Feature | Status | What's Missing |
|---------|--------|---------------|
| OTP SMS delivery | Stub | Only logs OTP to console. Needs MSG91, Twilio, or similar SMS provider integration |

### broker-service

| Feature | Status | What's Missing |
|---------|--------|---------------|
| Symbol token lookup | Partial | `placeOrder()` has empty `symboltoken` field — Angel One requires token-to-symbol mapping |

### market-data-service

| Feature | Status | What's Missing |
|---------|--------|---------------|
| Market data ingestion | Not started | No process populates `ohlcv_daily` table or Redis tick channels. WebSocket server is ready to stream but has no data source feeding it |

### portfolio-service

| Feature | Status | What's Missing |
|---------|--------|---------------|
| Sync from broker | Stub | `syncFromBroker()` is a `console.log` placeholder. Needs HTTP call to broker-service to fetch holdings and upsert into portfolio DB |

### recommendation-service

| Feature | Status | What's Missing |
|---------|--------|---------------|
| Background signal generation | Not started | Rule engine is fully implemented but never invoked. No scheduled job or event listener calls `generateSignals()`. Signals table stays empty |

### notification-service

| Feature | Status | What's Missing |
|---------|--------|---------------|
| Email delivery | Stub in dev | Logs email content in development mode. Nodemailer config ready for production SMTP (Mailtrap configured) |

### api-gateway

| Feature | Status | What's Missing |
|---------|--------|---------------|
| Distributed rate limiting | Not started | Uses in-memory store — resets on restart, doesn't share state across replicas. Needs Redis-backed store for production |

---

## Upcoming Features (Not Yet Started)

### Phase 1: Core Data Pipeline

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| Market data feed connector | market-data-service | High | Connect to Angel One WebSocket feed or third-party provider (e.g., Dhan, Fyers) to stream live ticks into Redis |
| Historical data backfill | market-data-service | High | Batch-fetch daily OHLCV from broker API and populate `market.ohlcv_daily` table |
| Portfolio broker sync | portfolio-service | High | Call broker-service internally to fetch holdings, calculate avg prices, and persist to DB |
| Signal generation worker | recommendation-service | High | Scheduled job (node-cron) that evaluates rule engine against latest candles and writes signals to DB |

### Phase 2: Real Communications

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| SMS provider integration | auth-service | High | Integrate MSG91 or Twilio for actual OTP delivery |
| Production email sending | notification-service | Medium | Configure real SMTP (SendGrid, AWS SES) and enable email notifications |
| Push notifications | notification-service | Medium | Firebase Cloud Messaging (FCM) for mobile/browser push |

### Phase 3: Trading & Execution

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| Symbol token resolution | broker-service | High | Build symbol→token mapping cache from Angel One master data |
| Order status tracking | broker-service | Medium | Poll Angel One for order status updates, publish `order:executed` events |
| Order history | broker-service | Medium | Store and retrieve past orders |
| Paper trading mode | broker-service | Medium | Simulate order execution without real broker calls |

### Phase 4: Analytics & Intelligence

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| Portfolio analytics | portfolio-service | Medium | Sector allocation, diversification score, risk metrics |
| P&L reports | portfolio-service | Medium | Daily/weekly/monthly P&L breakdown with charts |
| ML-based signals | recommendation-service | Low | Train models on historical data for prediction signals |
| Sentiment analysis | recommendation-service | Low | News/social media sentiment scoring for stocks |
| Backtesting engine | recommendation-service | Low | Test trading strategies against historical data |

### Phase 5: Platform Hardening

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| Redis-backed rate limiting | api-gateway | High | Replace in-memory limiter with `rate-limit-redis` for multi-instance |
| API key authentication | api-gateway | Medium | Allow programmatic access via API keys |
| Audit logging | api-gateway | Medium | Log all state-changing operations for compliance |
| Multi-broker support | broker-service | Medium | Add Zerodha (Kite), Dhan, Fyers, ICICI Direct connectors |
| Role-based access | auth-service | Low | Admin, analyst, viewer roles with permission scoping |

### Phase 6: Frontend Enhancements

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| Interactive charts | frontend | High | TradingView lightweight charts for price history |
| Real-time price tickers | frontend | High | WebSocket-driven live price updates on dashboard/watchlist |
| Order placement UI | frontend | Medium | Place buy/sell orders from the frontend |
| Notification bell | frontend | Medium | Header notification dropdown with real-time badge |
| Portfolio charts | frontend | Medium | Pie charts for allocation, line charts for P&L history |
| Mobile responsive polish | frontend | Low | Full mobile-first layout optimization |
| Dark/light theme toggle | frontend | Low | User-selectable theme with persistence |

### Phase 7: DevOps & CI/CD

| Feature | Service | Priority | Description |
|---------|---------|----------|-------------|
| Jenkins pipeline | jenkins | High | Automated build → test → push → deploy pipeline |
| Docker image optimization | all services | Medium | Multi-stage builds, smaller images, layer caching |
| Health check dashboards | infrastructure | Medium | Grafana + Prometheus for service monitoring |
| Log aggregation | infrastructure | Medium | ELK stack or Loki for centralized logging |
| Horizontal pod autoscaling | infrastructure | Low | HPA based on CPU/memory for production |
| Database backups | infrastructure | Low | Automated pg_dump to S3/MinIO |

---

## Feature Dependency Graph

```
Market Data Feed ──► Historical Backfill ──► Signal Generation Worker
       │                                            │
       ▼                                            ▼
 Alert Evaluation                           Recommendation Signals
 (already working,                          (rule engine ready,
  needs tick data)                           needs trigger)
       │                                            │
       ▼                                            ▼
 Notification Push ◄───────────────────────────────┘
 (already working)

 SMS Provider ──► OTP Delivery ──► User Registration (end-to-end)

 Symbol Token Map ──► Order Placement ──► Order Tracking ──► Order History
                          │
                          ▼
                    Portfolio Sync
                    (needs implementation)
```

The **critical path** to a fully functional trading platform is:
1. Market data feed connector (everything else depends on live data)
2. SMS provider for real OTP
3. Symbol token resolution for order placement
4. Portfolio sync implementation
5. Signal generation worker
