# Reduction Plan — Cut the Service Count

> **Decision:** consolidate to **3 services** (api-gateway, core-service, insights-service). The V2 ML services (feature, recommendation, backtest) fold into insights-service. CPU-bound work runs in a second pod from the same image.
>
> Goal: undo the over-engineering introduced by `plan.md` (V2 ML rollout) without losing any working capability. The V2 plan inflated 3 services → 6, plus 4 empty stub directories. This plan brings it back to 3.

---

## 1. Current state (on disk, not what CLAUDE.md says)

| # | Service | Port | Status | Files (src) | Notes |
|---|---------|------|--------|-------------|-------|
| 1 | api-gateway | 3000 | real | — | JWT, rate limit, proxy |
| 2 | core-service | 3001 | real | — | auth, users, broker, portfolio, engagement |
| 3 | insights-service | 3004 | real | 15 | market + still contains V1 `recommendations/` (rule engine) |
| 4 | feature-service | 3006 | real, tiny | 11 | feature store CRUD + materialization |
| 5 | recommendation-service | 3005 | real | 17 | ONNX inference + BullMQ workers |
| 6 | backtest-service | 3007 | real | 25 | walk-forward simulator, ~1.8k LOC |
| — | auth-service | — | empty dir | 0 | leftover from earlier planning |
| — | engagement-service | — | empty dir | 0 | leftover |
| — | market-service | — | empty dir | 0 | leftover |
| — | trading-service | — | empty dir | 0 | leftover |

Symptoms of over-engineering this introduced:
- **Code duplication.** `insights-service/src/recommendations/` and `recommendation-service/src/` both exist. Phase-2 said "extract from insights-service" — extraction happened, deletion did not.
- **Migration / ownership mismatch.** `recommendations` schema migrations live in `services/insights-service/migrations/`, but the owning service is now `recommendation-service`. Schema ownership doesn't match deployment ownership.
- **Four shadow services.** Empty directories sit in `services/` for no reason. They pollute `ls`, monorepo tooling, and any future "build all" logic.
- **Helm sprawl.** Each new service has its own configmap + deployment + service template (3 yaml files × 3 services = 9 extra manifests for what is essentially one ML workload).
- **Pod overhead.** Each service is a separate pod with its own pg pool, ts-node-dev, node runtime, Redis client. In dev (k3d) this is meaningful memory.
- **Tiny services.** `feature-service` is 11 files. It's a thin DB wrapper around one table. It does not justify a pod.

---

## 2. Target state — 3 services

```
api-gateway   (3000)   unchanged
core-service  (3001)   unchanged
insights-service (3004) ← absorbs feature + recommendation + backtest
   src/
     market/                (existing) quotes, OHLCV, indicators
     features/              (from feature-service)
     recommendations/       (from recommendation-service — replaces V1 rule engine)
     backtest/              (from backtest-service)
     server.ts              HTTP entrypoint (existing)
     worker.ts              BullMQ-only entrypoint (new, no HTTP)
```

**Pod layout:** two Deployments share the same image:
- `insights-service` (HTTP): runs `node dist/server.js`. Scales for read latency.
- `insights-worker` (background): runs `node dist/worker.js`. Owns ONNX daily ranking + backtest jobs. Scales for throughput. Crashes here don't take down the API.

**Why this works for our workload**
- One `insights_db` connection pool instead of four.
- One Knex migration directory for the entire ML domain — schema ownership = service ownership.
- One Dockerfile, one Helm chart, one config block.
- ONNX inference cost is paid once per image (`libstdc++` + `onnxruntime-node` ≈ 80 MB) regardless of how many ML modules are in the service.
- CPU-bound jobs are already BullMQ-shaped, so routing them to a separate pod is a deployment concern, not a code concern.

**Trade-off we accept**
- Bigger blast radius if the insights HTTP pod crashes — `market`, `features`, and `recommendations` go down together. For a single-tenant swing-trade platform this is fine; the worker pod stays up independently for batch jobs.

---

## 2a. How ML is handled in this plan

Nothing about the ML pipeline changes — only where it runs. Every V2 capability survives.

### Where each ML piece lives after consolidation

| Concern | Before (V2) | After (this plan) |
|---------|-------------|-------------------|
| OHLCV ingestion + indicators | `insights-service/src/market/` | `insights-service/src/market/` (unchanged) |
| Feature store table (`recommendations.feature_store`) | `insights_db` (migrations in insights-service) | same DB, same migrations |
| Feature CRUD + materialization | `feature-service/src/` | `insights-service/src/features/` |
| Model registry table (`recommendations.model_registry`) | `insights_db` | same |
| ONNX artifact storage (`recommendations.model_artifacts`, BYTEA) | `insights_db` | same |
| ONNX loader + LRU cache | `recommendation-service/src/inference/` | `insights-service/src/recommendations/inference/` |
| Per-component scorers (technical, fundamental, sentiment, meta) | `recommendation-service/src/scoring/` | `insights-service/src/recommendations/scoring/` |
| Ranking logic | `recommendation-service/src/ranking/` | `insights-service/src/recommendations/ranking/` |
| BullMQ consumers (`score-symbol`, `daily-ranking`) | `recommendation-service/src/workers/` | `insights-service/src/workers/`, loaded only by `worker.ts` |
| Backtest simulator | `backtest-service/src/simulator/` | `insights-service/src/backtest/simulator/` |
| Backtest BullMQ consumer (`backtest-runs`) | `backtest-service/src/workers/` | `insights-service/src/workers/`, loaded only by `worker.ts` |
| Python training pipeline | `ml/` directory | **unchanged** — still runs outside the cluster, writes to `model_registry` over PG |
| Rollout / promote endpoints | `recommendation-service/src/registry/` | `insights-service/src/recommendations/registry/` |
| V1 rule engine (`signal-generator.service.ts`, `rule-engine.ts`) | `insights-service/src/recommendations/` | **deleted** — superseded by ONNX inference |

### Request paths after consolidation

```
External request → api-gateway → insights-service (HTTP pod)
   /v1/features/*          → features/
   /v1/recommendations/top → recommendations/ranking/ (reads cached scores from DB)
   /v1/recommendations/score → recommendations/inference/ (synchronous ONNX call)
   /v1/recommendations/rank → enqueues 'daily-ranking' BullMQ job, returns job_id
   /v1/models, /v1/models/:id/promote → recommendations/registry/
   /v1/backtest/runs (POST) → enqueues 'backtest-runs' BullMQ job, returns job_id
   /v1/backtest/runs/:id (GET) → reads backtest_results from DB
```

```
BullMQ jobs → insights-worker pod (no HTTP server)
   daily-ranking  → loads features, batch-runs ONNX, writes final_scores
   backtest-runs  → walk-forward sim, writes backtest_results
   score-symbol   → single-symbol on-demand inference (queued path)
```

### What the worker pod does, concretely

`worker.ts` boots the same DB and Redis clients as `server.ts`, then calls `new Worker(queueName, handler, { connection: redis })` for each queue. No Express, no port binding, no readiness probe over HTTP — liveness comes from BullMQ heartbeats. Same image, different entrypoint.

### What the API pod must *not* do

- No ONNX inference for batch loads. Synchronous `/v1/recommendations/score` is fine (one symbol, milliseconds). The daily 500-symbol ranking goes through the queue, never inline.
- No backtest execution. POST returns 202 immediately with a job_id.

This is how `recommendation-service` already works — we keep the discipline, just colocate the code.

### Model lifecycle stays identical

```
Python ml/ pipeline → trains LightGBM → exports ONNX → inserts model_registry row (status=draft)
        ↓
Manual / scripted PROMOTE → status=canary (rollout_percent 1→10→50)
        ↓
PROMOTE → status=production (rollout_percent=100)
```

Promotion writes a Redis pub/sub message; the ONNX loader cache evicts the old model. This already crosses service boundaries via Redis — colocating the code makes the eviction in-process, simpler.

### Two things that get easier

1. **Feature → inference colocation.** Today a recommendation request hops `recommendation-service → feature-service → insights-service (OHLCV)` over HTTP. After consolidation it's all in-process. Removes two HTTP hops from the hot path; removes the "feature service down" failure mode for inference.
2. **Backtest data access.** Backtest reads feature history + OHLCV + scores. Today: three HTTP clients in `backtest-service`. After: direct DB reads from the worker, no service-to-service HTTP needed.

### One thing that needs care

**Resource limits on the worker pod.** ONNX batch + backtest in the same pod can compete for CPU and RAM. Initial values to set in `values-prod.yaml` for `insights-worker`:
- `BACKTEST_CONCURRENCY=1` (one backtest at a time per pod)
- `MODEL_CACHE_SIZE=5` (unchanged)
- CPU 500m / 2000m, Memory 1Gi / 4Gi
- Horizontal scale on queue depth: `bull:backtest-runs` > 5 → add a replica.

---

## 3. Execution plan

Phased so each step is independently reversible. Nothing is deleted until its replacement is verified.

### Phase 0 — cleanup (no behavior change, ~30 min)

1. Delete empty stub dirs: `auth-service/`, `engagement-service/`, `market-service/`, `trading-service/`.
2. Confirm nothing references them:
   ```
   grep -r "auth-service\|engagement-service\|market-service\|trading-service" \
     --include='*.json' --include='*.yaml' --include='*.ts'
   ```

### Phase 1 — fold feature-service into insights-service (~half day)

1. Move `services/feature-service/src/feature-store/` → `services/insights-service/src/features/`.
2. Move `services/feature-service/src/materialization/` → `services/insights-service/src/features/materialization/`.
3. Wire feature routes into `insights-service/src/app.ts` under `/features/*`.
4. Move feature migrations into `insights-service/migrations/` (or merge into existing `20260513000001_create_v2_ml_tables.ts` if not yet run in any environment that matters).
5. Delete `services/feature-service/`.
6. Update api-gateway proxy: `/v1/features/*` → insights-service (was proxied to feature-service).
7. Update Helm: delete `feature-service-*.yaml`, drop `featureService` block from `values-*.yaml`.

### Phase 2 — fold recommendation-service into insights-service (~1 day)

1. **Delete the V1 duplicate first**: `services/insights-service/src/recommendations/` (rule engine). Grep for imports first:
   ```
   grep -r "src/recommendations\|signal-generator\|rule-engine" services/insights-service
   ```
2. Move `services/recommendation-service/src/` (inference, scoring, workers, api) → `services/insights-service/src/recommendations/`.
3. Wire routes into `insights-service/src/app.ts` under `/recommendations/*` and `/models/*`.
4. **Split worker process**: add a second entrypoint `services/insights-service/src/worker.ts` that boots only the BullMQ consumers, not the HTTP server. Deploy as a second Deployment using the same image with `command: ["node", "dist/worker.js"]`.
5. Confirm ML migrations are already in `insights-service/migrations/20260513000001_*` (they are). `recommendation-service` has no migrations dir to move.
6. Add `onnxruntime-node` + `bullmq` to insights-service `package.json`.
7. Add `apk add --no-cache libstdc++` to the insights-service Dockerfile (onnxruntime native dep).
8. Delete `services/recommendation-service/`.
9. Update api-gateway proxy: `/v1/recommendations/*` and `/v1/models/*` → insights-service.
10. Update Helm: delete `recommendation-service-*.yaml`; add a worker Deployment template that reuses the insights-service image.

### Phase 3 — fold backtest-service into insights-service (~half day)

1. Move `services/backtest-service/src/` → `services/insights-service/src/backtest/`.
2. Move backtest BullMQ worker into the same worker process started in Phase 2 — one worker process, multiple queue consumers (`score-symbol`, `daily-ranking`, `backtest-runs`).
3. Move backtest migrations into `insights-service/migrations/`.
4. Delete `services/backtest-service/`.
5. Update api-gateway proxy: `/v1/backtest/*` → insights-service.
6. Update Helm: delete `backtest-service-*.yaml`.

### Phase 4 — documentation truth-up

1. Update `CLAUDE.md`:
   - Service list already says 3 — leave it.
   - API gateway routing table: collapse `/v1/features`, `/v1/recommendations`, `/v1/backtest`, `/v1/models` rows all pointing at insights-service.
   - Schema table: `insights_db` schemas become `market, recommendations` (already correct) — confirm.
2. Update `instruction.md`:
   - Architecture diagram (one box for insights-service + worker sidecar instead of 3 ML boxes).
   - Startup order: drop steps 3–6, collapse to `insights-service` (HTTP) + optional `insights-worker`.
   - `npm run` table: drop `feature`, `recommendation`, `backtest`.
   - Docker build commands: one build for insights-service, used for both Deployments.
3. Update root `package.json` scripts: remove `npm run feature`, `npm run recommendation`, `npm run backtest`. Add `npm run insights-worker` if useful for local dev.
4. Mark `plan.md` as historical: prepend a note that V2 phases were executed, then consolidated by `reduction-plan.md`.

---

## 4. What this saves

| Axis | Before | After |
|------|--------|-------|
| Service directories | 10 (6 real + 4 empty) | 3 |
| Pods in dev | 6 app pods | 3 app pods + 1 worker pod = 4 |
| Knex migration paths for `insights_db` | 2 (+ implicit) | 1 |
| `package.json` workspaces under `services/` | 6 | 3 |
| Helm service templates | 18 manifests (6 svc × 3) | 9 manifests + 1 worker Deployment |
| ONNX library installed in | 1 image (recommendation-service) | 1 image (insights-service) |
| Code duplication (V1 rule engine vs ML) | both present | ML only |

---

## 5. Risks & what to watch

- **ONNX cold start.** `onnxruntime-node` adds ~80 MB to the image and ~150 ms to startup. Acceptable; insights-service is already not latency-critical on boot.
- **Worker isolation.** OOM or crash in a backtest job must not kill the HTTP server. Solved by Phase 2 step 4 (separate Deployment, same image, different `command`).
- **CPU contention.** If a daily-ranking ONNX batch ran on the API pod it would spike p99 quote latency. Mitigated because daily ranking is already a BullMQ job — it only runs on the worker pod.
- **Migration ordering.** When consolidating migrations, preserve original timestamps so `knex_migrations` history doesn't see "missing" entries. If V2 migrations have already run in any environment that matters, leave filenames alone — just move them into `insights-service/migrations/`.
- **plan.md confusion.** Leave `plan.md` in place but mark it historical at the top so future readers understand it was the *expansion* plan that this document reverses.

---

## 6. Out of scope

- Merging core-service domains (auth/users/broker/portfolio/engagement) — these are already one service. The plan-3 split into auth-service/engagement-service/trading-service never happened. Leave it.
- Replacing BullMQ with a simpler in-process queue. Possible later; not required to drop pod count.
- Moving ONNX artifacts out of PG — separate decision (see plan.md §16); not part of reducing service count.
