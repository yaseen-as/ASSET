# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# onnxruntime-node native install needs libstdc++ at build *and* runtime.
RUN apk add --no-cache libstdc++

COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/recommendation-service/package.json ./services/recommendation-service/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY services/recommendation-service/ ./services/recommendation-service/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/recommendation-service

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/recommendation-service
ENV NODE_ENV=production

RUN apk add --no-cache libstdc++

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/services/recommendation-service/dist ./dist
COPY --from=builder /app/services/recommendation-service/package.json ./

EXPOSE 3005
CMD ["node", "dist/server.js"]
