# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/feature-service/package.json ./services/feature-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/feature-service/ ./services/feature-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/feature-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/feature-service
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/feature-service/dist ./dist
COPY --from=builder /app/services/feature-service/package.json ./

EXPOSE 3006
CMD ["node", "dist/server.js"]
