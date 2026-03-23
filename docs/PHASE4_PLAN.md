# Phase 4: Analytics & Intelligence - Implementation Plan

> Status: Planning | Target: 2 weeks

---

## Objective

Enable **portfolio analytics, P&L reporting, and enhanced dashboards**: sector allocation → diversification scoring → daily P&L tracking → interactive charts → portfolio performance history.

Phase 1 established data pipelines, Phase 3 enabled trading. Phase 4 gives users visibility into **how their portfolio is performing** with actionable analytics.

---

## Current State vs Target State

```
CURRENT:
  portfolio-service:
    ├── getHoldings() returns holdings with P&L           ✅
    ├── No sector/industry classification                 ❌
    ├── No historical P&L tracking                        ❌
    ├── No portfolio snapshots over time                  ❌
    └── No analytics endpoints                            ❌

  frontend:
    ├── PortfolioPage shows holdings table                ✅
    ├── Dashboard shows total value + top holdings        ✅
    ├── No allocation charts                              ❌
    ├── No P&L history chart                              ❌
    └── No analytics dashboard                            ❌

TARGET:
  Sector Master ──► Holdings classified by sector/industry
       │
       ▼
  Portfolio Snapshots (daily) ──► P&L history over time
       │                              │
       ▼                              ▼
  Sector Allocation API          P&L Report API
       │                              │
       ▼                              ▼
  Pie Chart (frontend)          Line Chart (frontend)

  Analytics Dashboard:
    ├── Sector allocation pie chart
    ├── P&L performance line chart (7d / 30d / 90d / 1y)
    ├── Top gainers & losers cards
    ├── Diversification score (0–100)
    ├── Risk metrics (beta, volatility)
    └── Day-over-day P&L breakdown table
```

---

## Block 1: Sector Classification

### Service: portfolio-service (Port 3005)

### What exists
- Holdings have symbol + exchange but no sector/industry metadata

### What's missing
A sector mapping for NSE/BSE symbols to classify holdings.

### Tasks

#### 1.1 Create sector master table

**New migration:** `services/portfolio-service/migrations/20260319000001_create_sector_master.ts`

```sql
CREATE TABLE portfolio.sector_master (
  symbol          VARCHAR(50) NOT NULL,
  exchange        VARCHAR(10) NOT NULL,
  sector          VARCHAR(100) NOT NULL,    -- IT, Banking, Pharma, etc.
  industry        VARCHAR(100),             -- Software Services, Private Banks, etc.
  market_cap      VARCHAR(20),             -- LARGE, MID, SMALL
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, exchange)
);
```

#### 1.2 Seed sector data

Seed sector data for tracked symbols from a static mapping (top 50 NSE stocks). The service will have a built-in map that can be extended.

#### 1.3 Create SectorService

```
Responsibilities:
├── getSectorForSymbol(symbol, exchange) → { sector, industry, marketCap }
├── classifyHoldings(holdings) → holdings with sector/industry attached
├── getSectorAllocation(userId) → { sector, weight%, value }[]
└── getDiversificationScore(userId) → 0–100 score
```

---

## Block 2: Portfolio Snapshots & P&L History

### What's missing
No daily snapshots of portfolio state → can't show P&L over time.

### Tasks

#### 2.1 Create portfolio snapshots table

**New migration:** `services/portfolio-service/migrations/20260319000002_create_portfolio_snapshots.ts`

```sql
CREATE TABLE portfolio.snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  date        DATE NOT NULL,
  total_value DECIMAL(14,2) NOT NULL,
  total_cost  DECIMAL(14,2) NOT NULL,
  total_pnl   DECIMAL(14,2) NOT NULL,
  pnl_percent DECIMAL(8,4) NOT NULL,
  holdings    JSONB NOT NULL,              -- snapshot of each holding's state
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX idx_snapshots_user_date ON portfolio.snapshots (user_id, date DESC);
```

#### 2.2 Snapshot worker

Daily at 4:00 PM IST (after market close), take a snapshot of each user's portfolio:

```
For each user with holdings:
├── Fetch current portfolio state (holdings + live prices)
├── Calculate total value, cost basis, P&L
├── Store as snapshot with date
└── Skip if snapshot already exists for today
```

#### 2.3 P&L report endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/portfolio/analytics/pnl?period=30d` | Daily P&L over period |
| `GET` | `/portfolio/analytics/allocation` | Sector allocation breakdown |
| `GET` | `/portfolio/analytics/summary` | Diversification score, risk metrics, top gainers/losers |
| `GET` | `/portfolio/analytics/snapshots?from=&to=` | Raw snapshot data |

---

## Block 3: Analytics Service Logic

### Tasks

#### 3.1 Analytics methods

```typescript
class AnalyticsService {
  // P&L over time from snapshots
  getPnlHistory(userId, period): { date, totalValue, totalPnl, pnlPercent }[]

  // Sector weights from current holdings
  getSectorAllocation(userId): { sector, value, weight, holdings: number }[]

  // Top gainers/losers from current holdings
  getTopMovers(userId): { gainers: Holding[], losers: Holding[] }

  // Portfolio health score
  getAnalyticsSummary(userId): {
    diversificationScore: number,    // 0-100 based on sector spread
    totalValue: number,
    totalPnl: number,
    dayChange: number,               // today vs yesterday
    dayChangePct: number,
    topGainers: Holding[],
    topLosers: Holding[],
    holdingCount: number,
    sectorCount: number,
  }
}
```

#### 3.2 Diversification scoring algorithm

```
Score = 100 - HHI_normalized

HHI = Σ(weight_i²) where weight_i = holding_value / total_value
HHI_normalized = (HHI - 1/N) / (1 - 1/N) * 100

Bonus:
  +10 for 3+ sectors
  +5 for balanced large/mid cap mix
  -20 for single stock > 50% allocation

Clamp to 0-100
```

---

## Block 4: Frontend Analytics Dashboard

### Tasks

#### 4.1 Create AnalyticsPage

**New file:** `frontend/src/features/analytics/pages/AnalyticsPage.tsx`

```
Layout:
├── Summary Cards (top row)
│   ├── Total Value
│   ├── Total P&L (with % and color)
│   ├── Day Change
│   └── Diversification Score (gauge)
├── P&L Performance Chart (middle)
│   ├── Line chart: portfolio value over time
│   ├── Period selector: 7d, 30d, 90d, 1y
│   └── Hover tooltip with exact values
├── Sector Allocation (bottom left)
│   ├── Donut/pie chart
│   └── Legend with sector names + weights
├── Top Movers (bottom right)
│   ├── Top 3 gainers (green)
│   └── Top 3 losers (red)
└── Day-wise P&L Table (expandable)
    ├── Date, value, change, change%
    └── Color-coded rows
```

#### 4.2 Add chart library

Use `recharts` (already compatible with React 19, lightweight, no TradingView dependency):

```
Charts needed:
├── LineChart → P&L history
├── PieChart → Sector allocation
└── BarChart → Daily P&L breakdown
```

#### 4.3 Create analytics store

**New file:** `frontend/src/stores/analytics.store.ts`

```typescript
interface AnalyticsState {
  summary: AnalyticsSummary | null;
  pnlHistory: PnlDataPoint[];
  allocation: SectorAllocation[];
  period: '7d' | '30d' | '90d' | '1y';
  isLoading: boolean;

  fetchSummary: () => Promise<void>;
  fetchPnlHistory: (period) => Promise<void>;
  fetchAllocation: () => Promise<void>;
  setPeriod: (period) => void;
}
```

#### 4.4 Add navigation and routing

- Add nav item: `{ to: '/analytics', label: 'Analytics', icon: BarChart3 }`
- Add route: `<Route path="/analytics" element={<AnalyticsPage />} />`

---

## Block 5: Enhance Dashboard with Analytics

### Tasks

#### 5.1 Add mini analytics to DashboardPage

- Day change card (from analytics summary)
- Mini P&L sparkline (last 7 days)
- Diversification score badge

---

## Implementation Sequence

### Week 1: Backend Analytics

| Day | Task | Service | Deliverable |
|-----|------|---------|-------------|
| 1 | Sector master table + seed data | portfolio-service | Sector classification ready |
| 1 | Sector classification service | portfolio-service | Holdings classified |
| 2 | Portfolio snapshots table + worker | portfolio-service | Daily snapshots captured |
| 2 | P&L history calculation | portfolio-service | Historical P&L queryable |
| 3 | Analytics endpoints (allocation, pnl, summary) | portfolio-service | Full analytics API |
| 3 | Diversification score algorithm | portfolio-service | Health scoring |
| 4 | API gateway proxy (already handled) | api-gateway | Routes work |
| 5 | Integration testing | all | Analytics data flowing |

### Week 2: Frontend Charts

| Day | Task | Service | Deliverable |
|-----|------|---------|-------------|
| 1 | Install recharts + analytics store | frontend | State management ready |
| 1 | AnalyticsPage layout + summary cards | frontend | Basic page renders |
| 2 | P&L line chart with period selector | frontend | Interactive chart |
| 2 | Sector allocation pie chart | frontend | Allocation visualization |
| 3 | Top movers + daily P&L table | frontend | Complete analytics view |
| 3 | Dashboard enhancements | frontend | Mini analytics on home |
| 4 | Navigation + routing | frontend | /analytics accessible |
| 5 | Polish + responsive design | frontend | Mobile-friendly |

---

## Verification Checklist

### Sector Classification
- [ ] `portfolio.sector_master` seeded with 50+ NSE symbols
- [ ] Holdings enriched with sector/industry on fetch
- [ ] Allocation endpoint returns correct sector weights

### Portfolio Snapshots
- [ ] Daily snapshots created at 4 PM IST
- [ ] No duplicate snapshots for same user+date
- [ ] Historical P&L queryable for 7d/30d/90d/1y

### Analytics API
- [ ] `GET /portfolio/analytics/summary` returns complete summary
- [ ] `GET /portfolio/analytics/pnl?period=30d` returns daily data points
- [ ] `GET /portfolio/analytics/allocation` returns sector breakdown
- [ ] Diversification score ranges 0–100 correctly

### Frontend
- [ ] AnalyticsPage renders all charts
- [ ] P&L chart responds to period selector
- [ ] Pie chart shows sector allocation with legends
- [ ] Top movers cards display correctly
- [ ] Dashboard shows mini analytics
- [ ] Mobile responsive

---

## Files Changed / Created Summary

### New Files
```
services/portfolio-service/migrations/20260319000001_create_sector_master.ts
services/portfolio-service/migrations/20260319000002_create_portfolio_snapshots.ts
services/portfolio-service/src/repositories/sector.repository.ts
services/portfolio-service/src/repositories/snapshot.repository.ts
services/portfolio-service/src/services/analytics.service.ts
services/portfolio-service/src/services/sector.service.ts
services/portfolio-service/src/controllers/analytics.controller.ts
services/portfolio-service/src/routes/analytics.routes.ts
services/portfolio-service/src/workers/snapshot.worker.ts
frontend/src/features/analytics/pages/AnalyticsPage.tsx
frontend/src/stores/analytics.store.ts
```

### Modified Files
```
services/portfolio-service/src/app.ts                    ← mount analytics routes
services/portfolio-service/src/server.ts                 ← wire snapshot worker
services/portfolio-service/src/services/portfolio.service.ts ← enrich holdings with sector
frontend/src/App.tsx                                     ← add /analytics route
frontend/src/layouts/DashboardLayout.tsx                 ← add Analytics nav item
frontend/src/features/dashboard/pages/DashboardPage.tsx  ← add mini analytics
```
