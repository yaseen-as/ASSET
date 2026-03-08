#!/bin/bash

set -e

echo "🚀 Starting Project Initialization..."

ROOT_DIR="$(pwd)"

mkdir -p logs

PIDS=()


# ---------------------------------
# Graceful Shutdown Handler
# ---------------------------------
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."

    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "❌ Stopped PID $pid"
        fi
    done

    exit 0
}

trap cleanup SIGINT SIGTERM


# ---------------------------------
# Step 1: Copy .env.example → .env
# ---------------------------------
echo "🔐 Checking .env files..."

find "$ROOT_DIR" -name ".env.example" | while read -r example; do

    env_file="${example%.example}"

    if [ ! -f "$env_file" ]; then
        cp "$example" "$env_file"
        echo "✅ Created $env_file"
    else
        echo "⚠️  $env_file already exists"
    fi

done


# ---------------------------------
# Step 2: Install Dependencies
# ---------------------------------
echo "📦 Installing dependencies..."

find "$ROOT_DIR" -name "package.json" -not -path "*/node_modules/*" | while read -r pkg; do

    DIR="$(dirname "$pkg")"

    echo "➡️  Installing in $DIR"

    cd "$DIR"

    npm install

    cd "$ROOT_DIR"

    sleep 1

done


# ---------------------------------
# Start Service Function
# ---------------------------------
start_service() {

    NAME="$1"
    DIR="$2"

    echo "▶️  Starting $NAME..."

    cd "$DIR"

    npm run dev > "$ROOT_DIR/logs/$NAME.log" 2>&1 &

    PID=$!

    PIDS+=("$PID")

    echo "✅ $NAME started (PID: $PID)"

    cd "$ROOT_DIR"

    sleep 2
}


# ---------------------------------
# Step 3: Start Backend Services
# ---------------------------------

echo "🟢 Starting backend services..."

start_service "api-gateway" "services/api-gateway"

start_service "auth-service" "services/auth-service"

start_service "user-service" "services/user-service"

start_service "broker-service" "services/broker-service"

start_service "market-data-service" "services/market-data-service"

start_service "portfolio-service" "services/portfolio-service"

start_service "alert-service" "services/alert-service"

start_service "notification-service" "services/notification-service"

start_service "recommendation-service" "services/recommendation-service"


# ---------------------------------
# Step 4: Build Shared Package
# ---------------------------------

if [ -d "packages/shared" ]; then

    echo "📦 Building shared package..."

    cd packages/shared

    npm run build || echo "⚠️ Shared build skipped"

    cd "$ROOT_DIR"

    sleep 2
fi


# ---------------------------------
# Step 5: Start Frontend
# ---------------------------------

echo "🌐 Starting frontend..."

start_service "frontend" "frontend"


# ---------------------------------
# Keep Alive
# ---------------------------------

echo ""
echo "======================================"
echo "✅ All services started successfully!"
echo "📁 Logs: $ROOT_DIR/logs"
echo "🛑 Press CTRL+C to stop everything"
echo "======================================"
echo ""

while true; do
    sleep 10
done
