#!/usr/bin/env bash
# Dev orchestrator — runs interchange + terminal, or just terminal if cloud configured
set -e

INTERCHANGE_PORT="${INTERCHANGE_PORT:-3001}"
TERMINAL_PORT="${TERMINAL_PORT:-3000}"

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[dev] Killing processes on port $port"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

cleanup() {
  echo ""
  echo "[dev] Shutting down..."
  [ -n "$INTERCHANGE_PID" ] && kill "$INTERCHANGE_PID" 2>/dev/null
  [ -n "$TERMINAL_PID" ] && kill "$TERMINAL_PID" 2>/dev/null
  kill_port "$INTERCHANGE_PORT"
  kill_port "$TERMINAL_PORT"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Always kill our ports first
kill_port "$TERMINAL_PORT"

if [ -n "$INTERCHANGE_URL" ]; then
  # Remote interchange configured — just run terminal
  echo "[dev] INTERCHANGE_URL=$INTERCHANGE_URL — using remote interchange"
  echo "[dev] Starting terminal on port $TERMINAL_PORT..."
  INTERCHANGE_URL="$INTERCHANGE_URL" \
    NEXT_PUBLIC_INTERCHANGE_WS="${INTERCHANGE_WS:-$(echo "$INTERCHANGE_URL" | sed 's|^http|ws|')}" \
    pnpm --filter terminal dev &
  TERMINAL_PID=$!
else
  # No remote — run both locally
  kill_port "$INTERCHANGE_PORT"

  echo "[dev] Starting interchange on port $INTERCHANGE_PORT..."
  INTERCHANGE_PORT="$INTERCHANGE_PORT" PORT="$INTERCHANGE_PORT" \
    pnpm --filter interchange dev &
  INTERCHANGE_PID=$!

  # Wait for interchange to be ready
  echo "[dev] Waiting for interchange..."
  for i in $(seq 1 30); do
    if curl -s "http://localhost:$INTERCHANGE_PORT/api/participants" > /dev/null 2>&1; then
      echo "[dev] Interchange ready"
      break
    fi
    sleep 1
  done

  echo "[dev] Starting terminal on port $TERMINAL_PORT..."
  INTERCHANGE_URL="http://localhost:$INTERCHANGE_PORT" \
    NEXT_PUBLIC_INTERCHANGE_WS="ws://localhost:$INTERCHANGE_PORT" \
    pnpm --filter terminal dev &
  TERMINAL_PID=$!
fi

echo "[dev] Ready — interchange :$INTERCHANGE_PORT / terminal :$TERMINAL_PORT"
wait
