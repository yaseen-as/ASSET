#!/bin/bash
set -e

echo "🚀 Starting Project Initialization..."

ROOT_DIR="$(pwd)"
mkdir -p logs

PIDS=()


# ---------------------------------
# Step 0a: Ensure Node ≥ 18 (project's required engine).
# If nvm is available, switch into a 20.x install; otherwise the user's
# default node is used and a warning is printed.
# ---------------------------------
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    if nvm ls 20 >/dev/null 2>&1; then
        nvm use 20 >/dev/null
        echo "📦 Using Node $(node --version) via nvm"
    fi
fi
NODE_MAJOR=$(node --version | sed 's/^v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Node ≥ 18 required (found $(node --version)). Install Node 20 (nvm install 20) and re-run."
    exit 1
fi


# ---------------------------------
# Step 0b: Verify Postgres + Redis are reachable.
# Services boot via `ts-node-dev --respawn`, so a missing DB causes a
# silent crash-and-restart loop in the logs. Fail loud here instead.
# ---------------------------------
need_port() {
    local name="$1" port="$2"
    if ! (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
        echo "❌ $name not reachable on localhost:$port"
        echo "   Hint: docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15"
        echo "   Hint: docker run -d --name redis -p 6379:6379 redis:alpine"
        return 1
    fi
    echo "✅ $name reachable on localhost:$port"
}
need_port "Postgres" 5432 || exit 1
need_port "Redis"    6379 || exit 1

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
# Args: name, dir, [npm_script=dev]
# ---------------------------------
start_service() {
    NAME="$1"
    DIR="$2"
    SCRIPT="${3:-dev}"

    if [ ! -d "$DIR" ]; then
        echo "⚠️  Skipping $NAME — $DIR not found"
        return
    fi

    echo "▶️  Starting $NAME (npm run $SCRIPT)..."
    cd "$DIR"
    npm run "$SCRIPT" > "$ROOT_DIR/logs/$NAME.log" 2>&1 &
    PID=$!
    PIDS+=("$PID")
    echo "✅ $NAME started (PID: $PID) → logs/$NAME.log"
    cd "$ROOT_DIR"
    sleep 2
}


# ---------------------------------
# Step 4: Start Backend Services
# Order: core + insights (HTTP) first, then insights-worker (background
# crons + BullMQ consumer), then api-gateway in front.
# ---------------------------------
echo "🟢 Starting backend services..."

start_service "core-service"     "services/core-service"
start_service "insights-service" "services/insights-service"
start_service "insights-worker"  "services/insights-service" "dev:worker"
start_service "api-gateway"      "services/api-gateway"


# ---------------------------------
# Step 5: Start Frontend
# ---------------------------------
echo "🌐 Starting frontend..."
start_service "frontend" "frontend"


# ---------------------------------
# Keep Alive + live log stream
# tail -F prints "==> logs/X.log <==" headers when output switches between
# files, so you can see at a glance which service produced each chunk.
# Files are still on disk under logs/, so you can grep them after CTRL+C.
# Set WATCH=backend (default) to follow only backend services;
# WATCH=all     follows backend + frontend;
# WATCH=<glob>  follows whatever you pass, e.g. WATCH='logs/insights-*.log'.
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
echo "📜 Streaming logs (CTRL+C to stop all services)..."
echo ""

case "${WATCH:-backend}" in
    backend) WATCH_GLOB="$ROOT_DIR/logs/core-service.log $ROOT_DIR/logs/insights-service.log $ROOT_DIR/logs/insights-worker.log $ROOT_DIR/logs/api-gateway.log" ;;
    all)     WATCH_GLOB="$ROOT_DIR/logs/*.log" ;;
    *)       WATCH_GLOB="$WATCH" ;;
esac

# --retry handles the case where a log file hasn't been created yet (a
# service is slow to spawn); -n0 starts the stream from the current end so
# we don't replay the boot lines that already scrolled past above.
tail --retry -n0 -F $WATCH_GLOB
