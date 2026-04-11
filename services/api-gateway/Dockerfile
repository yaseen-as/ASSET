# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy monorepo manifests first (layer cache: only re-run npm ci when these change)
COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api-gateway/package.json ./services/api-gateway/

RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY services/api-gateway/ ./services/api-gateway/

# Build shared package then service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/api-gateway

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/api-gateway
ENV NODE_ENV=production

# Copy compiled output and production dependencies
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/api-gateway/dist ./dist
COPY --from=builder /app/services/api-gateway/package.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
