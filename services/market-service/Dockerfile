# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/market-service/package.json ./services/market-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/market-service/ ./services/market-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/market-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/market-service
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/market-service/dist ./dist
COPY --from=builder /app/services/market-service/package.json ./
COPY --from=builder /app/services/market-service/migrations ./migrations

EXPOSE 3004
EXPOSE 3014
CMD ["node", "dist/server.js"]
