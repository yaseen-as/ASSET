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
while IFS= read -r example; do
    env_file="${example%.example}"
    if [ ! -f "$env_file" ]; then
        cp "$example" "$env_file"
        echo "✅ Created $env_file"
    else
        echo "⚠️  $env_file already exists"
    fi
done < <(find "$ROOT_DIR" -name ".env.example" -not -path "*/node_modules/*")


# ---------------------------------
# Step 2: Install dependencies (workspaces — one install at root)
# ---------------------------------
echo "📦 Installing workspace dependencies..."
cd "$ROOT_DIR"
npm install


# ---------------------------------
# Step 3: Build shared package FIRST (services import @platform/shared)
# ---------------------------------
if [ -d "packages/shared" ]; then
    echo "📦 Building @platform/shared..."
    npm run build --workspace=packages/shared
fi


# ---------------------------------
# Start Service Function
# ---------------------------------
start_service() {
    NAME="$1"
    DIR="$2"

    if [ ! -d "$DIR" ]; then
        echo "⚠️  Skipping $NAME — $DIR not found"
        return
    fi

    echo "▶️  Starting $NAME..."
    cd "$DIR"
    npm run dev > "$ROOT_DIR/logs/$NAME.log" 2>&1 &
    PID=$!
    PIDS+=("$PID")
    echo "✅ $NAME started (PID: $PID) → logs/$NAME.log"
    cd "$ROOT_DIR"
    sleep 2
}


# ---------------------------------
# Step 4: Start Backend Services
# Order matters: core/insights/feature first so downstream callers find them
# ---------------------------------
echo "🟢 Starting backend services..."

start_service "core-service"           "services/core-service"
start_service "insights-service"       "services/insights-service"
start_service "feature-service"        "services/feature-service"
start_service "recommendation-service" "services/recommendation-service"
start_service "backtest-service"       "services/backtest-service"
start_service "api-gateway"            "services/api-gateway"


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
echo "📁 Logs:    $ROOT_DIR/logs"
echo "🌐 Gateway: http://localhost:3000"
echo "🌐 Web:     http://localhost:5173"
echo "🛑 CTRL+C to stop everything"
echo "======================================"
echo ""

while true; do sleep 10; done
