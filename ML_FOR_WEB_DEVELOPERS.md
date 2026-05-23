# The ML System, Explained for Web Developers

> You don't need to know machine learning to operate this. You only need to know that there is a **predictor** (a frozen file produced by a Python script) and a **server that loads it** (insights-service, which you already know). This guide explains the pieces, the dataflow, and the exact commands to run.

---

## TL;DR

Think of the ML model as a **trained function** that takes a stock's recent price stats and returns a probability that the price will go up at least 3% over the next 5 trading days.

```
features (numbers about a stock) ─► model (function) ─► score (0.0 to 1.0)
```

There are two halves to the system:

| Half | Language | Where | When it runs |
|---|---|---|---|
| **Training** — produces the model | Python | [ml/](ml/) | Offline, manually or weekly cron |
| **Serving** — uses the model to score | Node.js (TypeScript) | [services/insights-service/src/recommendations/](services/insights-service/src/recommendations/) | Online, in the worker pod |

The **handoff between them is a file** called an ONNX file. Python writes it, Node reads it. Think of it like compiling a stored procedure once and calling it many times.

---

## Mental model — analogies to things you know

| ML concept | Web-dev analogy |
|---|---|
| **Feature** | A column in a request body. E.g. `{ rsi_14: 64.2, macd_hist: 0.34, ... }`. There are 16 features for the technical model. |
| **Feature vector** | One JSON object — one row of features for one (symbol, date). |
| **Model** | A pure function. Stateless. Takes a feature vector, returns a number. |
| **Training** | The process of "fitting" the function's internal weights from historical data. Equivalent to: "given 100k past examples of `(features, did_it_actually_go_up)`, find the function that best predicts the outcome." Slow, one-shot. |
| **Inference / scoring** | Calling the trained function. Fast, millions of times. |
| **ONNX file** | A portable binary serialization of the trained function. Like a `.proto` file but for ML models. ~2-10 MB typically. |
| **Model registry** | A database table mapping model IDs → ONNX file blobs, with a `status` column (`draft`, `canary`, `production`, `retired`). Like a feature flag system for models. |
| **Promotion** | Changing a model's `status` to `production`. Same idea as turning on a feature flag — the next request uses the new model. |
| **Feature store** | A cache table. Pre-computed feature vectors keyed by `(symbol, exchange, date)`. So scoring doesn't recompute RSI/MACD on every request. |
| **Ranking** | Score every stock on a date, sort descending, take top N. The output the frontend shows. |
| **Backtest** | A regression test. "If we'd been using this model historically, what trades would it have suggested? Did they make money?" Runs in BullMQ because it's slow. |

If you've ever built a system where someone trains a model and you "load it into your service to predict things," that's exactly this. The model is just **a function on disk**.

---

## The pieces, mapped to this repo

```
─── OFFLINE TRAINING (you run this manually) ─────────────────────────────────
ml/                                  Python project, NOT a deployed service
├── pyproject.toml                   Python deps (pandas, lightgbm, onnxmltools)
├── .env.example                     DB creds for reading OHLCV + writing the model
└── pipelines/
    ├── common/                      Shared: walk-forward split, DB helpers, registry uploader
    ├── technical/                   Technical-indicator model (16 features → score)
    │   ├── extract.py               Pull OHLCV bars from Postgres into a DataFrame
    │   ├── transform.py             Compute 16 features (RSI, MACD, returns, etc.)
    │   ├── labels.py                Generate target labels (1 if price ↑3% in 5d, else 0)
    │   ├── train.py                 Fit LightGBM, save .lgb model
    │   ├── evaluate.py              Compute AUC, precision@K, lift
    │   └── export_onnx.py           Convert .lgb → .onnx; verify parity within 1e-5
    ├── fundamental/                 Same shape, different features (PE, EPS, ROE)
    ├── sentiment/                   VADER on news headlines
    └── meta/                        Combines the three above into one final score

─── ONLINE SERVING (auto-loaded at runtime) ──────────────────────────────────
services/insights-service/
└── src/
    ├── shared/
    │   ├── types.ts                 ModelMeta type — what a model row looks like
    │   └── model-registry.repository.ts  Reads the model_registry table
    ├── features/
    │   ├── repository.ts            Reads/writes recommendations.feature_store
    │   └── materialization/
    │       └── technical-builder.ts Computes the same 16 features as Python (must match!)
    └── recommendations/
        ├── inference/
        │   ├── onnx-loader.service.ts    Loads .onnx bytes into onnxruntime-node, LRU-cached
        │   └── inference.service.ts      Calls the loaded model: features → score
        ├── scoring/
        │   └── scorer.service.ts         Orchestrates: load model → fetch features → predict → write score
        ├── api/
        │   ├── recommendations.controller.ts  HTTP endpoints: /top, /score, /rank
        │   └── models.controller.ts           HTTP endpoints: /models, /:id/promote
        └── workers/
            └── daily-ranking.cron.ts    Runs scoreUniverseMeta() once a day in the worker pod

─── DATA PLANE ──────────────────────────────────────────────────────────────
Postgres database `insights_db`, schema `recommendations`:
  • model_registry      — one row per (model_name, version), with status + rollout_percent
  • model_artifacts     — the actual ONNX bytes, keyed by model_id (BYTEA column)
  • feature_store       — pre-computed features (the "cache" table for scoring)
  • technical_scores    — output of the technical model for each (symbol, date)
  • fundamental_scores  — same, for fundamental model
  • sentiment_scores    — same, for sentiment model
  • final_scores        — output of the meta model (combines the three above), with daily rank
  • backtest_results    — async backtest run results
  • performance_logs    — predicted score vs realized return after 5/10/20 days
```

---

## End-to-end dataflow

### 1. Once: train a model offline

```
[market.ohlcv_daily in Postgres]
       │
       ▼   extract.py
[raw price bars for each symbol]
       │
       ▼   transform.py
[features per (symbol, date)]
       │
       ▼   labels.py
[features + label (did it go up 3%?)]
       │
       ▼   train.py (LightGBM)
[trained model — a .lgb file on disk]
       │
       ▼   export_onnx.py
[trained model as .onnx, parity-verified]
       │
       ▼   pipelines/common/registry.py
[INSERT into recommendations.model_registry (status='draft')]
[INSERT into recommendations.model_artifacts (bytes)]
```

Result: a new row in `model_registry` with `status='draft'`. Not yet served — drafts are invisible to the running service.

### 2. Once per training run: promote the model to production

```
HTTP POST /v1/models/<id>/promote { "status": "production", "rollout_percent": 100 }
                │
                ▼
insights-service updates model_registry, evicts ONNX cache so next request reloads
```

Now `model_registry.status='production'` for that model. The serving code calls `registry.getActive('technical')` which returns this model.

### 3. Daily, automatically (worker pod): materialize features, then rank

```
01:00 IST  worker pod cron tick
  └─ MaterializationCron.runOnce(today)
       └─ for each NSE symbol, compute 16 features, INSERT into feature_store

01:30 IST  worker pod cron tick
  └─ DailyRankingCron.tick()
       └─ ScorerService.scoreUniverseMeta(NSE, today, 100)
            ├─ get active meta model from registry
            ├─ load features for all symbols on today's date
            ├─ run each through technical_model → technical_score
            ├─ run each through fundamental_model → fundamental_score
            ├─ run each through sentiment_model → sentiment_score
            ├─ feed those three into meta_model → final_score
            ├─ INSERT into final_scores
            └─ UPDATE rank = ROW_NUMBER() OVER (ORDER BY final_score DESC)
```

### 4. On request: frontend reads the ranked list

```
GET /v1/recommendations/top?date=2026-05-13&limit=20
        ▼
api-gateway → insights-service
        ▼
SELECT * FROM final_scores WHERE as_of_date='2026-05-13' ORDER BY rank LIMIT 20
        ▼
JSON to frontend
```

No ML happens on this request path. The scoring already happened overnight; the API just reads the cached result.

---

## How to actually run the ML pipeline

### Prerequisites

- Python 3.11+ on your host
- Postgres reachable on `localhost:5432` with `admin` user (see [ml/.env.example](ml/.env.example))
- The `insights_db` database has OHLCV data in `market.ohlcv_daily` (this is loaded by insights-service when it ingests from Upstox). **You need real historical price data for training to make any sense.**

### Step 1 — bootstrap Python

```bash
cd ml
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit .env to point at your Postgres
```

This installs lightgbm, onnxmltools, etc. into `.venv`. The venv is local to `ml/` — it doesn't affect the rest of the project.

### Step 2 — train the technical model end-to-end

```bash
# (still inside ml/ with .venv active)
mkdir -p artifacts

# 1. Pull OHLCV from Postgres into parquet files in artifacts/
python -m pipelines.technical.extract --start 2024-01-01 --end 2026-05-01

# 2. Build the 16 features (RSI, MACD, returns, volatility, …)
python -m pipelines.technical.transform

# 3. Label each row (1 if price went up ≥3% in 5 trading days, else 0)
python -m pipelines.technical.labels

# 4. Train LightGBM with a walk-forward split
python -m pipelines.technical.train

# 5. Measure quality (AUC, precision@20, lift)
python -m pipelines.technical.evaluate

# 6. Convert .lgb → .onnx; verify ONNX predictions match LightGBM within 1e-5
python -m pipelines.technical.export_onnx

# 7. Upload .onnx + metadata to model_registry as status='draft'
python -m pipelines.common.registry \
  --name technical \
  --version 1.0.0 \
  --feature-set technical_v1 \
  --onnx artifacts/technical_model.onnx \
  --meta artifacts/technical_model.meta.json \
  --eval artifacts/technical_model.eval.json
```

After step 7, query Postgres to see the new row:

```sql
SELECT id, name, version, status, rollout_percent, created_at
FROM recommendations.model_registry
ORDER BY created_at DESC LIMIT 5;
```

You should see a `draft` row for `technical / 1.0.0`.

### Step 3 — promote it so the running service uses it

```bash
MODEL_ID=$(curl -s 'http://localhost:3000/v1/models?name=technical' | jq -r '.data[0].id')

curl -X POST "http://localhost:3000/v1/models/$MODEL_ID/promote" \
  -H 'Content-Type: application/json' \
  -d '{"status":"production","rollout_percent":100}'
```

The insights-service handler updates the row and evicts the ONNX cache. The next inference request loads the new bytes.

### Step 4 — try scoring a single symbol

```bash
curl -X POST http://localhost:3000/v1/recommendations/score \
  -H 'Content-Type: application/json' \
  -d '{
    "exchange": "NSE",
    "symbol": "RELIANCE",
    "date": "2026-05-13",
    "model_name": "technical"
  }'
```

This requires features to exist for RELIANCE on that date. If not, run materialization first:

```bash
curl -X POST http://localhost:3000/v1/features/materialize \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-13"}'
```

### Step 5 — for the full stack (top recommendations, ranking)

You also need the **fundamental**, **sentiment**, and **meta** models trained the same way. Same recipe, swap `technical` for the other name in steps 2 and 3. The `meta` model is the one that combines them into a final ranked list.

Once all four are in `production`:

```bash
# Run the daily ranking on demand
curl -X POST http://localhost:3000/v1/recommendations/rank \
  -H 'Content-Type: application/json' \
  -d '{"exchange":"NSE","date":"2026-05-13","top_n":50}'

# Read the ranked output (this is what the frontend calls)
curl 'http://localhost:3000/v1/recommendations/top?date=2026-05-13&limit=20'
```

---

## What to do when…

### "I just want to see if the serving side works without doing all the training"

Insert a fake "model" row manually. The ONNX runtime needs a real ONNX file, so this only works for testing the **HTTP path**, not actual scoring. To test scoring, you have to train.

### "Where do I look when scoring fails?"

```bash
# Worker pod (where batch ranking happens)
tail -f logs/insights-worker.log

# HTTP pod (where single-symbol scoring happens)
tail -f logs/insights-service.log
```

Common error: `No active <name> model in registry` → there's no row with status in (`production`, `canary`) for that model name. Train + promote (steps 2–3).

Common error: `No features for <exchange>:<symbol> on <date>` → run `/v1/features/materialize` for that date.

### "How do I know which model is currently being served?"

```sql
SELECT name, version, status, rollout_percent, promoted_at
FROM recommendations.model_registry
WHERE status IN ('production','canary')
ORDER BY name;
```

### "How do I roll back to a previous model?"

Promote the previous version back to `production`:

```bash
curl -X POST "http://localhost:3000/v1/models/<previous-model-uuid>/promote" \
  -H 'Content-Type: application/json' \
  -d '{"status":"production","rollout_percent":100}'
```

The new "current" model is now the old one. Cache evicts; next request loads it.

### "How often should I retrain?"

| Model | Cadence | Why |
|---|---|---|
| technical | weekly | Indicators drift fast |
| fundamental | monthly | Earnings update slowly |
| sentiment | weekly | News flow changes |
| meta | weekly | After children are retrained |

These are recommendations, not requirements. The system keeps working with stale models — just less accurately.

### "I'm scared to touch any of this"

You don't have to. Until someone trains and promotes a model, the recommendation endpoints will return `503 NO_META_MODEL` or empty results. The rest of the web app (auth, broker, portfolio) is unaffected.

---

## Things that are not your problem

These are intentionally **out of scope** for a web dev operating this system:

- Understanding LightGBM internals — treat it as a black box that takes (X, y) and returns a model.
- Tuning hyperparameters — defaults in `train.py` are fine for now.
- Why ONNX needs `target_opset=13` — it's a compatibility flag for `onnxruntime-node`.
- Avoiding look-ahead bias / survivorship bias — handled by the training pipeline.
- The math behind Sharpe ratio, max drawdown — backtest module computes them; you just read the numbers.

What you DO need to do:
- Run the steps above when asked to retrain.
- Watch logs when something fails.
- Know how to promote / roll back via the HTTP API.
- Understand that the **worker pod** (`insights-worker`) is where the heavy ML batch jobs run; the HTTP pod just serves cached results.

---

## Quick reference card

```bash
# train + register a model
cd ml && source .venv/bin/activate
python -m pipelines.technical.extract --start 2024-01-01 --end 2026-05-01
python -m pipelines.technical.transform
python -m pipelines.technical.labels
python -m pipelines.technical.train
python -m pipelines.technical.evaluate
python -m pipelines.technical.export_onnx
python -m pipelines.common.registry --name technical --version 1.0.1 --feature-set technical_v1 \
  --onnx artifacts/technical_model.onnx \
  --meta artifacts/technical_model.meta.json

# list models
curl -s 'http://localhost:3000/v1/models?name=technical' | jq

# promote
curl -X POST "http://localhost:3000/v1/models/<id>/promote" \
  -H 'Content-Type: application/json' \
  -d '{"status":"production","rollout_percent":100}'

# materialize today's features
curl -X POST http://localhost:3000/v1/features/materialize \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"$(date +%F)\"}"

# run today's ranking
curl -X POST http://localhost:3000/v1/recommendations/rank \
  -H 'Content-Type: application/json' \
  -d "{\"exchange\":\"NSE\",\"date\":\"$(date +%F)\",\"top_n\":50}"

# read the result
curl "http://localhost:3000/v1/recommendations/top?date=$(date +%F)&limit=20"

# tail the worker pod logs (where ML actually executes)
tail -f logs/insights-worker.log
```

That's the whole loop.
