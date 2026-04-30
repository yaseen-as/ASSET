# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/core-service/package.json ./services/core-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/core-service/ ./services/core-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/core-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/core-service
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/core-service/dist ./dist
COPY --from=builder /app/services/core-service/package.json ./
COPY --from=builder /app/services/core-service/migrations ./migrations
COPY --from=builder /app/services/core-service/migrations-engagement ./migrations-engagement
COPY --from=builder /app/services/core-service/migrations-auth ./migrations-auth

EXPOSE 3001
CMD ["node", "dist/server.js"]
