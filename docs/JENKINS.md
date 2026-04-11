# CI/CD — Jenkins Setup & Playwright Testing Plan

## Overview

```
Developer push
      │
      ▼
 GitHub / Git
      │
      ├── development branch ──► Jenkins ──► Build changed services only
      │                                  ──► Push :dev-<N> images
      │                                  ──► Auto-deploy to dev cluster
      │
      └── main branch ─────────► Jenkins ──► Build all services
                                         ──► Push :<version> images
                                         ──► Manual approval gate
                                         ──► Deploy to prod cluster
                                         ──► (Future) Playwright E2E
```

---

## Part 1 — Jenkins Setup

### What was created

| File | Purpose |
|------|---------|
| `Jenkinsfile` | Monorepo-aware pipeline (replaces the old frontend-only one) |
| `services/api-gateway/Dockerfile` | Multi-stage build for api-gateway |
| `services/auth-service/Dockerfile` | Multi-stage build for auth-service |
| `services/trading-service/Dockerfile` | Multi-stage build for trading-service |
| `services/market-service/Dockerfile` | Multi-stage build for market-service |
| `services/engagement-service/Dockerfile` | Multi-stage build for engagement-service |
| `frontend/Dockerfile` | Already existed — unchanged |

### Pipeline stages

```
Checkout → Detect Changes → Install → Lint → Test → Build Images → Push → Deploy
```

| Stage | What it does |
|-------|-------------|
| Checkout | `git fetch --depth=2` so the diff in the next stage works |
| Detect Changes | Diffs `HEAD~1..HEAD`. If any file under `services/<name>/` or `packages/shared/` changed, that service is marked for rebuild. On `main`, always rebuilds everything. |
| Install | `npm ci` at root (all workspaces), then builds `@platform/shared` |
| Lint | Runs `npm run lint` in each changed service |
| Test | Runs `npm run test` in each changed service (no-op until tests are added) |
| Build Images | `docker build` per changed service using its `Dockerfile` |
| Push Images | Logs in to DockerHub, pushes each built image |
| Deploy Dev | `kubectl set image` per changed deployment (fast rolling update) |
| Approve Production | Pauses for up to 30 min — a human clicks "Deploy" in Jenkins UI |
| Deploy Prod | Runs `kustomize edit set image` to pin the new tag, then `kubectl apply -k` |

### Image tag strategy

| Branch | Tag format | Example |
|--------|-----------|---------|
| `development` | `dev-<BUILD_NUMBER>` | `yaseenas/market-service:dev-42` |
| `main` | `<version from package.json>` | `yaseenas/market-service:1.2.0` |

### Jenkins credentials to create

Go to **Manage Jenkins → Credentials → (global)** and add:

| ID | Type | Value |
|----|------|-------|
| `dockerhub` | Username/Password | DockerHub login (`yaseenas` / your password) |
| `kubeconfig-dev` | Secret file | The kubeconfig for your dev k3d cluster |
| `kubeconfig-prod` | Secret file | The kubeconfig for your prod cluster |

To export your k3d kubeconfig:
```bash
k3d kubeconfig get dev > ~/.kube/k3d-dev.yaml
# Upload k3d-dev.yaml as the 'kubeconfig-dev' secret file in Jenkins
```

### Jenkins job setup

1. Create a new **Multibranch Pipeline** job
2. Set Branch Sources → Git → paste your repo URL
3. Add credentials if the repo is private
4. Set **Scan Multibranch Pipeline Triggers** → periodically or via webhook
5. Jenkins will auto-detect `Jenkinsfile` at root and create jobs for `development` and `main`

### Webhook (optional but recommended)

In your Git provider, add a webhook pointing to:
```
http://<jenkins-host>/multibranch-webhook-trigger/invoke?token=<your-token>
```
Install the **Multibranch Scan Webhook Trigger** plugin in Jenkins.

### Required Jenkins plugins

| Plugin | Why |
|--------|-----|
| Pipeline | Core |
| Docker Pipeline | `docker build / push` in pipeline |
| Kubernetes CLI | `kubectl` steps |
| Multibranch Pipeline | Branch-per-environment strategy |
| Credentials Binding | Inject `dockerhub`, `kubeconfig-*` secrets |
| Multibranch Scan Webhook Trigger | Instant builds on push (optional) |

---

## Part 2 — How the Docker builds work

All service Dockerfiles use the same two-stage pattern:

### Stage 1 — Builder

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package manifests first → npm ci is cached unless deps change
COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/<name>/package.json ./services/<name>/
RUN npm ci

# Copy source and compile
COPY packages/shared/ ./packages/shared/
COPY services/<name>/ ./services/<name>/
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/<name>
```

### Stage 2 — Runtime

```dockerfile
FROM node:20-alpine AS runtime
# Only the compiled dist, shared package, and migrations land in the final image.
# No devDependencies, no TypeScript sources.
COPY --from=builder /app/node_modules ...
COPY --from=builder /app/services/<name>/dist ./dist
COPY --from=builder /app/services/<name>/migrations ./migrations
CMD ["node", "dist/server.js"]
```

**Result**: Final images are ~150–200 MB instead of 800+ MB with full source + devDeps.

### Building locally

```bash
# From the repo root — context must be root because Dockerfiles reference packages/shared
docker build -f services/market-service/Dockerfile -t yaseenas/market-service:local .
docker run --env-file services/market-service/.env -p 3004:3004 yaseenas/market-service:local
```

---

## Part 3 — Playwright E2E Testing (Future Plan)

### What Playwright will test

Playwright runs a browser against the full stack (frontend + gateway + all services). It tests **user flows end-to-end**, not individual units.

### Proposed test flows

| Flow | Steps | Services exercised |
|------|-------|--------------------|
| Login | Load app → enter credentials → assert dashboard appears | auth-service |
| View holdings | Login → navigate to Portfolio → assert holdings table populated | trading-service |
| Paper trade | Login → place a BUY paper order → assert it appears in order history | trading-service |
| Market quote | Navigate to a symbol page → assert live price displayed | market-service |
| Recommendations | Navigate to Recommendations → assert signal cards rendered | market-service |
| Alert creation | Go to Alerts → create a price alert → assert it saved | engagement-service |

### Where tests will live

```
tests/
└── e2e/
    ├── playwright.config.ts      # base URL, browser list, retries
    ├── fixtures/
    │   └── auth.fixture.ts       # reusable logged-in page context
    ├── flows/
    │   ├── login.spec.ts
    │   ├── portfolio.spec.ts
    │   ├── paper-trade.spec.ts
    │   ├── market.spec.ts
    │   ├── recommendations.spec.ts
    │   └── alerts.spec.ts
    └── utils/
        └── api.ts                # helper to seed test data via REST
```

### playwright.config.ts (skeleton)

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/flows',
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    // Record video on first retry to help debug CI failures
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

### Auth fixture (reusable login)

```typescript
// tests/e2e/fixtures/auth.fixture.ts
import { test as base, Page } from '@playwright/test';

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await page.goto('/');
    await page.fill('[name=email]', process.env.E2E_USER_EMAIL!);
    await page.fill('[name=password]', process.env.E2E_USER_PASSWORD!);
    await page.click('[type=submit]');
    await page.waitForURL('**/dashboard');
    await use(page);
  },
});
```

### Jenkins integration for Playwright

When tests are ready, add a stage after **Deploy Dev**:

```groovy
stage('E2E Tests') {
    when { branch 'development' }
    steps {
        sh 'npx playwright install --with-deps chromium'
        withEnv([
            "E2E_BASE_URL=http://<dev-ingress-hostname>",
            "E2E_USER_EMAIL=${env.E2E_EMAIL}",
            "E2E_USER_PASSWORD=${env.E2E_PASSWORD}"
        ]) {
            sh 'npx playwright test --reporter=html'
        }
    }
    post {
        always {
            publishHTML([
                allowMissing: false,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright E2E Report'
            ])
        }
    }
}
```

The **HTML Reporter** plugin in Jenkins will show the Playwright report with screenshots and videos inline.

### Playwright credentials to add in Jenkins

| ID | Value |
|----|-------|
| `e2e-user-email` | Test account email (a dedicated non-prod account) |
| `e2e-user-password` | Test account password |

### Setup commands (when ready)

```bash
# Install from repo root
npm install --save-dev @playwright/test --workspace=.
npx playwright install chromium

# Run locally against dev server
E2E_BASE_URL=http://localhost:5173 npx playwright test

# Run with UI (debugging)
npx playwright test --ui
```

---

## Part 4 — Full pipeline (with Playwright added)

```
Push to development
        │
        ▼
  ┌─ Checkout ─────────────────────────────────────────────────────────────┐
  │  Detect changed services                                                │
  │  Install + build @platform/shared                                       │
  │  Lint (changed only)                                                    │
  │  Unit tests (changed only)          ◄── add Vitest here later          │
  │  Build Docker images (changed only)                                     │
  │  Push :dev-<N> to DockerHub                                             │
  │  kubectl set image → dev cluster                                        │
  │  Wait for rollout                                                       │
  │  Playwright E2E tests against dev   ◄── add when tests are written     │
  └─────────────────────────────────────────────────────────────────────────┘
        │  all green
        ▼
  merge to main (PR)
        │
        ▼
  ┌─ Same stages as above (full rebuild) ─────────────────────────────────┐
  │  Manual approval gate (Jenkins UI)                                     │
  │  kustomize edit set image → prod overlay                               │
  │  kubectl apply -k k8s/overlays/prod                                    │
  │  kubectl rollout status (5 min timeout)                                │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## Quick-start checklist

- [ ] Install required Jenkins plugins (see list above)
- [ ] Add `dockerhub`, `kubeconfig-dev`, `kubeconfig-prod` credentials in Jenkins
- [ ] Create a Multibranch Pipeline job pointing to this repo
- [ ] Verify `npm run build` works locally for each service (`tsc` must succeed)
- [ ] Test a Docker build locally: `docker build -f services/auth-service/Dockerfile -t test .`
- [ ] Push to `development` and confirm the pipeline runs
- [ ] (Future) Create `tests/e2e/` directory, write first Playwright spec, add E2E stage to Jenkinsfile


Playwright plan (future)
Tests live in tests/e2e/flows/ — one spec per user flow (login, portfolio, paper trade, market, alerts)
A reusable auth fixture handles login once and shares a logged-in page context across tests
In Jenkins, a new E2E Tests stage runs after Deploy Dev, publishes an HTML report with screenshots/videos directly in the Jenkins UI
The pipeline gate is: unit tests pass → deploy to dev → E2E passes → human approves → deploy prod


Instructions to get Jenkins running (in order)
1. Install these Jenkins plugins:
Pipeline, Docker Pipeline, Kubernetes CLI, Multibranch Pipeline, Credentials Binding

2. Add 3 credentials in Manage Jenkins → Credentials:

ID	Type	Value
dockerhub	Username/Password	DockerHub yaseenas / your password
kubeconfig-dev	Secret file	Export with k3d kubeconfig get dev > dev.yaml
kubeconfig-prod	Secret file	Your prod cluster kubeconfig
3. Create a Multibranch Pipeline job → set Branch Source to your Git repo → Jenkins auto-detects the Jenkinsfile.

4. Verify locally first:


docker build -f services/market-service/Dockerfile -t test-market .
Build must succeed before pushing to Jenkins.