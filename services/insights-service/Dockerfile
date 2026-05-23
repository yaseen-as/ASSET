# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# onnxruntime-node native install needs libstdc++ at build *and* runtime.
RUN apk add --no-cache libstdc++

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/insights-service/package.json ./services/insights-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/insights-service/ ./services/insights-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/insights-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/insights-service
ENV NODE_ENV=production

RUN apk add --no-cache libstdc++

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/insights-service/dist ./dist
COPY --from=builder /app/services/insights-service/package.json ./
COPY --from=builder /app/services/insights-service/migrations ./migrations

EXPOSE 3004
# Default command runs the HTTP server. The worker Deployment overrides this
# with: command: ["node", "dist/worker.js"]
CMD ["node", "dist/server.js"]
