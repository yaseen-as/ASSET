# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/backtest-service/package.json ./services/backtest-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/backtest-service/ ./services/backtest-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/backtest-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/backtest-service
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/backtest-service/dist ./dist
COPY --from=builder /app/services/backtest-service/package.json ./

EXPOSE 3007
CMD ["node", "dist/server.js"]
