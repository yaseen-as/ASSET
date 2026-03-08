# Stage 1
FROM node:18-alpine AS builder

WORKDIR /app

# Copy entire monorepo
COPY . .

RUN npm install
RUN npm run build --workspace=frontend

# Stage 2
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]