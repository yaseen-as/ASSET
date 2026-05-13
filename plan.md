# SwingTrade V2 — ML Recommendation Platform Implementation Plan

> **Goal:** Evolve the existing rule-based `SignalGeneratorService` into a multi-model ML platform combining technical, fundamental, and sentiment signals through a meta-model ranking system — without breaking the current single-stack monorepo deployment.

---

## 1. Executive Summary

| Aspect | Current (V1) | Target (V2) |
|--------|--------------|-------------|
| Signals | Rule engine (RSI/MACD thresholds) | LightGBM ML models + meta-ranker |
| Services | 3 (api-gateway, core, insights) | 5–7 (+ feature, recommendation, backtest, optional sentiment/fundamentals) |
| Storage | Two PG DBs (`core_db`, `insights_db`) | + `recommendations` schema with feature store, model registry, backtest results |
| Inference | In-process JS rule eval | onnxruntime-node loading versioned ONNX models from PG-tracked registry |
| Training | None | Python pipeline (pandas + LightGBM) → ONNX export → registered in PG |
| Async | Synchronous on-request | BullMQ (Redis) job queues for scoring + backtests + retrain |
| Backtest | None | Walk-forward simulation service with Sharpe / max DD / win rate |

**Non-goals:** Live trading execution, intraday HFT, real-time streaming ingestion, multi-broker support. V2 stays as **end-of-day swing-trade scoring**.

---

## 2. Phased Rollout

Each phase is independently shippable and reversible. No phase requires deleting V1 — the rule engine stays online as a fallback until the meta-model is graduated.

### Phase 1 — ML Foundation (2–3 weeks)
**Deliverables:**
- New `recommendations` schema in `insights_db` (feature store, model registry, scores)
- Python training pipeline in `ml/` (separate, not a deployed service)
- First LightGBM technical model trained on existing OHLCV
- ONNX export + onnxruntime-node inference inside `insights-service`
- Feature flag `RECOMMENDATION_ENGINE=rule|ml-technical` to toggle

**Exit criteria:** ML model produces `technical_score` for at least the top 50 NSE symbols and is queryable via existing `/v1/recommendations/*` endpoints.

### Phase 2 — Service Split + Feature Store (2 weeks)
**Deliverables:**
- Extract `recommendation-service` from `insights-service` (own port 3005, own deployment)
- Extract `feature-service` (port 3006) — owns the feature store and materialization jobs
- BullMQ queue for async scoring (`score-symbol` job)
- Redis caching layer for features (point-in-time keys: `feat:{symbol}:{date}`)

**Exit criteria:** Recommendation request triggers async pipeline (cache → feature-service → recommendation-service → result published to Redis pub/sub for SSE polling).

### Phase 3 — Backtest + Multi-Model (2–3 weeks)
**Deliverables:**
- `backtest-service` with walk-forward simulator (port 3007)
- Strategy framework: stop-loss/take-profit/holding-period configurable per run
- Backtest results table with Sharpe, max DD, win rate, CAGR
- Optional `fundamentals-service` consuming Upstox fundamentals (PE, EPS, ROE)
- Fundamental LightGBM model + `fundamental_score`

**Exit criteria:** Frontend can trigger a backtest run via API and view aggregated metrics. Two models (technical + fundamental) produce independent scores.

### Phase 4 — Sentiment + Meta-Model (2 weeks)
**Deliverables:**
- Optional `sentiment-service` with VADER (Python sidecar) for news headlines
- Meta-model (LightGBM classifier) combining technical/fundamental/sentiment scores → `final_score`
- Cron-based daily retrain pipeline (Jenkins job → Python container → ONNX upload → PG registry insert)

**Exit criteria:** Meta-model in production, ranks top-N symbols daily, beats rule engine on backtest Sharpe.

### Phase 5 — Production Hardening (1–2 weeks)
**Deliverables:**
- Model versioning rollout strategy (canary 10% → 50% → 100%)
- A/B test framework (route % of users to model B, log outcomes)
- Prometheus metrics + Grafana dashboards
- Automated retraining trigger on drift detection (feature distribution shift)

---

## 3. Target Architecture

### 3.1 Service Topology

```
                          ┌──────────────┐
                          │  Frontend    │
                          │  (React)     │
                          └───────┬──────┘
                                  │ HTTPS
                          ┌───────▼──────┐
                          │ api-gateway  │ port 3000 — JWT, rate limit, routing
                          └───┬──────┬───┘
              ┌───────────────┘      └───────────────┐
              │                                      │
       ┌──────▼──────┐                       ┌───────▼─────────┐
       │ core-service│ 3001                  │ insights-service │ 3004
       │ auth/users  │                       │ quotes/OHLCV     │
       │ broker/port │                       │ (market only)    │
       │ engagement  │                       └───┬──────────────┘
       └──────┬──────┘                           │ HTTP
              │                                  │
              │       ┌──────────────────────────▼─────┐
              │       │     feature-service      3006  │ ← NEW
              │       │  • feature store CRUD          │
              │       │  • point-in-time queries       │
              │       │  • materialization cron        │
              │       └─────┬──────────────────────────┘
              │             │
              │             │ pub/sub (Redis) + HTTP
              │             │
              │       ┌─────▼──────────────────────────┐
              │       │  recommendation-service  3005  │ ← NEW
              │       │  • onnxruntime-node inference  │
              │       │  • technical / fundamental /   │
              │       │    sentiment / meta scoring    │
              │       │  • BullMQ workers              │
              │       └─────┬──────────────────────────┘
              │             │
              │             │ trigger
              │       ┌─────▼──────────────────────────┐
              │       │  backtest-service        3007  │ ← NEW
              │       │  • walk-forward simulator      │
              │       │  • Sharpe / DD / win rate      │
              │       └────────────────────────────────┘
              │
              │       ┌────────────────────────────────┐
              │       │  sentiment-service       3008  │ ← OPTIONAL
              │       │  • VADER (now)                 │
              │       │  • FinBERT (future)            │
              │       └────────────────────────────────┘
              │
              │       ┌────────────────────────────────┐
              └──────►│  fundamentals-service    3009  │ ← OPTIONAL
                      │  • PE/EPS/ROE pull from broker │
                      └────────────────────────────────┘

   Data plane:
   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐
   │ PostgreSQL   │   │ Redis        │   │ Object store (optional)  │
   │ core_db      │   │ • cache      │   │ S3 / MinIO for raw model │
   │ insights_db  │   │ • BullMQ     │   │ binaries — registry      │
   │   ↳ recos    │   │ • pub/sub    │   │ stores URI only          │
   └──────────────┘   └──────────────┘   └──────────────────────────┘
```

### 3.2 Service Responsibilities

| Service | Owns | Calls | Stateless? |
|---------|------|-------|------------|
| api-gateway | JWT verify, rate limit, proxy | all | Yes |
| core-service | auth, profile, broker, portfolio, alerts | broker (Upstox), insights | Yes (DB-backed) |
| insights-service | quote/OHLCV/indicator endpoints (NO recos in V2) | core (broker bridge) | Yes |
| **feature-service** | feature store CRUD, materialization, lineage | insights, fundamentals, sentiment | Partially (Redis) |
| **recommendation-service** | model loading, inference, ranking, BullMQ workers | feature-service | Worker pool |
| **backtest-service** | walk-forward sim, performance metrics | feature-service, recommendation-service | Long-running jobs |
| **sentiment-service** *(opt)* | VADER/FinBERT scoring | external news API | Yes |
| **fundamentals-service** *(opt)* | fundamentals sync, PE/EPS storage | core (broker bridge) | Yes |

### 3.3 Event Flow — Daily Scoring Pipeline

```
00:30 IST  Jenkins cron  →  feature-service /materialize?date=today
                              ├─ pull OHLCV from insights-service
                              ├─ compute indicators (RSI, MACD, returns, etc.)
                              ├─ pull fundamentals (if enabled)
                              ├─ pull sentiment (if enabled)
                              └─ upsert into feature_store with point-in-time key

00:45 IST  feature-service publishes "features-ready" on Redis pub/sub
                              ↓
           recommendation-service worker pool picks up
                              ├─ batch query feature_store for all symbols
                              ├─ run technical ONNX model → technical_score
                              ├─ run fundamental ONNX model → fundamental_score
                              ├─ run meta ONNX model on the three scores → final_score
                              └─ upsert into recommendations.final_scores

01:00 IST  Done. Frontend polls /v1/recommendations?date=today and gets ranked list.
```

### 3.4 Event Flow — Backtest

```
User clicks "Run Backtest"
   ↓
POST /v1/backtest/runs { model_id, start, end, params }
   ↓
api-gateway → backtest-service
   ↓
backtest-service enqueues BullMQ job, returns job_id immediately (202)
   ↓
worker pulls historical features (point-in-time) from feature-service
   ↓
walk-forward loop:
   for each day d in [start, end]:
     features_d = feature_store.get(d)
     predictions_d = recommendation-service.score(features_d, model_id)
     simulate trades with stop-loss / take-profit
   ↓
aggregate metrics → upsert into recommendations.backtest_results
   ↓
publish "backtest:done:{job_id}" on Redis pub/sub
   ↓
frontend SSE/polling picks up result
```

---

## 4. Database Schema (`insights_db.recommendations`)

All ML-related tables live in a new `recommendations` schema inside `insights_db`. Migrations go in `services/recommendation-service/migrations/` once that service is split out, with the schema's Knex `migrations_tablename` set to `recommendations_knex_migrations`.

### 4.1 Feature Store

```sql
CREATE SCHEMA IF NOT EXISTS recommendations;

CREATE TABLE recommendations.feature_store (
  symbol         TEXT        NOT NULL,
  exchange       TEXT        NOT NULL,
  as_of_date     DATE        NOT NULL,
  feature_set    TEXT        NOT NULL,           -- e.g. 'technical_v1', 'fundamental_v1'
  features       JSONB       NOT NULL,           -- { rsi: 64.2, macd_hist: 0.34, ... }
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, exchange, as_of_date, feature_set)
) PARTITION BY RANGE (as_of_date);

-- Monthly partitions, created by a cron job 30 days in advance
CREATE TABLE recommendations.feature_store_2026_05 PARTITION OF recommendations.feature_store
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE INDEX idx_feature_store_lookup
  ON recommendations.feature_store (symbol, exchange, as_of_date DESC, feature_set);
```

**Point-in-time correctness** is enforced at write time: every row carries `as_of_date`, and all training/backtest queries filter on `as_of_date <= label_date - 1` to prevent leakage.

### 4.2 Score Tables

```sql
CREATE TABLE recommendations.technical_scores (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       TEXT        NOT NULL,
  exchange     TEXT        NOT NULL,
  as_of_date   DATE        NOT NULL,
  model_id     UUID        NOT NULL REFERENCES recommendations.model_registry(id),
  score        NUMERIC(6,4) NOT NULL,           -- probability 0–1
  features_ref JSONB       NOT NULL,            -- snapshot of features used
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, exchange, as_of_date, model_id)
);
CREATE INDEX idx_tech_scores_lookup ON recommendations.technical_scores (as_of_date DESC, score DESC);

-- Identical structure for fundamental_scores, sentiment_scores
-- Only column names change

CREATE TABLE recommendations.final_scores (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol             TEXT        NOT NULL,
  exchange           TEXT        NOT NULL,
  as_of_date         DATE        NOT NULL,
  meta_model_id      UUID        NOT NULL REFERENCES recommendations.model_registry(id),
  technical_score    NUMERIC(6,4),
  fundamental_score  NUMERIC(6,4),
  sentiment_score    NUMERIC(6,4),
  final_score        NUMERIC(6,4) NOT NULL,
  rank               INTEGER,                   -- daily rank, null until ranking job runs
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, exchange, as_of_date, meta_model_id)
);
CREATE INDEX idx_final_scores_rank ON recommendations.final_scores (as_of_date DESC, rank ASC);
```

### 4.3 Model Registry

```sql
CREATE TABLE recommendations.model_registry (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,            -- 'technical', 'fundamental', 'meta'
  version         TEXT        NOT NULL,            -- semver-ish: '1.0.3'
  framework       TEXT        NOT NULL,            -- 'lightgbm'
  artifact_uri    TEXT        NOT NULL,            -- file://, s3://, or PG large object ref
  feature_set     TEXT        NOT NULL,            -- maps to feature_store.feature_set
  training_data   JSONB       NOT NULL,            -- { rows, date_range, label_window }
  metrics         JSONB       NOT NULL,            -- { auc, precision, sharpe_oos, ... }
  status          TEXT        NOT NULL,            -- 'draft' | 'canary' | 'production' | 'retired'
  rollout_percent INTEGER     NOT NULL DEFAULT 0,  -- 0–100
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at     TIMESTAMPTZ,
  UNIQUE (name, version)
);

CREATE INDEX idx_model_registry_active ON recommendations.model_registry (name, status, rollout_percent)
  WHERE status IN ('canary', 'production');
```

### 4.4 Backtest Results

```sql
CREATE TABLE recommendations.backtest_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        UUID        NOT NULL REFERENCES recommendations.model_registry(id),
  start_date      DATE        NOT NULL,
  end_date        DATE        NOT NULL,
  params          JSONB       NOT NULL,            -- { stop_loss, take_profit, holding_days, top_n }
  sharpe_ratio    NUMERIC(8,4),
  max_drawdown    NUMERIC(6,4),
  win_rate        NUMERIC(6,4),
  cagr            NUMERIC(6,4),
  total_trades    INTEGER,
  equity_curve    JSONB,                            -- compact daily NAV array
  trades          JSONB,                            -- list of trade objects
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_backtest_results_model ON recommendations.backtest_results (model_id, created_at DESC);
```

### 4.5 Performance Logs (live model tracking)

```sql
CREATE TABLE recommendations.performance_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID        NOT NULL REFERENCES recommendations.model_registry(id),
  symbol        TEXT        NOT NULL,
  as_of_date    DATE        NOT NULL,             -- date prediction was made
  predicted     NUMERIC(6,4) NOT NULL,
  realized_5d   NUMERIC(8,4),                     -- actual 5-day return; null until d+5
  realized_10d  NUMERIC(8,4),
  realized_20d  NUMERIC(8,4),
  resolved_at   TIMESTAMPTZ
);
CREATE INDEX idx_perf_logs_model ON recommendations.performance_logs (model_id, as_of_date DESC);
```

A nightly job backfills `realized_*` once enough trading days have elapsed. Powers drift detection: compare `predicted` distribution week-over-week, alert on KS-test p-value < 0.01.

---

## 5. Folder Structure

### 5.1 Monorepo additions

```
asset_management/
├── services/
│   ├── api-gateway/             (existing — add /v1/feature, /v1/backtest routes)
│   ├── core-service/            (existing — no changes)
│   ├── insights-service/        (existing — strip recommendations/ in Phase 2)
│   ├── feature-service/         ← NEW
│   │   ├── src/
│   │   │   ├── feature-store/
│   │   │   │   ├── feature-store.controller.ts
│   │   │   │   ├── feature-store.service.ts
│   │   │   │   ├── feature-store.repository.ts
│   │   │   │   └── feature-store.routes.ts
│   │   │   ├── materialization/
│   │   │   │   ├── technical-features.builder.ts
│   │   │   │   ├── fundamental-features.builder.ts
│   │   │   │   ├── sentiment-features.builder.ts
│   │   │   │   └── materialization.cron.ts
│   │   │   ├── lineage/         (tracks which features fed which model run)
│   │   │   ├── config/
│   │   │   └── app.ts, server.ts
│   │   ├── migrations/
│   │   └── package.json
│   │
│   ├── recommendation-service/  ← NEW
│   │   ├── src/
│   │   │   ├── inference/
│   │   │   │   ├── onnx-loader.service.ts
│   │   │   │   ├── inference.service.ts
│   │   │   │   └── model-cache.ts
│   │   │   ├── scoring/
│   │   │   │   ├── technical-scorer.ts
│   │   │   │   ├── fundamental-scorer.ts
│   │   │   │   ├── sentiment-scorer.ts
│   │   │   │   └── meta-scorer.ts
│   │   │   ├── ranking/
│   │   │   ├── workers/
│   │   │   │   ├── score-symbol.worker.ts
│   │   │   │   └── daily-ranking.worker.ts
│   │   │   ├── registry/
│   │   │   │   ├── model-registry.service.ts
│   │   │   │   └── rollout.service.ts        (A/B + canary)
│   │   │   ├── api/
│   │   │   │   ├── recommendations.controller.ts
│   │   │   │   └── recommendations.routes.ts
│   │   │   ├── config/, app.ts, server.ts
│   │   ├── migrations/
│   │   └── package.json
│   │
│   ├── backtest-service/        ← NEW
│   │   ├── src/
│   │   │   ├── simulator/
│   │   │   │   ├── walk-forward.engine.ts
│   │   │   │   ├── trade.simulator.ts
│   │   │   │   ├── stop-loss.policy.ts
│   │   │   │   └── take-profit.policy.ts
│   │   │   ├── metrics/
│   │   │   │   ├── sharpe.ts
│   │   │   │   ├── max-drawdown.ts
│   │   │   │   ├── win-rate.ts
│   │   │   │   └── cagr.ts
│   │   │   ├── workers/
│   │   │   │   └── backtest.worker.ts
│   │   │   ├── api/, config/, app.ts, server.ts
│   │   ├── migrations/
│   │   └── package.json
│   │
│   ├── sentiment-service/       ← OPTIONAL (Python sidecar; see §6)
│   └── fundamentals-service/    ← OPTIONAL
│
├── packages/
│   ├── shared/                  (existing — add ML DTO types here)
│   └── ml-types/                ← NEW: shared ML interfaces (FeatureVector, ModelMeta, ScoreResult)
│
├── ml/                          ← NEW: Python training pipeline (NOT a deployed service)
│   ├── pyproject.toml
│   ├── pipelines/
│   │   ├── technical/
│   │   │   ├── extract.py
│   │   │   ├── transform.py
│   │   │   ├── labels.py            (forward-return labeling)
│   │   │   ├── train.py             (LightGBM)
│   │   │   ├── evaluate.py
│   │   │   └── export_onnx.py
│   │   ├── fundamental/             (mirror structure)
│   │   ├── meta/                    (mirror structure)
│   │   └── common/
│   │       ├── db.py                (psycopg2 helpers)
│   │       ├── walk_forward.py
│   │       └── registry.py          (writes to model_registry table)
│   ├── notebooks/                   (exploratory only — not in CI)
│   ├── tests/
│   └── Dockerfile                   (used by Jenkins retraining job)
│
└── helm/swingtrader/                (existing — add new service templates per service)
```

### 5.2 Clean architecture inside each service

```
src/
├── api/             — controllers, routes, request validation
├── domain/          — pure business logic, framework-agnostic
├── infrastructure/  — DB repos, Redis client, BullMQ queues, HTTP clients
├── workers/         — BullMQ job processors
└── config/          — env loader, logger, DI wiring
```

---

## 6. ML Training Pipeline (Python)

### 6.1 Pipeline shape

```
extract.py     pulls OHLCV + fundamentals from PG using point-in-time keys
       │
       ▼
transform.py   feature engineering: RSI, MACD hist, returns, vol, ATR, vol z-score, price/MA ratios
       │
       ▼
labels.py      forward-return labeling:
               y = 1 if (close[t+5] / close[t]) - 1 >= 0.03 else 0
               (3% gain in 5 trading days = positive swing trade)
       │
       ▼
walk_forward.py  splits: train [t-2y, t-3m], val [t-3m, t-1m], test [t-1m, t]
       │
       ▼
train.py       LightGBM classifier, early stopping on val AUC
       │
       ▼
evaluate.py    compute AUC, precision@K, lift, simulated Sharpe on test
       │
       ▼
export_onnx.py LightGBM → ONNX via onnxmltools, with explicit input shape
       │
       ▼
registry.py    upload .onnx to artifact store, insert model_registry row,
               status='draft'
```

### 6.2 Critical pitfalls to avoid

- **Look-ahead bias:** every feature must be computable at `as_of_date` using data dated `<= as_of_date`. The feature store enforces this; training queries must too.
- **Survivorship bias:** include delisted symbols in training data, otherwise model overestimates.
- **Label leakage:** never include `t+1` data in features for label `y_t`. Test by shifting label by 1 day; AUC should NOT drop materially — if it does, you have leakage.
- **Class imbalance:** typical positive rate is 20–30%. Use `is_unbalance=True` in LightGBM, evaluate on AUC and precision@K not accuracy.

### 6.3 ONNX export

```python
# ml/pipelines/technical/export_onnx.py
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType

n_features = len(feature_names)
initial_type = [('input', FloatTensorType([None, n_features]))]
onnx_model = convert_lightgbm(model, initial_types=initial_type, target_opset=13)
with open(out_path, 'wb') as f:
    f.write(onnx_model.SerializeToString())
```

### 6.4 Retraining cadence

| Model | Cadence | Trigger |
|-------|---------|---------|
| technical | weekly | cron + drift detection |
| fundamental | monthly | cron (fundamentals update slowly) |
| sentiment | weekly | cron |
| meta | weekly | after children retrain |

Retraining runs as a Jenkins job pulling the `ml/Dockerfile` image. On success it inserts a `draft` row in `model_registry`; promotion to `canary` is manual via a CLI script.

---

## 7. Node.js Inference (onnxruntime-node)

### 7.1 Model loading

```typescript
// services/recommendation-service/src/inference/onnx-loader.service.ts
import * as ort from 'onnxruntime-node';

interface LoadedModel {
  session: ort.InferenceSession;
  meta: ModelMeta;           // from model_registry table
}

class OnnxLoaderService {
  private cache = new Map<string, LoadedModel>();   // key = model_id

  async load(modelId: string): Promise<LoadedModel> {
    if (this.cache.has(modelId)) return this.cache.get(modelId)!;
    const meta = await this.registry.getById(modelId);
    const bytes = await this.artifactStore.fetch(meta.artifact_uri);
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    const loaded = { session, meta };
    this.cache.set(modelId, loaded);
    return loaded;
  }

  async evict(modelId: string) { this.cache.delete(modelId); }
}
```

**Cache strategy:** LRU with max 5 loaded models (typical: technical + fundamental + meta + 2 canary versions). Evict on `model_registry` UPDATE event via Redis pub/sub.

### 7.2 Inference

```typescript
// services/recommendation-service/src/scoring/technical-scorer.ts
async score(symbol: string, features: FeatureVector, modelId: string): Promise<number> {
  const { session, meta } = await this.loader.load(modelId);
  const vec = this.alignFeatures(features, meta.feature_set);  // throws on missing features
  const tensor = new ort.Tensor('float32', new Float32Array(vec), [1, vec.length]);
  const output = await session.run({ input: tensor });
  return output.probabilities.data[1] as number;   // P(class=1)
}
```

### 7.3 Batching for daily scoring

Daily ranking job batches up to 500 symbols in a single ONNX call (`[500, n_features]` tensor). Much faster than 500 sequential calls — measured 15–25× speedup typical.

---

## 8. Backtesting Engine

### 8.1 Walk-forward simulation

```typescript
// services/backtest-service/src/simulator/walk-forward.engine.ts
async run(req: BacktestRequest): Promise<BacktestResult> {
  const equity = new EquityTracker(req.initial_capital);
  const openTrades = new Map<string, Trade>();

  for (const date of tradingDays(req.start_date, req.end_date)) {
    // 1. Settle expiring positions
    for (const [sym, t] of openTrades) {
      const close = await prices.get(sym, date);
      if (this.shouldClose(t, close, date, req.params)) {
        equity.realize(t.exitPnl(close));
        openTrades.delete(sym);
      }
    }

    // 2. Score universe
    const features = await features.getBatch(universe, date);
    const scores = await rec.scoreBatch(features, req.model_id);

    // 3. Enter top-N
    const topN = scores.sort(byScoreDesc).slice(0, req.params.top_n);
    for (const s of topN) {
      if (openTrades.has(s.symbol) || equity.available() < req.params.position_size) continue;
      openTrades.set(s.symbol, new Trade(s.symbol, date, req.params));
    }

    equity.snapshot(date);
  }

  return this.metrics.compute(equity, openTrades);
}
```

### 8.2 Metrics

| Metric | Formula | Note |
|--------|---------|------|
| Sharpe | `(mean(daily_returns) - rf/252) / std(daily_returns) * sqrt(252)` | Annualized; `rf` = 0.06 for India |
| Max DD | `max((peak - trough) / peak)` | over equity curve |
| Win rate | `wins / total_trades` | |
| CAGR | `(end / start)^(1/years) - 1` | |

---

## 9. API Design (delta from V1)

### 9.1 New endpoints (via api-gateway path-stripping)

```
GET    /v1/features/:exchange/:symbol?date=YYYY-MM-DD&set=technical_v1
GET    /v1/features/batch?date=YYYY-MM-DD&set=technical_v1&symbols=A,B,C

GET    /v1/recommendations/top?date=YYYY-MM-DD&limit=20      (replaces V1)
POST   /v1/recommendations/score                              (synchronous, single symbol)
       body: { symbol, exchange, model_id? }

POST   /v1/backtest/runs                                      (async, returns job_id)
       body: { model_id, start_date, end_date, params }
GET    /v1/backtest/runs/:id
GET    /v1/backtest/results?model_id=...&limit=20

GET    /v1/models                                             (list registry)
POST   /v1/models/:id/promote                                 (canary → prod, admin only)
POST   /v1/models/:id/rollback
```

### 9.2 Response shape (consistent with V1)

```json
{ "success": true, "data": { /* ... */ } }
{ "success": false, "error": { "code": "MODEL_NOT_FOUND", "message": "..." } }
```

---

## 10. Redis Usage Strategy

| Use | Key pattern | TTL | Pattern |
|-----|-------------|-----|---------|
| Quote tick cache | `quote:{exch}:{symbol}` | 5s | existing |
| Feature cache | `feat:{set}:{exch}:{symbol}:{date}` | 24h | read-through |
| Symbol master | `master:{exch}` | 24h | existing |
| Score cache | `score:{model_id}:{symbol}:{date}` | 24h | read-through |
| Model artifact bytes | `model:bytes:{model_id}` | 1h | optional warm cache |
| BullMQ queues | `bull:{queue_name}:*` | n/a | persistent |
| Pub/sub channels | `features-ready:{date}`, `model:registry:updated`, `backtest:done:{job_id}` | n/a | fire-and-forget |
| Rate limit | `rl:{user_id}:{route}` | 60s | existing |

**No Redis pub/sub for inter-user real-time** — that remains polling-based as per V1 architecture.

---

## 11. Docker / Helm Architecture

Each new service follows the existing `node:20-alpine` + multi-stage build pattern.

```dockerfile
# services/recommendation-service/Dockerfile (prod)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY services/recommendation-service ./services/recommendation-service
COPY packages ./packages
RUN npm ci && npm run build --workspace=@platform/shared --workspace=recommendation-service

FROM node:20-alpine
RUN apk add --no-cache libstdc++   # onnxruntime-node native dep
WORKDIR /app
COPY --from=builder /app/services/recommendation-service/dist ./dist
COPY --from=builder /app/services/recommendation-service/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3005
CMD ["node", "dist/server.js"]
```

**Helm additions:** new templates under `helm/swingtrader/templates/feature-service-*.yaml`, `recommendation-service-*.yaml`, `backtest-service-*.yaml` following the existing pattern. Each gets a `values.yaml` block with `enabled`, `replicas`, `image`, `resources`, `port`, `config`.

**Resource defaults (prod):**

| Service | CPU req/lim | Mem req/lim | Notes |
|---------|-------------|-------------|-------|
| feature-service | 100m / 500m | 256Mi / 1Gi | I/O heavy |
| recommendation-service | 250m / 2000m | 512Mi / 2Gi | ONNX inference is CPU-bound |
| backtest-service | 250m / 2000m | 512Mi / 4Gi | long-running, batchable |

---

## 12. Deployment Strategy

1. **Model artifacts:** stored in PG (small models, <50 MB) using `pg_largeobject` initially. Migrate to S3/MinIO once any single model exceeds 100 MB.
2. **Migration ordering:** new service deployed → run migrations → deploy worker pods → smoke test → flip read traffic.
3. **Rollout phases per model promotion:**
   - `draft` — written by training pipeline; not served
   - `canary` — `rollout_percent` 1 → 10 → 50, monitored
   - `production` — `rollout_percent` 100
   - `retired` — removed from cache, kept in DB for backtest reproducibility
4. **A/B routing:** hash `user_id + date` → bucket 0–99. Serve canary if `bucket < rollout_percent`. Log both predicted and realized outcomes to `performance_logs`.

---

## 13. CI/CD Recommendations

| Pipeline | Trigger | Action |
|----------|---------|--------|
| Build & test | PR | `turbo run lint test build` |
| Image build | merge to `main` | docker build + push to registry |
| Helm deploy | image push | `helm upgrade --install` against prod cluster |
| ML retrain | cron weekly | `docker run ml:latest pipelines/technical/run_all.py` |
| Backtest gate | new model in `draft` | Auto-run 6-month backtest; if Sharpe < threshold, block promotion |
| Drift check | cron daily | KS-test on feature distributions; alert + auto-retrain if `p < 0.01` |

---

## 14. Model Lifecycle

```
                  ┌──────────┐
                  │  TRAIN   │  (Python, weekly)
                  └────┬─────┘
                       ▼
                  ┌──────────┐
                  │  DRAFT   │  inserted to registry, not served
                  └────┬─────┘
                       ▼ (auto-backtest passes)
                  ┌──────────┐
                  │  CANARY  │  rollout_percent 1 → 10 → 50
                  └────┬─────┘
                       ▼ (live perf >= prod for 14 days)
                  ┌──────────┐
                  │   PROD   │  rollout_percent 100
                  └────┬─────┘
                       ▼ (new prod model promoted)
                  ┌──────────┐
                  │ RETIRED  │  kept for backtest reproducibility
                  └──────────┘
```

---

## 15. Security & Operations

- **Model registry mutations** (promote / rollback / delete) require an admin role on the JWT (`role: admin` claim). Enforced in api-gateway middleware before reaching recommendation-service.
- **PII:** no PII in feature store or model inputs. User IDs do not leave core-service.
- **Secrets:** broker creds and JWT secret already AES-encrypted (V1). Add ML artifact store credentials to the same `core-service-secret` pattern.
- **Audit log:** every model promotion writes a row to `recommendations.audit_log` (who, what, when, prev/new status).

### 15.1 Rate limiting

| Tier | Limit | Routes |
|------|-------|--------|
| default | 100/min | most reads |
| auth | 50/min | login/OTP |
| orders | 30/min | broker writes |
| **backtest** | **5/min** | expensive |
| **score-on-demand** | **20/min** | inference |

### 15.2 Monitoring

| Signal | Tool | Alert threshold |
|--------|------|-----------------|
| ONNX inference latency p99 | Prometheus | > 200ms |
| Feature freshness | Prometheus | last materialization > 26h ago |
| Model drift (KS p-value) | custom job | p < 0.01 |
| BullMQ queue depth | bull-board + Prom | > 1000 jobs |
| DB connection pool saturation | pg_exporter | > 80% for 5 min |
| Model AUC on rolling 30d | nightly job | < 0.55 (alert: degrading) |

### 15.3 Failure recovery

| Failure | Behavior |
|---------|----------|
| ML model fails to load | Fall back to V1 rule engine (feature flag stays as kill switch) |
| Feature missing for symbol | Skip symbol in batch; log; do not crash batch |
| ONNX inference exception | Return null score; continue batch; alert if rate > 1% |
| Retraining fails | Keep previous prod model; alert; no auto-rollback |
| Backtest worker OOM | Job marked failed; retry once with halved batch size |

---

## 16. Implementation Order (Detailed Checklist)

### Week 1
- [ ] Create `recommendations` schema migration in `insights-service` (will move later)
- [ ] Set up `ml/` directory with `pyproject.toml`, Dockerfile, `common/db.py`
- [ ] Write `extract.py` + `transform.py` for technical features
- [ ] Write `labels.py` (forward 5d return, 3% threshold)

### Week 2
- [ ] Walk-forward split + LightGBM training
- [ ] Evaluation script (AUC, precision@20, lift)
- [ ] ONNX export tested with onnxruntime-node smoke test

### Week 3
- [ ] `model_registry` table + Python helper to upload artifacts
- [ ] Inside `insights-service/recommendations/`, add `OnnxInferenceService`
- [ ] Feature flag `RECOMMENDATION_ENGINE` (rule | ml-technical)
- [ ] End-to-end: GET /v1/recommendations returns ML scores when flag = ml-technical

### Week 4
- [ ] Spin up `feature-service` skeleton (port 3006)
- [ ] Move feature store tables/repos out of insights-service
- [ ] Add Redis read-through cache for features

### Week 5
- [ ] Spin up `recommendation-service` (port 3005)
- [ ] Move ML inference out of insights-service
- [ ] BullMQ queue + `score-symbol.worker.ts`

### Week 6
- [ ] Spin up `backtest-service` (port 3007)
- [ ] Walk-forward simulator + metrics
- [ ] POST /v1/backtest/runs end-to-end with frontend page

### Week 7
- [ ] Fundamental model pipeline (mirrors technical)
- [ ] `fundamentals-service` ingestion from broker
- [ ] Meta-model training + inference

### Week 8
- [ ] Optional sentiment-service (VADER)
- [ ] Canary rollout infrastructure (rollout_percent in registry, A/B hashing)
- [ ] Prometheus + Grafana dashboards
- [ ] Drift detection job

---

## 17. Frontend Changes (per CLAUDE.md sync rule)

| Backend change | Frontend update |
|----------------|-----------------|
| New `/v1/recommendations/top?date=` | Update `useRecommendations` hook signature |
| Score breakdown response | New `<ScoreBreakdown>` component (tech / fund / sent / final) |
| `/v1/backtest/runs` POST | New backtest page with model selector, date range picker, async polling |
| Model registry list | Admin-only `/admin/models` page |
| A/B variant header | Optional: surface "you're seeing model vX" in UI for transparency |

---

## 18. Future Roadmap (post-V2)

| Quarter | Item |
|---------|------|
| Q+1 | FinBERT sentiment (replace VADER) — requires GPU node pool or remote inference |
| Q+1 | Multi-broker support (Zerodha, Angel One) via broker abstraction in core-service |
| Q+2 | Intraday signals (15m / 1h bars) — requires streaming pipeline |
| Q+2 | Portfolio optimization layer (constrained mean-variance) using meta scores |
| Q+3 | Live paper-trading PnL attribution per model version |
| Q+3 | Reinforcement learning explorer (off-policy, runs alongside, never in prod) |
| Q+4 | Mobile app (React Native, share `@platform/shared` types) |

---

## 19. Open Questions (decide before Phase 2)

1. **Artifact storage:** start with `pg_largeobject` or jump straight to MinIO? Adds infra but simpler boundary.
2. **Sentiment data source:** which news API? Yahoo / Moneycontrol scrape vs paid (NewsAPI / Polygon)? Affects cost + reliability.
3. **Universe size:** top 100, top 500, or all NSE F&O? Trade-off: training data quality vs ranking breadth.
4. **Label horizon:** 5 days fixed or learn per-symbol? Fixed for V2 simplicity.
5. **Position sizing in backtest:** equal-weight, vol-targeted, or score-weighted? Start equal-weight.

---

**Sign-off:** This plan keeps V1 fully operational throughout the migration. Every new component is additive and feature-flagged. The rule engine remains as a fallback for the entire V2 lifecycle.
