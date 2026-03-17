# Phase 3: Trading & Execution - Implementation Plan

> Status: Planning | Target: 2 weeks

---

## Objective

Enable end-to-end order execution: **symbol resolution → order placement → status tracking → order history → paper trading**.

Phase 1 established the data pipeline (ticks, holdings, signals). Phase 3 closes the loop by letting users act on signals — place real or simulated orders and track them through completion.

---

## Current State vs Target State

```
CURRENT:
  broker-service:
    ├── placeOrder() sends to Angel One API          ✅
    ├── symboltoken field is empty ("")              ❌ — orders will fail
    ├── No order status tracking after placement     ❌
    ├── No order history stored                      ❌
    └── No paper trading mode                        ❌

  frontend:
    ├── No order placement UI                        ❌
    ├── No order book / history page                 ❌
    └── No paper trading toggle                      ❌

TARGET:
  Symbol Master ──► Token Resolution ──► Order Placement ──► Status Polling
       │                                       │                    │
       ▼                                       ▼                    ▼
  Autocomplete UI                      order_history table    Notification push
                                              │                    │
                                              ▼                    ▼
                                     Order History Page      Portfolio re-sync

  Paper Trading Mode:
    Toggle in UI ──► broker-service skips Angel One API
                     ├── Simulates fill at market price (from Redis tick cache)
                     ├── Writes to order_history with source='paper'
                     └── Updates portfolio holdings as if real
```

---

## Block 1: Symbol Token Resolution

### Service: broker-service (Port 3003)

### What exists
- `placeOrder()` has `symboltoken: ''` — Angel One rejects orders without valid symbol tokens
- Angel One provides a master instrument CSV (~50MB) at `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`

### What's missing
A symbol-to-token mapping cache that resolves symbols like `RELIANCE` to Angel One's numeric token `2885`.

### Tasks

#### 1.1 Create symbol master table

**New migration:** `services/broker-service/migrations/20260317000001_create_symbol_master.ts`

```sql
CREATE TABLE broker.symbol_master (
  symbol          VARCHAR(50) NOT NULL,
  exchange        VARCHAR(10) NOT NULL,
  token           VARCHAR(20) NOT NULL,     -- Angel One numeric token
  trading_symbol  VARCHAR(50) NOT NULL,     -- e.g., "RELIANCE-EQ"
  instrument_type VARCHAR(20) NOT NULL,     -- EQ, FUTIDX, OPTIDX, etc.
  lot_size        INT DEFAULT 1,
  tick_size       DECIMAL(10,4) DEFAULT 0.05,
  expiry          DATE,                     -- for F&O
  strike          DECIMAL(12,2),            -- for options
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (token, exchange)
);
CREATE INDEX idx_symbol_master_lookup ON broker.symbol_master (symbol, exchange, instrument_type);
CREATE INDEX idx_symbol_master_trading ON broker.symbol_master (trading_symbol, exchange);
```

#### 1.2 Create SymbolMasterService

**New file:** `services/broker-service/src/services/symbol-master.service.ts`

```
Responsibilities:
├── fetchAndSync():
│   ├── Download Angel One ScripMaster JSON
│   ├── Parse and filter (NSE EQ + top F&O)
│   ├── Upsert into broker.symbol_master
│   └── Cache frequently-used mappings in Redis (TTL 24h)
├── resolveToken(symbol, exchange, instrumentType):
│   ├── Check Redis cache first
│   ├── Fall back to DB lookup
│   └── Return { token, tradingSymbol, lotSize }
├── searchSymbols(query, exchange?):
│   ├── ILIKE search on symbol + trading_symbol
│   └── Return top 10 matches (for autocomplete)
└── getExpiryDates(symbol, exchange):
    └── Return available expiry dates for F&O
```

**Key interface:**
```typescript
interface SymbolInfo {
  symbol: string;
  exchange: string;
  token: string;
  tradingSymbol: string;
  instrumentType: string;
  lotSize: number;
  tickSize: number;
  expiry?: string;
  strike?: number;
}

class SymbolMasterService {
  fetchAndSync(): Promise<{ total: number; updated: number }>
  resolveToken(symbol: string, exchange: string, type?: string): Promise<SymbolInfo>
  searchSymbols(query: string, exchange?: string, limit?: number): Promise<SymbolInfo[]>
}
```

#### 1.3 Add refresh scheduler

Sync the symbol master daily at 8:00 AM IST (before market open):

```typescript
// In server.ts startup
cron.schedule('0 8 * * 1-5', () => symbolMasterService.fetchAndSync(), {
  timezone: 'Asia/Kolkata',
});

// Also run on first startup if stale (>24h since last update)
```

#### 1.4 Add REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/broker/symbols/search?q=RELI&exchange=NSE` | Symbol autocomplete |
| `GET` | `/broker/symbols/:exchange/:symbol` | Get symbol info + token |
| `POST` | `/broker/symbols/sync` | Trigger manual master refresh |

#### 1.5 Wire token resolution into placeOrder()

**Modify:** `services/broker-service/src/services/broker.service.ts`

```typescript
async placeOrder(userId: string, dto: PlaceOrderDTO): Promise<OrderResponse> {
  // ... existing validation ...

  // Resolve symbol token (NEW)
  const symbolInfo = await this.symbolMaster.resolveToken(dto.symbol, dto.exchange);
  if (!symbolInfo) {
    throw new ServiceError(`Symbol not found: ${dto.exchange}:${dto.symbol}`, 'SYMBOL_NOT_FOUND', 400);
  }

  const result = await this.angelOne.placeOrder(accessToken, {
    variety: 'NORMAL',
    tradingsymbol: symbolInfo.tradingSymbol,   // was dto.symbol
    symboltoken: symbolInfo.token,              // was ''
    transactiontype: dto.action,
    exchange: dto.exchange,
    ordertype: dto.orderType,
    producttype: dto.productType || 'DELIVERY',
    duration: 'DAY',
    price: dto.price?.toString() || '0',
    quantity: dto.quantity.toString(),
  });

  // ... rest unchanged ...
}
```

---

## Block 2: Order Status Tracking

### What exists
- `placeOrder()` returns `{ orderId, status: 'PLACED' }` but never checks actual fill status
- Angel One provides an order book endpoint: `GET /rest/secure/angelbroking/order/v1/getOrderBook`

### What's missing
A polling mechanism that tracks orders from PLACED → EXECUTED / REJECTED / CANCELLED.

### Tasks

#### 2.1 Create order history table

**New migration:** `services/broker-service/migrations/20260317000002_create_order_history.ts`

```sql
CREATE TABLE broker.order_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  connection_id   UUID NOT NULL REFERENCES broker.connections(id) ON DELETE CASCADE,
  broker_order_id VARCHAR(50),             -- Angel One's order ID
  symbol          VARCHAR(50) NOT NULL,
  exchange        VARCHAR(10) NOT NULL,
  action          VARCHAR(4) NOT NULL,     -- BUY, SELL
  order_type      VARCHAR(20) NOT NULL,    -- MARKET, LIMIT, SL, SL-M
  product_type    VARCHAR(20) NOT NULL,    -- DELIVERY, INTRADAY, CARRYFORWARD
  quantity        INT NOT NULL,
  price           DECIMAL(12,2),           -- limit price (0 for market)
  filled_quantity INT DEFAULT 0,
  avg_fill_price  DECIMAL(12,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'PLACED',
  -- PLACED, OPEN, PARTIALLY_FILLED, EXECUTED, CANCELLED, REJECTED, AMO_SUBMITTED
  source          VARCHAR(10) NOT NULL DEFAULT 'live',  -- 'live' or 'paper'
  rejection_reason TEXT,
  placed_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  filled_at       TIMESTAMPTZ
);
CREATE INDEX idx_order_history_user ON broker.order_history (user_id, placed_at DESC);
CREATE INDEX idx_order_history_status ON broker.order_history (status) WHERE status IN ('PLACED', 'OPEN', 'PARTIALLY_FILLED');
```

#### 2.2 Create OrderRepository

**New file:** `services/broker-service/src/repositories/order.repository.ts`

```typescript
class OrderRepository {
  create(order: CreateOrderDTO): Promise<OrderRow>
  findById(id: string): Promise<OrderRow | undefined>
  findByUserId(userId: string, limit?: number, offset?: number): Promise<OrderRow[]>
  findPendingOrders(): Promise<OrderRow[]>   // status IN ('PLACED', 'OPEN', 'PARTIALLY_FILLED')
  updateStatus(id: string, update: OrderStatusUpdate): Promise<OrderRow>
  getOrderStats(userId: string): Promise<OrderStats>  // counts by status
}
```

#### 2.3 Create OrderTracker worker

**New file:** `services/broker-service/src/workers/order-tracker.ts`

```
Responsibilities:
├── Poll every 30 seconds for pending orders
├── For each pending order:
│   ├── Fetch order book from Angel One API
│   ├── Match by broker_order_id
│   ├── Update status, filled_quantity, avg_fill_price
│   ├── If status changed to EXECUTED:
│   │   ├── Publish to Redis channel `order:executed`
│   │   └── Notification-service picks this up automatically
│   └── If status changed to REJECTED:
│       └── Publish to Redis channel `order:rejected`
├── Skip orders older than 24h (mark as EXPIRED)
└── Handle API errors gracefully (don't mark orders as failed on API timeout)
```

```typescript
class OrderTracker {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.interval = setInterval(() => this.pollPendingOrders(), 30_000);
  }

  private async pollPendingOrders(): Promise<void> {
    const pending = await this.orderRepo.findPendingOrders();
    if (pending.length === 0) return;

    // Group by connection to minimize API calls
    const byConnection = groupBy(pending, 'connection_id');

    for (const [connId, orders] of Object.entries(byConnection)) {
      const conn = await this.brokerRepo.findById(connId);
      if (!conn?.access_token) continue;

      try {
        const accessToken = decrypt(conn.access_token);
        const orderBook = await this.angelOne.getOrderBook(accessToken);

        for (const order of orders) {
          const brokerOrder = orderBook.find(o => o.orderid === order.broker_order_id);
          if (!brokerOrder) continue;

          const newStatus = this.mapStatus(brokerOrder.orderstatus);
          if (newStatus === order.status) continue;

          await this.orderRepo.updateStatus(order.id, {
            status: newStatus,
            filled_quantity: parseInt(brokerOrder.filledshares || '0'),
            avg_fill_price: parseFloat(brokerOrder.averageprice || '0'),
            filled_at: newStatus === 'EXECUTED' ? new Date() : undefined,
            rejection_reason: brokerOrder.text || undefined,
          });

          // Publish status change event
          if (newStatus === 'EXECUTED') {
            await this.redisPub.publish('order:executed', JSON.stringify({
              userId: order.user_id,
              orderId: order.id,
              symbol: order.symbol,
              action: order.action,
              quantity: order.filled_quantity || order.quantity,
              price: brokerOrder.averageprice,
            }));
          }
        }
      } catch (err) {
        console.error(`[OrderTracker] Failed to poll connection ${connId}:`, err.message);
      }
    }
  }

  private mapStatus(angelStatus: string): string {
    const map: Record<string, string> = {
      'open': 'OPEN',
      'pending': 'OPEN',
      'trigger pending': 'OPEN',
      'complete': 'EXECUTED',
      'cancelled': 'CANCELLED',
      'rejected': 'REJECTED',
      'after market order req received': 'AMO_SUBMITTED',
    };
    return map[angelStatus.toLowerCase()] || 'OPEN';
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }
}
```

#### 2.4 Modify placeOrder() to persist order

**Modify:** `services/broker-service/src/services/broker.service.ts`

```typescript
async placeOrder(userId: string, dto: PlaceOrderDTO): Promise<OrderResponse> {
  // ... existing validation + token resolution ...

  const result = await this.angelOne.placeOrder(accessToken, { ... });

  // Persist order to history (NEW)
  const order = await this.orderRepo.create({
    user_id: userId,
    connection_id: dto.connectionId,
    broker_order_id: result.orderId,
    symbol: dto.symbol,
    exchange: dto.exchange,
    action: dto.action,
    order_type: dto.orderType,
    product_type: dto.productType || 'DELIVERY',
    quantity: dto.quantity,
    price: dto.price || 0,
    status: 'PLACED',
    source: 'live',
  });

  return {
    orderId: order.id,           // our internal ID
    brokerOrderId: result.orderId,
    status: 'PLACED',
    message: 'Order placed successfully.',
  };
}
```

#### 2.5 Add order REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/broker/orders` | List user's orders (paginated, newest first) |
| `GET` | `/broker/orders/:orderId` | Get single order with full status |
| `GET` | `/broker/orders/stats` | Order counts by status (PLACED, EXECUTED, etc.) |
| `DELETE` | `/broker/orders/:orderId/cancel` | Cancel a pending order via Angel One API |

---

## Block 3: Paper Trading Mode

### What's missing
A simulated trading mode that lets users test strategies without real money.

### Tasks

#### 3.1 Add paper trading config to user profile

**New migration:** `services/user-service/migrations/20260317000001_add_paper_trading.ts`

```sql
ALTER TABLE users.profiles ADD COLUMN paper_trading BOOLEAN DEFAULT false;
```

#### 3.2 Implement paper order execution

**New file:** `services/broker-service/src/services/paper-trading.service.ts`

```
Responsibilities:
├── placePaperOrder(userId, dto):
│   ├── Resolve symbol token (reuse SymbolMasterService)
│   ├── Fetch current price from market-data-service Redis cache
│   ├── Simulate fill:
│   │   ├── MARKET order → fill at current LTP
│   │   ├── LIMIT order → fill at limit price if LTP matches
│   │   └── SL order → queue and fill when price hits trigger
│   ├── Write to broker.order_history with source='paper'
│   ├── Update portfolio holdings (add/reduce position)
│   └── Publish `order:executed` event (same as real)
├── getPaperBalance(userId):
│   ├── Default starting balance: ₹10,00,000
│   ├── Track cash available after paper trades
│   └── Return { cash, invested, totalValue }
└── resetPaperAccount(userId):
    ├── Delete all paper orders
    ├── Delete paper holdings
    └── Reset balance to ₹10,00,000
```

#### 3.3 Add paper trading table

**New migration:** `services/broker-service/migrations/20260317000003_create_paper_account.ts`

```sql
CREATE TABLE broker.paper_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE,
  cash        DECIMAL(14,2) DEFAULT 1000000.00,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.4 Route paper vs live orders in placeOrder()

**Modify:** `services/broker-service/src/services/broker.service.ts`

```typescript
async placeOrder(userId: string, dto: PlaceOrderDTO): Promise<OrderResponse> {
  // Check if user has paper trading enabled
  const isPaper = await this.isPaperTradingEnabled(userId);

  if (isPaper) {
    return this.paperTrading.placePaperOrder(userId, dto);
  }

  // ... existing live order logic ...
}

private async isPaperTradingEnabled(userId: string): Promise<boolean> {
  try {
    const { data } = await axios.get(
      `${config.userServiceUrl}/api/v1/users/profile`,
      { headers: { 'x-user-id': userId }, timeout: 3000 }
    );
    return data.data?.paperTrading ?? false;
  } catch {
    return false;
  }
}
```

#### 3.5 Add REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/broker/paper/balance` | Get paper trading balance |
| `POST` | `/broker/paper/reset` | Reset paper account to ₹10L |
| `PATCH` | `/users/profile` | Update `paperTrading: true/false` (existing endpoint) |

---

## Block 4: Frontend - Order Placement & History

### Tasks

#### 4.1 Create OrderPage component

**New file:** `frontend/src/features/orders/pages/OrderPage.tsx`

```
Layout:
├── Order Placement Form (top)
│   ├── Symbol search (autocomplete from /broker/symbols/search)
│   ├── Exchange selector (NSE/BSE)
│   ├── Action toggle (BUY / SELL)
│   ├── Order type selector (MARKET / LIMIT / SL / SL-M)
│   ├── Quantity input
│   ├── Price input (disabled for MARKET)
│   ├── Product type (DELIVERY / INTRADAY)
│   ├── Live LTP display (from useMarketTicks)
│   ├── Estimated cost/proceeds
│   └── Place Order button (with confirmation dialog)
├── Pending Orders (middle)
│   ├── Table: symbol, action, qty, price, status, time
│   ├── Auto-refresh every 10s
│   ├── Cancel button for pending orders
│   └── Status badge (color-coded)
└── Order History (bottom)
    ├── Paginated table of all past orders
    ├── Filter by: status, date range, symbol
    ├── Action column: details button
    └── Show filled price, rejection reason
```

#### 4.2 Create SymbolSearch component

**New file:** `frontend/src/components/SymbolSearch.tsx`

```
Features:
├── Debounced search input (300ms)
├── Calls GET /broker/symbols/search?q=...
├── Dropdown with results: symbol, exchange, instrument type
├── On select: fill symbol + exchange + show LTP
└── Show recent searches (localStorage)
```

#### 4.3 Create order store

**New file:** `frontend/src/stores/order.store.ts`

```typescript
interface OrderState {
  orders: Order[];
  pendingCount: number;
  isLoading: boolean;
  isPlacing: boolean;

  fetchOrders: (page?: number) => Promise<void>;
  placeOrder: (dto: PlaceOrderDTO) => Promise<OrderResponse>;
  cancelOrder: (orderId: string) => Promise<void>;
  fetchStats: () => Promise<OrderStats>;
}
```

#### 4.4 Add paper trading toggle to Settings

**Modify:** `frontend/src/features/settings/pages/SettingsPage.tsx`

```
Add section:
├── "Trading Mode" card
│   ├── Toggle switch: Live / Paper
│   ├── Warning text for Live mode
│   ├── Paper balance display (₹X available)
│   └── Reset paper account button
```

#### 4.5 Add navigation and routing

**Modify:** `frontend/src/layouts/DashboardLayout.tsx` — add nav item:
```typescript
{ to: '/orders', label: 'Orders', icon: ShoppingCart }
```

**Modify:** `frontend/src/App.tsx` — add route:
```typescript
<Route path="/orders" element={<OrderPage />} />
```

#### 4.6 Add order placement from Recommendations page

**Modify:** `frontend/src/features/recommendations/pages/RecommendationsPage.tsx`

```
Each signal card gets a "Trade" button:
├── Pre-fills the order form with signal's symbol, exchange, action
├── Navigates to /orders with query params
└── User reviews and confirms before placing
```

---

## Block 5: Kubernetes & Config Updates

### Tasks

#### 5.1 Update configmaps

| Service | New Env Vars |
|---------|-------------|
| broker-service | `USER_SERVICE_URL`, `MARKET_DATA_SERVICE_URL`, `ANGEL_SCRIP_MASTER_URL` |
| user-service | *(no new vars — just migration)* |

#### 5.2 Add dependencies

```bash
npm install node-cron --workspace=services/broker-service
npm install @types/node-cron -D --workspace=services/broker-service
```

#### 5.3 Update API gateway proxy routes

**Modify:** `services/api-gateway/src/config/index.ts` — ensure new broker routes are proxied:

| Route | Target |
|-------|--------|
| `/broker/symbols/*` | broker-service:3003 |
| `/broker/orders/*` | broker-service:3003 |
| `/broker/paper/*` | broker-service:3003 |

---

## Implementation Sequence

### Week 1: Symbol Resolution & Order Infrastructure

| Day | Task | Service | Deliverable |
|-----|------|---------|-------------|
| 1 | Symbol master migration + service | broker-service | Token lookup working |
| 1 | Fetch/parse Angel One ScripMaster | broker-service | `broker.symbol_master` populated |
| 2 | Wire resolveToken into placeOrder | broker-service | Orders have valid symbol tokens |
| 2 | Symbol search endpoint | broker-service | Autocomplete API ready |
| 3 | Order history migration + repository | broker-service | `broker.order_history` table ready |
| 3 | Persist orders in placeOrder() | broker-service | Orders saved to DB |
| 4 | OrderTracker worker | broker-service | Pending orders polled every 30s |
| 4 | Cancel order endpoint | broker-service | Users can cancel pending orders |
| 5 | Order REST endpoints + integration test | broker-service | Full order CRUD working |

### Week 2: Paper Trading & Frontend

| Day | Task | Service | Deliverable |
|-----|------|---------|-------------|
| 1 | Paper trading service + migration | broker-service | Simulated fills at market price |
| 1 | Paper account balance tracking | broker-service | Cash/invested/total calculation |
| 2 | Paper trading toggle in user profile | user-service | `paper_trading` flag persisted |
| 2 | Route paper vs live in placeOrder() | broker-service | Seamless mode switching |
| 3 | SymbolSearch component | frontend | Autocomplete UI with LTP |
| 3 | OrderPage component | frontend | Place + view orders UI |
| 4 | Order store + paper trading settings | frontend | Full state management |
| 4 | Trade button on recommendations | frontend | Signal → order flow |
| 5 | E2E testing in k3d cluster | all | Paper order flow end-to-end |

---

## Verification Checklist

### Symbol Resolution
- [ ] `broker.symbol_master` table has 2000+ NSE EQ symbols
- [ ] `GET /broker/symbols/search?q=RELI` returns RELIANCE with correct token
- [ ] `GET /broker/symbols/NSE/RELIANCE` returns full symbol info
- [ ] ScripMaster refresh runs daily at 8 AM IST
- [ ] Redis cache hit for frequently-used symbols

### Order Placement
- [ ] `POST /broker/orders` places order with resolved symbol token
- [ ] Order persisted in `broker.order_history` with status PLACED
- [ ] Angel One receives correct `symboltoken` and `tradingsymbol`
- [ ] OrderTracker polls and updates status to EXECUTED
- [ ] `order:executed` event published to Redis
- [ ] Notification-service creates notification on fill
- [ ] Cancel order works for pending orders

### Order History
- [ ] `GET /broker/orders` returns paginated order list
- [ ] `GET /broker/orders/stats` returns correct counts
- [ ] Orders show filled quantity, avg price, rejection reason
- [ ] Frontend OrderPage displays orders with status badges

### Paper Trading
- [ ] Paper mode toggle persists in user profile
- [ ] Paper orders fill at current LTP from Redis
- [ ] Paper balance decremented on BUY, incremented on SELL
- [ ] Paper orders appear in order history with source='paper'
- [ ] Paper account reset clears all paper data
- [ ] No real Angel One API calls in paper mode

### Frontend
- [ ] Symbol search autocomplete works with debouncing
- [ ] Order form validates all fields before submission
- [ ] Confirmation dialog shows before order placement
- [ ] Pending orders table auto-refreshes
- [ ] Trade button on recommendations pre-fills order form
- [ ] Paper/Live mode indicator visible in UI
- [ ] Settings page shows paper trading toggle + balance

---

## Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ScripMaster JSON is ~50MB | Slow download, high memory | Stream-parse with JSONStream; cache locally; only import EQ + top F&O |
| Angel One order book API rate limits | Status polling throttled | Batch poll all orders in single API call; increase interval to 60s if rate-limited |
| Angel One order format changes | Orders rejected | Log full request/response; add validation before sending; alerting on rejection spikes |
| Paper trading P&L doesn't match real fills | Unrealistic simulation | Use bid-ask spread simulation (±0.1%); add slippage model for large quantities |
| Symbol token changes (corporate actions) | Wrong token sent | Daily master refresh catches changes; add stale-token detection (reject → re-resolve → retry) |
| Order confirmation UX | Accidental orders | Require explicit confirmation dialog; show estimated cost; add daily order limit |

---

## Files Changed / Created Summary

### New Files
```
services/broker-service/migrations/20260317000001_create_symbol_master.ts
services/broker-service/migrations/20260317000002_create_order_history.ts
services/broker-service/migrations/20260317000003_create_paper_account.ts
services/broker-service/src/services/symbol-master.service.ts
services/broker-service/src/services/paper-trading.service.ts
services/broker-service/src/repositories/order.repository.ts
services/broker-service/src/repositories/symbol-master.repository.ts
services/broker-service/src/workers/order-tracker.ts
services/broker-service/src/controllers/order.controller.ts
services/broker-service/src/controllers/symbol.controller.ts
services/broker-service/src/routes/order.routes.ts
services/broker-service/src/routes/symbol.routes.ts
services/user-service/migrations/20260317000001_add_paper_trading.ts
frontend/src/features/orders/pages/OrderPage.tsx
frontend/src/components/SymbolSearch.tsx
frontend/src/stores/order.store.ts
```

### Modified Files
```
services/broker-service/src/services/broker.service.ts        ← token resolution + order persistence + paper routing
services/broker-service/src/server.ts                         ← wire OrderTracker + SymbolMaster scheduler
services/broker-service/src/config/index.ts                   ← add userServiceUrl, marketDataServiceUrl, scripMasterUrl
services/broker-service/src/routes/broker.routes.ts           ← mount order + symbol routes
services/user-service/src/repositories/user.repository.ts     ← add paperTrading to profile queries
services/api-gateway/src/config/index.ts                      ← add symbol/order/paper proxy routes
frontend/src/App.tsx                                          ← add /orders route
frontend/src/layouts/DashboardLayout.tsx                      ← add Orders nav item
frontend/src/features/recommendations/pages/RecommendationsPage.tsx ← add Trade button
frontend/src/features/settings/pages/SettingsPage.tsx         ← add paper trading toggle
k8s/base/services/broker-service/configmap.yaml              ← add USER_SERVICE_URL, MARKET_DATA_SERVICE_URL
```

---

## API Reference (New Endpoints)

### Symbol Endpoints
```
GET  /api/v1/broker/symbols/search?q=RELI&exchange=NSE
     → { success: true, data: [{ symbol, exchange, token, tradingSymbol, instrumentType, lotSize }] }

GET  /api/v1/broker/symbols/:exchange/:symbol
     → { success: true, data: { symbol, exchange, token, tradingSymbol, instrumentType, lotSize, tickSize } }

POST /api/v1/broker/symbols/sync
     → { success: true, data: { total: 5200, updated: 128 } }
```

### Order Endpoints
```
POST   /api/v1/broker/orders
       Body: { connectionId, symbol, exchange, action, orderType, quantity, price?, productType? }
       → { success: true, data: { orderId, brokerOrderId, status: 'PLACED' } }

GET    /api/v1/broker/orders?page=1&limit=20&status=EXECUTED
       → { success: true, data: [Order], meta: { page, limit, total } }

GET    /api/v1/broker/orders/:orderId
       → { success: true, data: Order }

GET    /api/v1/broker/orders/stats
       → { success: true, data: { placed: 2, executed: 15, cancelled: 1, rejected: 0 } }

DELETE /api/v1/broker/orders/:orderId/cancel
       → { success: true, message: 'Order cancelled' }
```

### Paper Trading Endpoints
```
GET  /api/v1/broker/paper/balance
     → { success: true, data: { cash: 850000, invested: 150000, totalValue: 1020000 } }

POST /api/v1/broker/paper/reset
     → { success: true, message: 'Paper account reset to ₹10,00,000' }
```
