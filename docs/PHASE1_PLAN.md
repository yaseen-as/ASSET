# Phase 1: Core Data Pipeline - Implementation Plan

> Status: Planning | Target: 2 weeks

---

## Objective

Enable the end-to-end data flow: **market ticks → portfolio holdings → trading signals → user recommendations**.

Currently these 4 pipelines are stubbed or disconnected. This plan fills every gap.

---

## Current State vs Target State

```
CURRENT:
  Angel One API ──► broker-service (login, holdings) ✅
  market-data-service (REST endpoints, WebSocket server) ✅
  alert-service (evaluation engine) ✅  ←── but no ticks flowing in
  recommendation-service (rule engine) ✅  ←── but never invoked
  portfolio-service (CRUD) ✅  ←── but syncFromBroker() is a stub

  ❌ No data source feeds Redis with market ticks
  ❌ No process populates ohlcv_daily table
  ❌ No portfolio sync from broker
  ❌ No scheduled signal generation

TARGET:
  Angel One WebSocket ──► market-data-worker ──► Redis pub/sub ──► WebSocket clients
                                                      │
                                                      ▼
                                               alert-service evaluates

  Angel One REST ──► market-data-worker ──► ohlcv_daily table
                                                      │
                                                      ▼
                                          recommendation-service generates signals

  broker-service ──► portfolio-service (sync every 5 min during market hours)
```

---

## Block 1: Market Data Ingestion

### Service: market-data-service (Port 3004)

### What exists
- `WebSocketManager` subscribes to Redis `market:tick:*` and broadcasts to browser clients
- `MarketDataService` reads from `market.ohlcv_daily` table (empty)
- `IndicatorEngine` computes SMA, EMA, RSI, MACD from OHLCV candles
- REST endpoints: `/quote/:exchange/:symbol`, `/history/...`, `/indicators/...`

### What's missing
A **worker** that connects to Angel One's SmartConnect WebSocket, receives ticks, and publishes them to Redis + persists candles to DB.

### Tasks

#### 1.1 Create MarketDataWorker

**New file:** `services/market-data-service/src/workers/market-data.worker.ts`

```
Responsibilities:
├── Connect to Angel One WebSocket using feedToken
├── Subscribe to a managed list of symbols
├── On each tick:
│   ├── Convert Angel One tick format → WSTickData
│   ├── Publish to Redis channel `market:tick:{exchange}:{symbol}`
│   └── Buffer ticks for candle aggregation
├── Every 1 minute: flush buffered ticks into ohlcv_intraday table
├── At market close (3:30 PM IST): write daily candle to ohlcv_daily
├── Handle reconnection on disconnect (exponential backoff)
└── Handle token refresh (feedToken expires ~24h)
```

**Key interface:**
```typescript
class MarketDataWorker {
  connect(feedToken: string, apiKey: string): Promise<void>
  subscribe(symbols: { exchange: string; token: string }[]): Promise<void>
  disconnect(): Promise<void>
  onTick(handler: (tick: WSTickData) => void): void
}
```

#### 1.2 Add symbol token mapping

Angel One requires numeric symbol tokens (e.g., `2885` for RELIANCE). Need a lookup table.

**New migration:** `services/market-data-service/migrations/20260312000001_add_symbol_master.ts`

```sql
CREATE TABLE market.symbol_master (
  symbol        VARCHAR(20) NOT NULL,
  exchange      VARCHAR(10) NOT NULL,
  token         VARCHAR(20) NOT NULL,    -- Angel One symbol token
  instrument    VARCHAR(30),             -- EQ, FUT, OPT
  lot_size      INT DEFAULT 1,
  PRIMARY KEY (symbol, exchange)
);
```

**Populate:** Fetch Angel One instrument master CSV on startup, upsert into table.

#### 1.3 Add intraday candle table

**New migration:** `services/market-data-service/migrations/20260312000002_add_ohlcv_intraday.ts`

```sql
CREATE TABLE market.ohlcv_intraday (
  symbol        VARCHAR(20),
  exchange      VARCHAR(10),
  interval      VARCHAR(10),   -- '1m', '5m', '15m', '1h'
  timestamp     TIMESTAMPTZ,
  open          DECIMAL(12,2),
  high          DECIMAL(12,2),
  low           DECIMAL(12,2),
  close         DECIMAL(12,2),
  volume        BIGINT,
  PRIMARY KEY (symbol, exchange, interval, timestamp)
);
CREATE INDEX idx_intraday_lookup ON market.ohlcv_intraday (symbol, exchange, interval, timestamp DESC);
```

#### 1.4 Historical data backfill

**New file:** `services/market-data-service/src/workers/historical-backfill.ts`

```
Responsibilities:
├── On service startup (once):
│   ├── For each tracked symbol:
│   │   ├── Fetch 1-year daily OHLCV from Angel One REST API
│   │   └── Upsert into market.ohlcv_daily
│   └── Mark backfill complete in Redis key `backfill:complete`
└── Skip if backfill already complete
```

This ensures the rule engine has 200+ candles for SMA/EMA crossover calculations.

#### 1.5 Dev fallback: mock tick generator

For development without real broker credentials:

**New file:** `services/market-data-service/src/workers/mock-tick-generator.ts`

```
When MOCK_TICKS=true:
├── Load last daily close from ohlcv_daily for each symbol
├── Every 2 seconds:
│   ├── Generate random price walk (±0.5% from last price)
│   ├── Publish to Redis as real tick
│   └── Alert-service and WebSocket clients receive it
└── Useful for testing the full pipeline without broker
```

#### 1.6 Wire into server startup

**Modify:** `services/market-data-service/src/server.ts`

```typescript
async function start() {
  await initDatabase();
  await wsManager.start(config.wsPort);

  if (config.mockTicks) {
    // Dev: generate fake ticks
    const mockGenerator = new MockTickGenerator(redisPub, config.symbols);
    mockGenerator.start();
  } else {
    // Prod: connect to Angel One feed
    const worker = new MarketDataWorker(redisPub);
    const feedToken = await fetchFeedToken(); // from broker-service
    await worker.connect(feedToken, config.angelOne.apiKey);
    await worker.subscribe(await getTrackedSymbols());
  }

  app.listen(config.port, () => { ... });
}
```

#### 1.7 Config additions

**Modify:** `services/market-data-service/src/config/index.ts`

```typescript
angelOne: {
  wsUrl: process.env.ANGEL_WS_URL || 'wss://smartapiws.angelone.in/smart-stream',
  apiKey: process.env.ANGEL_API_KEY || '',
},
brokerServiceUrl: process.env.BROKER_SERVICE_URL || 'http://broker-service:3003',
mockTicks: process.env.MOCK_TICKS === 'true',
symbols: (process.env.TRACKED_SYMBOLS || 'RELIANCE,INFY,SBIN,TCS,HDFCBANK').split(','),
```

**Modify:** `k8s/base/services/market-data-service/configmap.yaml` — add:

```yaml
BROKER_SERVICE_URL: http://broker-service:3003
MOCK_TICKS: "true"              # flip to "false" when real credentials available
TRACKED_SYMBOLS: "RELIANCE,INFY,SBIN,TCS,HDFCBANK,ICICIBANK,KOTAKBANK,LT,AXISBANK,WIPRO"
```

---

## Block 2: Portfolio Sync from Broker

### Service: portfolio-service (Port 3005)

### What exists
- `PortfolioRepository.upsertHolding()` — fully working upsert into `portfolio.holdings`
- `PortfolioService.syncFromBroker()` — **stub** (`console.log` only)
- Config has `brokerServiceUrl` defined
- Frontend already calls `POST /portfolio/sync`

### What's missing
Actual implementation of `syncFromBroker()` + a periodic scheduler.

### Tasks

#### 2.1 Implement syncFromBroker()

**Modify:** `services/portfolio-service/src/services/portfolio.service.ts`

```typescript
async syncFromBroker(userId: string): Promise<{ synced: number }> {
  // 1. Get user's active broker connections
  const { data: connections } = await axios.get(
    `${config.brokerServiceUrl}/connections`,
    { headers: { 'x-user-id': userId } }
  );

  if (!connections?.length) {
    throw new ServiceError('No broker connected. Connect a broker first.', 400);
  }

  let totalSynced = 0;

  for (const conn of connections) {
    if (!conn.isActive) continue;

    // 2. Fetch holdings from broker
    const { data: holdings } = await axios.get(
      `${config.brokerServiceUrl}/holdings/${conn.id}`,
      { headers: { 'x-user-id': userId } }
    );

    if (!holdings?.length) continue;

    // 3. Get or create default portfolio
    const portfolio = await this.repo.findOrCreateDefault(userId);

    // 4. Map Angel One fields → our schema and upsert
    for (const h of holdings) {
      await this.repo.upsertHolding(userId, portfolio.id, {
        symbol: this.extractSymbol(h.tradingsymbol),  // "RELIANCE-EQ" → "RELIANCE"
        exchange: h.exchange || 'NSE',
        quantity: parseInt(h.quantity, 10),
        avgBuyPrice: parseFloat(h.averageprice),
        currentPrice: parseFloat(h.ltp || h.close || '0'),
      });
      totalSynced++;
    }
  }

  return { synced: totalSynced };
}

private extractSymbol(tradingSymbol: string): string {
  // Angel One format: "RELIANCE-EQ", "INFY-EQ", "SBIN-EQ"
  return tradingSymbol.replace(/-EQ$/i, '');
}
```

#### 2.2 Add current price refresh

When returning holdings to the frontend, fetch live prices from market-data-service:

**Modify:** `services/portfolio-service/src/services/portfolio.service.ts`

```typescript
async getHoldingsWithLivePrices(userId: string): Promise<HoldingSummary> {
  const holdings = await this.repo.findByUser(userId);

  // Batch-fetch current prices
  for (const h of holdings) {
    try {
      const { data } = await axios.get(
        `${config.marketDataServiceUrl}/quote/${h.exchange}/${h.symbol}`
      );
      h.currentPrice = data.data?.ltp ?? h.currentPrice;
      h.pnl = (h.currentPrice - h.avgBuyPrice) * h.quantity;
      h.pnlPercent = ((h.currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;
    } catch {
      // Use cached price if market-data unavailable
    }
  }

  return this.calculateSummary(holdings);
}
```

#### 2.3 Add periodic sync scheduler

**New file:** `services/portfolio-service/src/workers/sync.scheduler.ts`

```typescript
import cron from 'node-cron';

export class SyncScheduler {
  constructor(private portfolioService: PortfolioService, private userRepo: UserRepository) {}

  start() {
    // Every 5 min, Mon-Fri, 9:15 AM - 3:35 PM IST
    cron.schedule('*/5 9-15 * * 1-5', async () => {
      const hour = new Date().getUTCHours() + 5.5; // IST offset
      if (hour < 9.25 || hour > 15.58) return;     // Market hours check

      const userIds = await this.userRepo.getActiveUserIds();
      for (const userId of userIds) {
        try {
          await this.portfolioService.syncFromBroker(userId);
        } catch (err) {
          console.error(`Sync failed for ${userId}:`, err.message);
        }
      }
    }, { timezone: 'Asia/Kolkata' });
  }
}
```

#### 2.4 Config additions

**Modify:** `k8s/base/services/portfolio-service/configmap.yaml` — add:

```yaml
BROKER_SERVICE_URL: http://broker-service:3003
MARKET_DATA_SERVICE_URL: http://market-data-service:3004
```

---

## Block 3: Signal Generation Worker

### Service: recommendation-service (Port 3006)

### What exists
- `RuleEngine.evaluate(symbol, exchange, candles)` — 5 rules, fully working
- `SignalRepository.createSignal()` — writes to `recommendations.signals`
- `SignalRepository.createUserRecommendation()` — links signal to user
- Config has `marketDataServiceUrl` defined
- REST endpoints: `GET /` (all signals), `GET /personalized` (user's signals)

### What's missing
A **scheduled worker** that fetches candles, runs the rule engine, and stores results.

### Tasks

#### 3.1 Create SignalGeneratorService

**New file:** `services/recommendation-service/src/services/signal-generator.service.ts`

```typescript
export class SignalGeneratorService {
  constructor(
    private ruleEngine: RuleEngine,
    private signalRepo: SignalRepository,
    private marketDataUrl: string
  ) {}

  async generateForSymbol(symbol: string, exchange: string): Promise<number> {
    // 1. Fetch 250 daily candles from market-data-service
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 250 * 86400000).toISOString().split('T')[0];

    const { data } = await axios.get(
      `${this.marketDataUrl}/history/${exchange}/${symbol}`,
      { params: { interval: '1d', from, to } }
    );

    const candles: OHLCV[] = data.data || [];
    if (candles.length < 50) return 0; // Insufficient data

    // 2. Run rule engine
    const results = this.ruleEngine.evaluate(symbol, exchange, candles);
    let created = 0;

    // 3. Store new signals (skip duplicates within 24h)
    for (const result of results) {
      const existing = await this.signalRepo.findRecent(
        symbol, exchange, result.ruleName, 24 // hours
      );
      if (existing) continue;

      await this.signalRepo.createSignal({
        symbol,
        exchange,
        signal_type: result.signalType,
        source: 'rule_engine',
        confidence: result.confidence,
        reasoning: result.reasoning,
        metadata: { ruleName: result.ruleName },
        valid_until: new Date(Date.now() + 24 * 3600000), // 24h validity
      });
      created++;
    }

    return created;
  }

  async personalizeForUser(userId: string, watchlistSymbols: string[]): Promise<void> {
    // Get recent signals for user's watchlist + holdings symbols
    const signals = await this.signalRepo.findBySymbols(watchlistSymbols);

    for (const signal of signals) {
      const exists = await this.signalRepo.hasUserRecommendation(userId, signal.id);
      if (exists) continue;

      // Score based on signal confidence + user relevance
      const score = Math.min(signal.confidence + 10, 100); // Boost for watchlist match
      await this.signalRepo.createUserRecommendation(userId, signal.id, score);
    }
  }
}
```

#### 3.2 Add missing repository methods

**Modify:** `services/recommendation-service/src/repositories/signal.repository.ts`

```typescript
// Add these methods:

async findRecent(symbol: string, exchange: string, ruleName: string, hoursAgo: number) {
  const cutoff = new Date(Date.now() - hoursAgo * 3600000);
  return db(this.table)
    .where({ symbol, exchange })
    .andWhereRaw("metadata->>'ruleName' = ?", [ruleName])
    .andWhere('created_at', '>', cutoff)
    .first();
}

async findBySymbols(symbols: string[], limit = 50) {
  return db(this.table)
    .whereIn('symbol', symbols)
    .andWhere('valid_until', '>', new Date())
    .orderBy('created_at', 'desc')
    .limit(limit);
}

async hasUserRecommendation(userId: string, signalId: string): Promise<boolean> {
  const row = await db('recommendations.user_recommendations')
    .where({ user_id: userId, signal_id: signalId })
    .first();
  return !!row;
}

async deleteExpired(): Promise<number> {
  return db(this.table)
    .where('valid_until', '<', new Date())
    .del();
}
```

#### 3.3 Create signal generation scheduler

**New file:** `services/recommendation-service/src/workers/signal.scheduler.ts`

```typescript
import cron from 'node-cron';

export class SignalScheduler {
  constructor(
    private generator: SignalGeneratorService,
    private symbols: string[]
  ) {}

  start() {
    // Daily at 4:00 PM IST (after market close) — Mon-Fri
    cron.schedule('0 16 * * 1-5', async () => {
      console.log(`[SignalScheduler] Starting signal generation for ${this.symbols.length} symbols`);
      let total = 0;

      for (const symbol of this.symbols) {
        try {
          const created = await this.generator.generateForSymbol(symbol, 'NSE');
          total += created;
        } catch (err) {
          console.error(`[SignalScheduler] Failed for ${symbol}:`, err.message);
        }
      }

      console.log(`[SignalScheduler] Done. Created ${total} new signals.`);

      // Clean up expired signals
      const deleted = await this.generator.signalRepo.deleteExpired();
      if (deleted > 0) console.log(`[SignalScheduler] Cleaned ${deleted} expired signals`);
    }, { timezone: 'Asia/Kolkata' });

    // Also run on startup if no recent signals exist
    this.runIfStale();
  }

  private async runIfStale() {
    const latest = await this.generator.signalRepo.getLatestSignalDate();
    const hoursSinceLast = latest
      ? (Date.now() - new Date(latest).getTime()) / 3600000
      : Infinity;

    if (hoursSinceLast > 20) {
      console.log('[SignalScheduler] No recent signals, running now...');
      for (const symbol of this.symbols) {
        try {
          await this.generator.generateForSymbol(symbol, 'NSE');
        } catch (err) {
          console.error(`[SignalScheduler] Startup run failed for ${symbol}:`, err.message);
        }
      }
    }
  }
}
```

#### 3.4 Wire into server startup

**Modify:** `services/recommendation-service/src/server.ts`

```typescript
import { SignalGeneratorService } from './services/signal-generator.service';
import { SignalScheduler } from './workers/signal.scheduler';

async function start() {
  await initDatabase();

  const generator = new SignalGeneratorService(
    new RuleEngine(),
    new SignalRepository(),
    config.marketDataServiceUrl
  );

  const scheduler = new SignalScheduler(generator, config.symbols);
  scheduler.start();

  app.listen(config.port, () => {
    console.log(`Recommendation Service on port ${config.port}`);
  });
}
```

#### 3.5 Config additions

**Modify:** `services/recommendation-service/src/config/index.ts` — add:

```typescript
symbols: (process.env.TRACKED_SYMBOLS || 'RELIANCE,INFY,SBIN,TCS,HDFCBANK').split(','),
```

**Modify:** `k8s/base/services/recommendation-service/configmap.yaml` — add:

```yaml
MARKET_DATA_SERVICE_URL: http://market-data-service:3004
TRACKED_SYMBOLS: "RELIANCE,INFY,SBIN,TCS,HDFCBANK,ICICIBANK,KOTAKBANK,LT,AXISBANK,WIPRO"
```

---

## Block 4: Inter-Service Communication

### What's needed
Portfolio-service and recommendation-service need to call broker-service and market-data-service over HTTP. Standardize this.

### Tasks

#### 4.1 Create service client utilities

**New file:** `packages/shared/src/clients/service-client.ts`

```typescript
import axios, { AxiosInstance } from 'axios';

export function createServiceClient(baseURL: string, timeout = 5000): AxiosInstance {
  return axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

Each service creates its own typed client using this factory. Keeps it simple — no abstraction overhead.

#### 4.2 Update portfolio-service configmap

**Modify:** `k8s/base/services/portfolio-service/configmap.yaml`:

```yaml
BROKER_SERVICE_URL: http://broker-service:3003
MARKET_DATA_SERVICE_URL: http://market-data-service:3004
```

---

## Block 5: Kubernetes Deployment Updates

### Tasks

#### 5.1 Update configmaps with new env vars

| Service | New Env Vars |
|---------|-------------|
| market-data-service | `BROKER_SERVICE_URL`, `MOCK_TICKS`, `TRACKED_SYMBOLS` |
| portfolio-service | `BROKER_SERVICE_URL`, `MARKET_DATA_SERVICE_URL` |
| recommendation-service | `MARKET_DATA_SERVICE_URL`, `TRACKED_SYMBOLS` |

#### 5.2 Add node-cron dependency

Services using schedulers need `node-cron`:

```bash
npm install node-cron --workspace=services/portfolio-service
npm install node-cron --workspace=services/recommendation-service
npm install @types/node-cron -D --workspace=services/portfolio-service
npm install @types/node-cron -D --workspace=services/recommendation-service
```

---

## Implementation Sequence

### Week 1: Data Foundation

| Day | Task | Service | Deliverable |
|-----|------|---------|-------------|
| 1 | Mock tick generator | market-data-service | Fake ticks flowing through Redis → WebSocket |
| 1 | Add `MOCK_TICKS` config + env var | market-data-service | Toggle between mock and real |
| 2 | Historical backfill worker | market-data-service | `ohlcv_daily` table populated with test data |
| 2 | Symbol master table + migration | market-data-service | Symbol-to-token mapping ready |
| 3 | Implement `syncFromBroker()` | portfolio-service | Holdings fetched from broker-service |
| 3 | Add live price refresh | portfolio-service | Holdings show current prices |
| 4 | Add sync scheduler | portfolio-service | Auto-sync every 5 min during market hours |
| 5 | Integration test: ticks + sync | all | Verify data flows end-to-end |

### Week 2: Signals & Polish

| Day | Task | Service | Deliverable |
|-----|------|---------|-------------|
| 1 | Create SignalGeneratorService | recommendation-service | Fetches candles → runs rules → stores signals |
| 2 | Create SignalScheduler | recommendation-service | Daily generation at 4 PM IST |
| 2 | Add missing repository methods | recommendation-service | `findRecent`, `findBySymbols`, `deleteExpired` |
| 3 | Personalization logic | recommendation-service | Signals matched to user watchlist/holdings |
| 4 | Update k8s configmaps | k8s | All new env vars deployed |
| 4 | AngelOne WebSocket worker | market-data-service | Real feed (if credentials available) |
| 5 | E2E testing in k3d cluster | all | Full pipeline working in dev |

---

## Verification Checklist

### Market Data Pipeline
- [ ] Mock ticks appear in Redis (`redis-cli SUBSCRIBE market:tick:NSE:RELIANCE`)
- [ ] WebSocket clients receive ticks when subscribed
- [ ] `ohlcv_daily` table has 200+ rows for tracked symbols
- [ ] `/quote/NSE/RELIANCE` returns a valid price
- [ ] `/history/NSE/RELIANCE?interval=1d` returns candle data
- [ ] `/indicators/NSE/RELIANCE?indicators=sma_20,rsi_14` returns values
- [ ] Alert-service evaluation triggers on mock ticks

### Portfolio Sync
- [ ] `POST /portfolio/sync` fetches from broker-service and stores holdings
- [ ] Holdings show correct quantity, avg price, current price
- [ ] P&L calculated correctly: `(current - avg) * qty`
- [ ] Sync scheduler runs during market hours
- [ ] Dashboard shows portfolio value and top holdings after sync
- [ ] Handles "no broker connected" error gracefully

### Signal Generation
- [ ] Scheduler runs at 4 PM IST (or on startup if stale)
- [ ] Signals created in `recommendations.signals` table
- [ ] No duplicate signals within 24h window
- [ ] `/recommendations` returns signals with confidence and reasoning
- [ ] `/recommendations/personalized` returns user-specific signals
- [ ] Expired signals cleaned up automatically
- [ ] Frontend Signals page shows generated recommendations

### Integration
- [ ] All services start without errors in k3d
- [ ] Inter-service HTTP calls work (service DNS resolution)
- [ ] Redis pub/sub channels functioning
- [ ] No circular dependencies between services

---

## Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Angel One WebSocket protocol undocumented | Can't receive real ticks | Use mock tick generator for dev; research SmartConnect npm package |
| Angel One holdings response schema unknown | Can't map to our Holding type | Add debug endpoint to inspect raw response; test with real account |
| OHLCV data not available for all symbols | Rule engine returns empty | Backfill from free API (Yahoo Finance, NSE website) as fallback |
| Rate limits on Angel One API | Sync fails for many users | Batch sync requests; add exponential backoff; cache holdings |
| node-cron timezone issues in container | Scheduler runs at wrong time | Set `TZ=Asia/Kolkata` in container env; verify with logs |

---

## Files Changed / Created Summary

### New Files
```
services/market-data-service/src/workers/market-data.worker.ts
services/market-data-service/src/workers/historical-backfill.ts
services/market-data-service/src/workers/mock-tick-generator.ts
services/market-data-service/migrations/20260312000001_add_symbol_master.ts
services/market-data-service/migrations/20260312000002_add_ohlcv_intraday.ts
services/portfolio-service/src/workers/sync.scheduler.ts
services/recommendation-service/src/services/signal-generator.service.ts
services/recommendation-service/src/workers/signal.scheduler.ts
packages/shared/src/clients/service-client.ts
```

### Modified Files
```
services/market-data-service/src/server.ts              ← wire worker + mock generator
services/market-data-service/src/config/index.ts        ← add angelOne, mockTicks, symbols config
services/portfolio-service/src/services/portfolio.service.ts  ← implement syncFromBroker()
services/portfolio-service/src/config/index.ts          ← add marketDataServiceUrl
services/portfolio-service/src/server.ts                ← wire sync scheduler
services/recommendation-service/src/server.ts           ← wire signal scheduler
services/recommendation-service/src/config/index.ts     ← add symbols config
services/recommendation-service/src/repositories/signal.repository.ts ← add findRecent, findBySymbols
k8s/base/services/market-data-service/configmap.yaml    ← add MOCK_TICKS, TRACKED_SYMBOLS, BROKER_SERVICE_URL
k8s/base/services/portfolio-service/configmap.yaml      ← add BROKER_SERVICE_URL, MARKET_DATA_SERVICE_URL
k8s/base/services/recommendation-service/configmap.yaml ← add MARKET_DATA_SERVICE_URL, TRACKED_SYMBOLS
```
