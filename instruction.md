# SwingTrade V2 — Setup & Operations Guide

End-to-end runbook for the ML recommendation platform: install, train, score, backtest, deploy, troubleshoot.

---

## 1. System Overview

```
                       ┌──────────────┐
                       │  Frontend    │
                       └──────┬───────┘
                              │
                       ┌──────▼────────┐  port 3000
                       │ api-gateway   │  JWT, rate limit, proxy
                       └──┬─────────┬──┘
                ┌─────────┘         └─────────┐
                ▼                             ▼
   ┌────────────────────┐          ┌─────────────────────────────────┐
   │  core-service 3001 │          │     insights-service 3004       │
   │  auth/users/broker │          │   src/shared/    registry+types │
   │  portfolio/alerts  │          │   src/market/    OHLCV          │
   └────────────────────┘          │   src/features/  store          │
                                   │   src/recommendations/    ONNX  │
                                   │   src/backtest/    sim+queue    │
                                   └──────────┬──────────────────────┘
                                              │ same image, no HTTP
                                              ▼
                                   ┌─────────────────────────────────┐
                                   │   insights-worker (no port)     │
                                   │   feature materialization       │
                                   │   daily meta ranking cron       │
                                   │   performance backfill cron     │
                                   │   backtest BullMQ consumer      │
                                   └─────────────────────────────────┘

Data plane:
  PostgreSQL — core_db, insights_db
                 insights_db schemas: market, recommendations
                 (recommendations holds feature_store, model_registry,
                  model_artifacts, *_scores, final_scores, backtest_results,
                  performance_logs)
  Redis      — BullMQ queue (backtest-runs), pub/sub for job-done notifications,
                quote tick cache, symbol master cache
  ML offline — Python (LightGBM + ONNX export) outside the cluster, writes
                to recommendations.model_registry over PG
```

---

## 2. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker | 24+ | for image builds and k3d |
| k3d | 5.x | local Kubernetes |
| kubectl | 1.29+ | |
| Helm | 3.13+ | |
| Node.js | 20.x | local dev only |
| Python | 3.11+ | for ml/ pipelines |
| PostgreSQL client | 15 | for manual SQL |

---

## 3. First-Time Local Setup

### 3.1 Clone and install
```bash
git clone <repo>
cd asset_management
npm install
```

### 3.2 Create k3d cluster with source mount
```bash
export PROJECT_PATH=$(pwd)
k3d cluster create --config k8s/k3d-dev-config.yaml
kubectl wait --for=condition=Ready node --all --timeout=60s
```

### 3.3 Install nginx ingress (Traefik is disabled)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml
kubectl wait --namespace ingress-nginx --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=120s
```

### 3.4 Deploy with Helm (dev profile — hot-reload)
```bash
helm upgrade --install swingtrader ./helm/swingtrader -f helm/swingtrader/values-dev.yaml
kubectl get pods -A
```

All services come up with `node:20-alpine` + ts-node-dev, mounting the host project at `/app` for live reload.

### 3.5 Verify
```bash
kubectl port-forward svc/api-gateway 3000:80 &
curl http://localhost:3000/health
```

---

## 4. Database Migrations

Each service auto-runs its migrations on startup. To run manually:

```bash
cd services/insights-service && npx knex migrate:latest
cd services/core-service     && npx knex migrate:latest
```

Schemas created on first start:

| Database | Schemas |
|----------|---------|
| `core_db` | auth, users, broker, portfolio, engagement, core |
| `insights_db` | market, recommendations |

Tables in `insights_db.recommendations`:
- `feature_store` — partitioned monthly by `as_of_date`
- `model_registry` + `model_artifacts` — versioned ONNX artifacts (BYTEA)
- `technical_scores`, `fundamental_scores`, `sentiment_scores`, `final_scores`
- `backtest_results`, `performance_logs`

All migrations live in `services/insights-service/migrations/` (single Knex tracking table in the `market` schema). The post-consolidation insights-service owns every `insights_db` table.

---

## 5. ML Training Pipeline (Offline, Python)

### 5.1 Bootstrap the Python environment
```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # edit DB credentials
```

### 5.2 Run the technical model end-to-end
```bash
# 1. Pull OHLCV from market.ohlcv_daily
python -m pipelines.technical.extract --start 2024-01-01 --end 2026-05-01

# 2. Build the 16 technical features
python -m pipelines.technical.transform

# 3. Generate labels (5-day forward return, 3% threshold)
python -m pipelines.technical.labels

# 4. Train LightGBM with walk-forward split
python -m pipelines.technical.train

# 5. Evaluate on test split (AUC + precision@K + lift)
python -m pipelines.technical.evaluate

# 6. Export to ONNX + parity-verify against LightGBM (≤1e-5 tolerance)
python -m pipelines.technical.export_onnx

# 7. Upload to model_registry as status='draft'
python -m pipelines.common.registry \
  --name technical --version 1.0.0 --feature-set technical_v1 \
  --onnx artifacts/technical_model.onnx \
  --meta artifacts/technical_model.meta.json \
  --eval artifacts/technical_model.eval.json
```

### 5.3 Fundamental + Meta + Sentiment

Same pattern; just swap the pipeline subdirectory.

```bash
# Fundamental (requires market.fundamentals_daily populated)
python -m pipelines.fundamental.extract --start 2024-01-01 --end 2026-05-01
python -m pipelines.fundamental.transform
python -m pipelines.fundamental.train
python -m pipelines.fundamental.evaluate
python -m pipelines.fundamental.export_onnx
python -m pipelines.common.registry \
  --name fundamental --version 1.0.0 --feature-set fundamental_v1 \
  --onnx artifacts/fundamental_model.onnx \
  --meta artifacts/fundamental_model.meta.json

# Sentiment (VADER — no training needed; ingests headlines)
python -m pipelines.sentiment.score_headlines --start 2026-05-01 --end 2026-05-13
# A model_registry row for VADER is created idempotently on first run.

# Meta (combines per-component scores)
python -m pipelines.meta.train --start 2024-01-01 --end 2026-05-01
python -m pipelines.meta.export_onnx
python -m pipelines.common.registry \
  --name meta --version 1.0.0 --feature-set meta_v1 \
  --onnx artifacts/meta_model.onnx \
  --meta artifacts/meta_model.meta.json
```

### 5.4 Promote a draft to production
```bash
# Find the new model id
curl http://localhost:3000/v1/models?name=technical

# Promote
curl -X POST http://localhost:3000/v1/models/<id>/promote \
  -H 'Content-Type: application/json' \
  -d '{"status":"production","rollout_percent":100}'
```
The insights-service evicts its ONNX loader cache on promotion, so the next request serves the new artifact.

---

## 6. Daily Operations

### 6.1 Feature materialization
```bash
# Manual (idempotent — upserts by primary key)
curl -X POST http://localhost:3000/v1/features/materialize \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-13"}'

# Or enable the cron in the worker pod
# helm values: insightsService.config.MATERIALIZATION_CRON_ENABLED: "true"
# (The HTTP pod reads the same value but never runs the cron — only worker.ts does.)
```

### 6.2 Daily ranking
```bash
# Manual
curl -X POST http://localhost:3000/v1/recommendations/rank \
  -H 'Content-Type: application/json' \
  -d '{"exchange":"NSE","date":"2026-05-13","top_n":50}'

# Or enable the cron in the worker pod
# helm values: insightsService.config.DAILY_RANKING_CRON_ENABLED: "true"
```

### 6.3 Read top recommendations
```bash
curl 'http://localhost:3000/v1/recommendations/top?date=2026-05-13&limit=20'
```

### 6.4 Score a single symbol on demand
```bash
curl -X POST http://localhost:3000/v1/recommendations/score \
  -H 'Content-Type: application/json' \
  -d '{"exchange":"NSE","symbol":"RELIANCE","date":"2026-05-13","model_name":"technical"}'
```

---

## 7. Backtesting

### 7.1 Submit a run
```bash
curl -X POST http://localhost:3000/v1/backtest/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "model_id":"<uuid>",
    "start_date":"2024-01-01",
    "end_date":"2026-03-31",
    "params":{
      "top_n":20, "position_size_fraction":0.05,
      "stop_loss":-0.05, "take_profit":0.10,
      "max_holding_days":10, "initial_capital":1000000,
      "cost_bps":20, "exchange":"NSE"
    }
  }'
# → { "success": true, "data": { "id": "...", "status": "queued" } }
```

### 7.2 Poll the result
```bash
curl http://localhost:3000/v1/backtest/runs/<id>
```
Returns `status: "running"` until the worker finishes; then full equity curve + trades + metrics (Sharpe, max DD, win rate, CAGR).

---

## 8. Model Retraining

Retraining is just step 5.2 re-run with a higher `--version` flag. After upload, promote via `/v1/models/:id/promote`. To roll back, promote the previous version back to `production`.

Recommended cadence (from plan.md §6.4):
| Model | Cadence |
|-------|---------|
| technical | weekly |
| fundamental | monthly |
| sentiment | weekly |
| meta | weekly (after children retrain) |

The `ml/Dockerfile` is the image the Jenkins retraining job runs.

---

## 9. Service Startup Order

The deployments contain a `wait-for-postgres` init container, so K8s ordering isn't required for correctness. For local manual `npm run`:

```bash
1. PostgreSQL + Redis up
2. core-service           (npm run core)
3. insights-service       (npm run insights)         # HTTP pod
4. insights-worker        (npm run insights-worker)  # crons + backtest BullMQ consumer (optional)
5. api-gateway            (npm run gateway)
6. frontend               (npm run web)
```

The worker is optional for local dev — without it, `/v1/features/materialize` still works (HTTP-triggered), but the daily ranking + performance backfill crons and the backtest BullMQ consumer won't run.

---

## 10. Production Deployment

### 10.1 Build images
```bash
# Three images, one per service. The insights-service image is also used by
# the insights-worker Deployment (same binary, different `command`).
docker build -f services/api-gateway/Dockerfile        -t yaseenas/api-gateway:1.0.0 .
docker build -f services/core-service/Dockerfile       -t yaseenas/core-service:1.0.0 .
docker build -f services/insights-service/Dockerfile   -t yaseenas/insights-service:1.0.0 .
docker push yaseenas/api-gateway:1.0.0
docker push yaseenas/core-service:1.0.0
docker push yaseenas/insights-service:1.0.0
```

### 10.2 Deploy with prod values
```bash
helm upgrade --install swingtrader ./helm/swingtrader \
  -f helm/swingtrader/values-prod.yaml \
  --set coreService.secrets.JWT_SECRET=<real-secret> \
  --set apiGateway.config.JWT_SECRET=<real-secret> \
  --set coreService.secrets.UPSTOX_CLIENT_SECRET=<real> \
  --set insightsService.config.DAILY_RANKING_CRON_ENABLED=true \
  --set insightsService.config.MATERIALIZATION_CRON_ENABLED=true \
  --set insightsService.config.PERFORMANCE_BACKFILL_CRON_ENABLED=true
```
Cron flags live on `insightsService.config` so both pods read them, but only the worker pod (`worker.ts`) actually starts the crons. The HTTP pod never does.

### 10.3 Rollback
```bash
helm history swingtrader
helm rollback swingtrader <revision>
```

---

## 11. Production Checklist

- [ ] Real JWT secret in `core-service-secret` + matching value in `api-gateway-config`
- [ ] Real Upstox credentials in `core-service-secret`
- [ ] `BROKER_TOKEN_ENCRYPTION_KEY` — 32-byte hex (`openssl rand -hex 32`), unique per env
- [ ] DB credentials rotated from defaults
- [ ] `ingress.tls.enabled=true` with cert-manager issuer configured
- [ ] Daily cron flags enabled: `DAILY_RANKING_CRON_ENABLED`, `MATERIALIZATION_CRON_ENABLED`, `PERFORMANCE_BACKFILL_CRON_ENABLED`
- [ ] At least one `production`-status model per name in `model_registry`
- [ ] PVC backups configured for `postgres-pvc`
- [ ] Resource limits enforced (set in `values-prod.yaml`)
- [ ] Helm release tested in staging with prod values + dummy secrets

---

## 12. Scaling Recommendations

| Pressure | Symptom | Action |
|----------|---------|--------|
| API latency | p99 spikes on `/v1/recommendations/top` | scale `insights-service` HTTP pod (it serves cached scores from DB; check that ONNX batch jobs aren't accidentally on this pod) |
| Feature lag | last `feature_store` row > 26h old | check `insights-worker` is up; trigger `POST /v1/features/materialize` manually; consider sharding materialization by symbol prefix |
| Backtest queue depth | `bull:backtest-runs` > 50 | scale `insights-worker` replicas or raise `BACKTEST_CONCURRENCY` |
| PG saturation | pool > 80% for 5+ min | bump pg pool max (currently 10) or add read replica |
| ONNX memory | OOMKilled on `insights-worker` | reduce `MODEL_CACHE_SIZE` (default 5) |
| Worker pod CPU starvation | both backtest and ONNX batch competing | run `insights-worker` at higher CPU limit, or split into two worker Deployments later (different `command:`) |

---

## 13. Troubleshooting

### "No active <name> model in registry"
The given model name has no row with `status` in `('production','canary')`. Train + register + promote (§5.2–5.4).

### Backtest stuck in `running` forever
Check the worker logs:
```bash
kubectl logs deploy/insights-worker -c app
```
Likely causes: missing scores in `<name>_scores` for the date range, or missing OHLCV bars. The backtest worker logs the symbol/date that failed. If `insights-worker` isn't running, the queue has no consumer — start it.

### `/v1/features/:symbol` returns 404
The materialization cron hasn't run for that date, or the symbol had a price-data gap during feature computation. Trigger manually:
```bash
curl -X POST http://localhost:3000/v1/features/materialize -d '{"date":"2026-05-13"}'
```

### `Model not in registry: <id>` from insights-service
Stale frontend caching the old model id. Refresh and re-fetch `/v1/recommendations/top` (uses the active meta model, no client-side id needed).

### ONNX inference returns wrong probabilities
The `export_onnx.py` parity check should have caught this offline. If it slips through, force-evict the loader cache:
```bash
# Promoting any model with the same id triggers cache eviction
curl -X POST /v1/models/<id>/promote -d '{"status":"production","rollout_percent":100}'
```

### Ngrok / external URL returns nginx 404
Ingress has a host restriction; ngrok sends a different `Host` header. Remove the host filter:
```bash
kubectl patch ingress platform-ingress --type=json \
  -p='[{"op":"replace","path":"/spec/rules/0","value":{"http":{"paths":[
    {"path":"/api(/|$)(.*)","pathType":"ImplementationSpecific","backend":{"service":{"name":"api-gateway","port":{"number":80}}}},
    {"path":"/()(.*)","pathType":"ImplementationSpecific","backend":{"service":{"name":"react-frontend-service","port":{"number":80}}}}
  ]}}}]'
```

### Helm install fails with "namespace exists and cannot be imported"
Pre-existing Kustomize namespaces lack Helm ownership labels. Adopt them:
```bash
for ns in database jenkins; do
  kubectl label namespace $ns app.kubernetes.io/managed-by=Helm
  kubectl annotate namespace $ns meta.helm.sh/release-name=swingtrader meta.helm.sh/release-namespace=default
done
```

### `cluster unreachable: dial tcp 127.0.0.1:8080`
kubeconfig not loaded. Reset the context:
```bash
k3d cluster list
k3d kubeconfig merge asset-dev --kubeconfig-switch-context
```

### onnxruntime-node install fails locally
Local Node < 14 can't run the install script. The k8s container uses node:20-alpine; ignore the local error. To do local dev, install Node 20: `nvm install 20 && nvm use 20`.

---

## 14. API Reference (ML additions)

All ML endpoints are served by `insights-service` (HTTP pod). External callers go through the gateway at `/v1/*`.

| Method | Path | Module | Description |
|--------|------|--------|-------------|
| GET | `/v1/features/:exchange/:symbol?date=&set=` | features | single feature vector |
| GET | `/v1/features/batch?exchange=&date=&set=&symbols=A,B` | features | bulk fetch |
| POST | `/v1/features/materialize` | features | trigger materialization for `{date}` |
| GET | `/v1/recommendations/top?date=&limit=` | recommendations | ranked list |
| POST | `/v1/recommendations/score` | recommendations | single-symbol on-demand |
| POST | `/v1/recommendations/rank` | recommendations | run universe ranking now |
| GET | `/v1/models?name=technical` | recommendations | list models |
| GET | `/v1/models/:id` | recommendations | model detail |
| POST | `/v1/models/:id/promote` | recommendations | change status + rollout_percent (evicts ONNX cache) |
| POST | `/v1/backtest/runs` | backtest | submit async backtest (enqueues BullMQ job) |
| GET | `/v1/backtest/runs/:id` | backtest | poll status + results |
| GET | `/v1/backtest/results?model_id=&limit=` | backtest | history per model |

---

## 15. Future Roadmap (deferred, not blockers)

| Area | Why deferred | Trigger |
|------|--------------|---------|
| Canary % routing (deterministic user-hash) | needs ≥14 days of prod model perf data | first canary candidate |
| Prometheus + Grafana dashboards | needs metrics infra in cluster | when ops adds Prometheus |
| Drift detection (KS-test on features) | needs 30 days of `performance_logs` | after first prod model serves 30+ days |
| Fundamentals ingestion service | data source pick (Upstox vs paid feed) pending | when source selected |
| FinBERT sentiment (replaces VADER) | needs GPU node pool or remote inference | when sentiment quality plateaus |
| Frontend pages for backtest + ML scores | needs UX spec | when product agrees on layout |

---

## 16. Architecture Decisions That Live Here, Not in Code

- **3 services, 4 pods.** api-gateway, core-service, insights-service. insights-service also runs as a second pod (`insights-worker`) from the same image — different `command`, no HTTP, owns crons + BullMQ consumer.
- **One image, two entrypoints.** `src/server.ts` boots Express; `src/worker.ts` boots only background jobs. Picking which to run is a deployment concern (`command: ["node", "dist/worker.js"]`), not a build concern.
- **Cron flags are read by both pods, acted on only by the worker.** `DAILY_RANKING_CRON_ENABLED`, `MATERIALIZATION_CRON_ENABLED`, `PERFORMANCE_BACKFILL_CRON_ENABLED` live on `insightsService.config` (one configmap). The HTTP pod reads them too but `server.ts` never calls `cron.start()`. This means you can flip a flag without redeploying the HTTP pod, and the API never accidentally runs a batch job.
- **`src/shared/` is the single source of truth for cross-module ML primitives.** `ModelMeta`, `ModelName`, `ModelStatus`, and `ModelRegistryRepository` live there. Both `recommendations/` (inference, scoring, models API) and `backtest/` (walk-forward engine, controller "model exists?" check) inject the same registry instance — `recommendation-service → feature-service` style HTTP no longer exists, and there is no duplicate model-registry query in the codebase.
- **ONNX storage**: in-DB as BYTEA (`recommendations.model_artifacts`) until any single model exceeds ~100 MB. Then move to S3/MinIO and update `artifact_uri` scheme handling in `onnx-loader.service.ts`.
- **Label horizon**: hard-coded to 5 trading days, 3% threshold. Configurable via env (`LABEL_HORIZON_DAYS`, `LABEL_THRESHOLD`) in the training pipeline. Changing the horizon invalidates all existing models.
- **Universe**: training currently uses every symbol in `market.ohlcv_daily`. Restrict by adding a filter in `pipelines/technical/extract.py` if dataset bloats.
- **No streaming**: all polling-based per V1 architecture. Frontend `usePolling` hook handles intervals (quotes 5s, recommendations/backtest 30s).
- **No cross-DB joins**: `core_db` ↔ `insights_db` communicate only via HTTP between services.
