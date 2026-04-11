# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/trading-service/package.json ./services/trading-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/trading-service/ ./services/trading-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/trading-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/trading-service
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/trading-service/dist ./dist
COPY --from=builder /app/services/trading-service/package.json ./
COPY --from=builder /app/services/trading-service/migrations ./migrations

EXPOSE 3003
CMD ["node", "dist/server.js"]
