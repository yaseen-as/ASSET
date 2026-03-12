# Kubernetes Environment Guide

## Why the Volume Mount Exists

```
volumes:
  - volume: /home/yaseen/Desktop/ASSET:/app
    nodeFilters:
      - all
```

k3d runs Kubernetes **inside Docker containers**. Each "node" (server, agent) is itself a Docker container — not your real machine.

```
Your Machine (host)
├── /home/yaseen/Desktop/ASSET/     ← your actual code lives here
│
└── Docker
    └── k3d-asset-dev-server-0      ← this is a container (the k8s node)
        └── /app/                   ← your code is mounted HERE inside the node
            └── k3d-asset-dev-agent-0
                └── /app/
```

When a Pod uses `hostPath: /app`, it means "give me `/app` from the node I'm running on."
Without the k3d volume mount, `/app` inside the node **does not exist** → `MountVolume.SetupError`.

**The chain:**
```
Your code on disk
  → mounted into k3d node at /app          (k3d volume config)
  → mounted into Pod container at /app     (hostPath in deployment)
  → ts-node-dev watches /app/services/auth-service/src
  → you edit a file → ts-node-dev restarts → change is live
```

---

## Development Environment Flow

### Goal
Run all services **without building Docker images**. Edit code on your machine → see changes instantly inside the cluster.

### How it works

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR MACHINE                             │
│                                                                 │
│  /home/yaseen/Desktop/ASSET/  (source code)                     │
│         │                                                       │
│         │  k3d volume mount  (/home/yaseen/Desktop/ASSET:/app)  │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   k3d cluster (Docker)                  │   │
│  │                                                         │   │
│  │  k3d node                                               │   │
│  │  └── /app/   ← your source code is visible here        │   │
│  │      ├── services/auth-service/src/                     │   │
│  │      ├── services/api-gateway/src/                      │   │
│  │      ├── frontend/src/                                  │   │
│  │      └── packages/shared/                               │   │
│  │                                                         │   │
│  │  Pods (all read from /app via hostPath)                 │   │
│  │  ┌──────────────┐   image: node:20-alpine               │   │
│  │  │ auth-service │   workingDir: /app/services/auth-service│ │
│  │  │              │   command: npm run dev                 │   │
│  │  │              │   (ts-node-dev --respawn)              │   │
│  │  └──────────────┘                                       │   │
│  │                                                         │   │
│  │  ┌──────────────┐   image: node:20-alpine               │   │
│  │  │   frontend   │   workingDir: /app/frontend           │   │
│  │  │              │   command: npm run dev (Vite HMR)      │   │
│  │  └──────────────┘                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### What happens when you edit a file

```
You save services/auth-service/src/routes/auth.routes.ts
         │
         ▼
File change is visible inside the node at /app/services/auth-service/src/
         │
         ▼
ts-node-dev detects the change (file watcher)
         │
         ▼
ts-node-dev restarts the process (< 1 second)
         │
         ▼
New code is live — no rebuild, no redeploy
```

For the frontend, Vite's HMR updates the browser **without a full page reload**.

### Dev Overlay Summary (`k8s/overlays/dev`)

| What changes vs base       | Dev value                          | Why                          |
|----------------------------|------------------------------------|------------------------------|
| Image                      | `node:20-alpine` (all services)    | No custom image needed       |
| Replicas                   | 1                                  | Faster, less resource usage  |
| Command                    | `npm run dev` (ts-node-dev / Vite) | Hot-reload                   |
| Volume                     | hostPath `/app`                    | Source code access           |
| Health probes              | Removed                            | ts-node-dev is slow to start |
| Ingress host               | `asset.dev.local`                  | Local-only hostname          |
| Frontend service port      | 5173                               | Vite dev server port         |

### Dev Startup Sequence

```bash
# 1. Create cluster (mounts source into nodes)
k3d cluster create --config k8s/k3d-dev-config.yaml

# 2. Install nginx ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml

# 3. Add hostname
echo "127.0.0.1  asset.dev.local" | sudo tee -a /etc/hosts

# 4. Deploy
kubectl apply -k k8s/overlays/dev

# 5. Open browser
# http://asset.dev.local:8080
```

### Dev Request Flow

```
Browser: http://asset.dev.local:8080/api/v1/auth/login
              │
              ▼  port 8080 → k3d LoadBalancer → nginx ingress
         Nginx Ingress
              │  rewrites: /api/v1/auth/login → /v1/auth/login
              ▼
         API Gateway (pod, port 3000)
              │  JWT check (public route → skip)
              │  pathRewrite: /v1/auth → ""
              ▼
         Auth Service (pod, port 3001)
              │  POST /login
              ▼
         PostgreSQL (database namespace, port 5432)
              │
              ▼
         Response back up the chain → Browser
```

---

## Production Environment Flow

### Goal
Run compiled, optimised Docker images. Multiple replicas, resource limits, TLS, pinned image tags.

### How it works

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRODUCTION CLUSTER                            │
│                                                                  │
│  No source code mount — containers run compiled images           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  auth-service  ×2 replicas                               │   │
│  │  image: yaseenas/auth-service:1.0.0  (DockerHub)         │   │
│  │  command: node dist/server.js                            │   │
│  │  resources: 128Mi-512Mi RAM, 100m-500m CPU               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  react-frontend  ×3 replicas                             │   │
│  │  image: yaseenas/react-frontend:1.0.0                    │   │
│  │  nginx serving pre-built /dist                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Ingress: asset.yourdomain.com (TLS via cert-manager)            │
└──────────────────────────────────────────────────────────────────┘
```

### Build & Deploy Pipeline (Jenkins)

```
Developer pushes to main branch
         │
         ▼
Jenkins picks up Jenkinsfile
         │
         ├── docker build -f services/auth-service/dockerfile
         │     -t yaseenas/auth-service:1.0.0 .
         │
         ├── docker push yaseenas/auth-service:1.0.0
         │
         └── kubectl apply -k k8s/overlays/prod
```

You must build and push all service images before deploying prod:

```bash
# Build all services
for svc in auth-service user-service broker-service market-data-service \
           portfolio-service recommendation-service alert-service notification-service api-gateway; do
  docker build -f services/$svc/dockerfile -t yaseenas/$svc:1.0.0 .
  docker push yaseenas/$svc:1.0.0
done

# Build frontend
docker build -f frontend/Dockerfile -t yaseenas/react-frontend:1.0.0 .
docker push yaseenas/react-frontend:1.0.0

# Deploy
kubectl apply -k k8s/overlays/prod
```

### Prod Overlay Summary (`k8s/overlays/prod`)

| What changes vs base  | Prod value                          | Why                         |
|-----------------------|-------------------------------------|-----------------------------|
| Image                 | `yaseenas/<service>:1.0.0`          | Pinned, tested version      |
| Replicas (backends)   | 2                                   | High availability           |
| Replicas (frontend)   | 3                                   | Higher traffic               |
| Resources             | requests + limits set               | Prevent resource starvation |
| Ingress host          | `asset.yourdomain.com`              | Real domain                 |
| TLS                   | cert-manager + Let's Encrypt        | HTTPS                       |
| Health probes         | Enabled (readiness + liveness)      | Auto-restart unhealthy pods |

### Prod Request Flow

```
Browser: https://asset.yourdomain.com/api/v1/auth/login
              │
              ▼  port 443
         Nginx Ingress (TLS termination by cert-manager)
              │  rewrites: /api/v1/auth/login → /v1/auth/login
              ▼
         API Gateway (2 pods, load balanced)
              │  JWT check
              │  pathRewrite
              ▼
         Auth Service (2 pods, load balanced)
              │
              ▼
         PostgreSQL
```

---

## Side-by-side Comparison

| Aspect              | Dev                              | Production                        |
|---------------------|----------------------------------|-----------------------------------|
| Images              | `node:20-alpine` (generic)       | `yaseenas/<service>:1.0.0`        |
| Source code         | Mounted from host via hostPath   | Baked into Docker image           |
| Hot reload          | Yes (ts-node-dev / Vite HMR)     | No — redeploy to update           |
| Replicas            | 1 per service                    | 2-3 per service                   |
| Resource limits     | None                             | CPU + memory limits set           |
| Health probes       | Disabled                         | Enabled                           |
| HTTPS / TLS         | No (HTTP only)                   | Yes (cert-manager + Let's Encrypt)|
| Hostname            | `asset.dev.local:8080`           | `asset.yourdomain.com`            |
| Deploy command      | `kubectl apply -k k8s/overlays/dev` | `kubectl apply -k k8s/overlays/prod` |
| Image build needed? | No                               | Yes                               |
| Startup time        | ~30s (ts-node-dev compile)       | ~5s (pre-compiled binary)         |

---

## Directory Reference

```
k8s/
├── base/                  ← shared manifests (both envs use this)
│   ├── db/                postgres deployment
│   ├── redis/             redis deployment
│   ├── frontend/          react frontend deployment + ingress
│   ├── jenkins/           CI/CD jenkins
│   ├── namespaces/        database + jenkins namespaces
│   └── services/          all 9 microservices
│       └── wait-for-postgres.yaml  ← blocks startup until DB ready
│
├── overlays/
│   ├── dev/               ← DEV ONLY changes
│   │   ├── kustomization.yaml
│   │   └── patches/
│   │       ├── backend-hot-reload.yaml   node:20 + npm run dev + hostPath
│   │       ├── frontend-dev.yaml         Vite dev server
│   │       ├── frontend-service-dev.yaml port 5173
│   │       └── ingress-dev.yaml          asset.dev.local
│   │
│   └── prod/              ← PROD ONLY changes
│       ├── kustomization.yaml
│       └── patches/
│           ├── backend-replicas.yaml     2 replicas
│           ├── backend-resources.yaml    CPU/RAM limits
│           ├── frontend-prod.yaml        3 replicas + limits
│           └── ingress-prod.yaml         real domain + TLS
│
└── k3d-dev-config.yaml    ← cluster config (source mount + port mapping)
```
