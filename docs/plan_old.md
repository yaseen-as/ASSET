# Development Plan — SwingTrade Platform

> Last updated: 2026-04-10

## Current State

### Completed
- 9 microservices running with core CRUD
- React frontend with 10+ pages, full auth flow
- PostgreSQL schema-per-service, Redis pub/sub
- Kubernetes base + dev/prod overlays with k3d
- API Gateway (JWT, rate limiting, proxy)
- Auth (OTP stub, JWT, refresh rotation)
- Broker service (Angel One connect, orders, holdings, symbol master sync, paper trading)
- Market data (REST quotes, WebSocket, OHLCV history, 5 technical indicators)
- Portfolio (holdings, P&L, watchlists)
- Alert engine (7 condition types, real-time evaluation)
- Recommendation engine (5 rules: golden cross, RSI, MACD, volume spike, EMA trend)
- Notifications (in-app, WebSocket push, event listeners)

### Partially Working
- Symbol master sync (config was missing `scripMasterUrl` — fixed)
- Market quote fallback (wrong internal URL — fixed)
- Auth token refresh on expired sessions (added auto-retry)
- OTP delivery (logs to console, no real SMS)
- Email delivery (Nodemailer configured, dev logs only)
- Distributed rate limiting (in-memory, not Redis-backed)

### Not Started
- Market data ingestion worker (live WebSocket feed)
- Portfolio sync scheduler
- Signal generation scheduler
- ML-based signals / sentiment analysis
- Backtesting engine
- Multi-broker support
- Admin dashboard
- Production CI/CD automation
- Unit / integration tests

---

## Phase 1 — Core Data Pipeline

**Goal**: Enable end-to-end data flow: live market ticks → candle aggregation → signal generation → alerts.

Reference: [PHASE1_PLAN.md](PHASE1_PLAN.md)

### Block 1.1: Market Data Ingestion
- [ ] `MarketDataWorker` — connect to Angel One WebSocket, subscribe to tracked symbols
- [ ] Publish ticks to Redis `market:tick:{exchange}:{symbol}`
- [ ] Candle aggregator — aggregate ticks into 1m/5m/15m/1h candles, store in `market.ohlcv_intraday`
- [ ] Historical backfill — fetch 1-year daily OHLCV per symbol on startup
- [ ] Mock tick generator for dev without broker credentials (`MOCK_TICKS=true`)

### Block 1.2: Portfolio Sync
- [ ] `syncFromBroker()` — fetch holdings from broker-service, map Angel One fields, upsert into portfolio schema
- [ ] Live price refresh — batch-fetch LTPs from market-data-service
- [ ] `node-cron` scheduler: every 5 min during market hours (9:15 AM – 3:35 PM IST)

### Block 1.3: Signal Generation
- [ ] `SignalGeneratorService` — fetch candles, run rule engine, store results
- [ ] `SignalScheduler` — daily at 4 PM IST (post-market close), run on startup if stale
- [ ] Personalization — match signals to user watchlist/holdings
- [ ] Publish `recommendation:new` events to Redis

### Block 1.4: Inter-Service Communication
- [ ] `createServiceClient()` factory with retry + timeout for service-to-service HTTP
- [ ] Standardize error propagation across services

---

## Phase 2 — Real Communications

**Goal**: Replace stubs with actual delivery providers.

### Block 2.1: SMS / OTP
- [ ] Integrate Twilio or MSG91 for OTP delivery
- [ ] Rate-limit OTP sends (max 5/hour per phone)
- [ ] OTP expiry + retry logic

### Block 2.2: Email Notifications
- [ ] Configure production SMTP (SendGrid / AWS SES)
- [ ] Email templates for: alert triggered, daily report, order executed
- [ ] Unsubscribe links + preference honoring

### Block 2.3: Push Notifications (optional)
- [ ] Browser push via Web Push API
- [ ] Mobile push via Firebase Cloud Messaging (if mobile app planned)

---

## Phase 3 — Trading & Execution Hardening

**Goal**: Robust order lifecycle, accurate paper trading, reliable symbol resolution.

Reference: [PHASE3_PLAN.md](PHASE3_PLAN.md)

### Block 3.1: Symbol Token Resolution (done, needs verification)
- [x] `symbol_master` table with Angel One tokens
- [x] `SymbolMasterService.fetchAndSync()` from ScripMaster JSON
- [x] Auto-sync on startup if stale
- [ ] Verify NFO/BFO symbol mapping correctness
- [ ] Handle exchange segment correctly in `getMarketQuote` (NFO symbols should use NFO, not NSE)

### Block 3.2: Order Lifecycle
- [x] Order placement (live + paper)
- [x] Order status tracking worker (polls every 30s)
- [ ] Partial fill handling
- [ ] Order modification (price/quantity change)
- [ ] GTT (Good Till Triggered) orders via Angel One API
- [ ] Portfolio auto-resync after order execution

### Block 3.3: Paper Trading
- [x] Paper order simulation at current LTP
- [x] Paper accounts with ₹10L default balance
- [ ] Realistic slippage simulation
- [ ] Paper P&L calculation including brokerage/taxes
- [ ] Paper order history analytics

---

## Phase 4 — Analytics & Intelligence

**Goal**: Data-driven insights for traders.

### Block 4.1: Portfolio Analytics
- [ ] Time-weighted returns calculation
- [ ] Sector allocation breakdown
- [ ] Drawdown analysis
- [ ] Benchmark comparison (NIFTY 50, SENSEX)

### Block 4.2: Advanced Signals
- [ ] ML model integration (price prediction, trend classification)
- [ ] Sentiment analysis from news/social feeds
- [ ] Custom indicator support (user-defined formulas)

### Block 4.3: Backtesting
- [ ] Backtesting engine — run strategy against historical data
- [ ] Performance metrics (Sharpe ratio, max drawdown, win rate)
- [ ] Strategy comparison reports

---

## Phase 5 — Platform Hardening

**Goal**: Production-readiness, reliability, observability.

### Block 5.1: Testing
- [ ] Unit tests for services (Jest)
- [ ] Integration tests (Supertest + test DB)
- [ ] Frontend component tests (Vitest + Testing Library)
- [ ] E2E tests (Playwright)

### Block 5.2: Observability
- [ ] Structured logging (consistent JSON format across services)
- [ ] Health check endpoints with dependency status (DB, Redis, broker)
- [ ] Prometheus metrics + Grafana dashboards
- [ ] Distributed tracing (OpenTelemetry)

### Block 5.3: Security
- [ ] Redis-backed distributed rate limiting
- [ ] Input sanitization audit
- [ ] API key rotation strategy for Angel One
- [ ] Secrets management (Vault or Sealed Secrets)
- [ ] OWASP dependency scan in CI

### Block 5.4: CI/CD
- [ ] Jenkins pipeline: lint → test → build → push → deploy
- [ ] Automated rollback on health check failure
- [ ] Staging environment
- [ ] Database migration safety (zero-downtime migrations)

---

## Phase 6 — Frontend Enhancements

**Goal**: Polished user experience.

### Block 6.1: Dashboard
- [ ] Real-time portfolio value widget (WebSocket)
- [ ] Market overview (top gainers, losers, index values)
- [ ] News feed integration

### Block 6.2: Charting
- [ ] Interactive candlestick charts with indicator overlays
- [ ] Drawing tools (trendlines, support/resistance)
- [ ] Multi-timeframe view

### Block 6.3: UX
- [ ] Mobile-responsive layout improvements
- [ ] Keyboard shortcuts for power users
- [ ] Onboarding flow for new users
- [ ] Dark/light theme toggle (currently dark only)

---

## Phase 7 — Scale & Extensibility

**Goal**: Multi-broker, multi-user scale.

### Block 7.1: Multi-Broker
- [ ] Abstract broker interface (strategy pattern)
- [ ] Zerodha Kite Connect integration
- [ ] Upstox API integration
- [ ] Broker selection in UI

### Block 7.2: Performance
- [ ] Connection pooling tuning (PgBouncer)
- [ ] Redis cluster for high-volume tick processing
- [ ] Horizontal pod autoscaling (HPA) based on CPU/memory
- [ ] CDN for frontend static assets

### Block 7.3: Social Features (optional)
- [ ] Public watchlist sharing
- [ ] Community trade ideas feed
- [ ] Follow top performers

---

## Priority Order

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Phase 1 — Data Pipeline | 2 weeks | Unlocks signals, alerts, portfolio sync |
| 2 | Phase 3 — Trading Hardening | 1 week | Reliable order execution |
| 3 | Phase 5.1 — Testing | 2 weeks | Prevents regressions |
| 4 | Phase 2 — Real Communications | 1 week | Real OTP + email |
| 5 | Phase 6 — Frontend | 2 weeks | User experience |
| 6 | Phase 4 — Analytics | 3 weeks | Differentiator |
| 7 | Phase 5.2-5.4 — Hardening | 2 weeks | Production readiness |
| 8 | Phase 7 — Scale | Ongoing | Growth |

## Key Dependencies

```
Symbol Master Sync ──→ Market Quotes ──→ Order Placement ──→ Order Tracking
                   ──→ Signal Generation ──→ Alerts ──→ Notifications
Live WebSocket Feed ──→ Tick Cache ──→ Candle Aggregation ──→ Indicators
SMS Provider ──→ Real OTP ──→ User Registration (currently works with console log)
```
