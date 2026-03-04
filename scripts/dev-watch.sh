#!/usr/bin/env bash
# dev-watch.sh — Next.js dev server with memory-threshold auto-restart
# Usage: npm run dev:watch
#
# Kills and restarts next-server when RSS exceeds MAX_MB.
# NODE_OPTIONS heap cap is a secondary safety net.

MAX_MB=${DEV_MAX_MB:-3000}   # Restart threshold (MB). Override with DEV_MAX_MB env var.
CHECK_INTERVAL=30            # Memory check frequency (seconds)
NODE_OPTIONS="--max-old-space-size=3072"

export NODE_OPTIONS

while true; do
  echo "▶  Starting next dev server (heap cap: 3072 MB, restart at: ${MAX_MB} MB RSS)..."

  npm run dev &
  NEXT_PID=$!

  while kill -0 "$NEXT_PID" 2>/dev/null; do
    sleep "$CHECK_INTERVAL"

    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
      break
    fi

    MEM_MB=$(ps -o rss= -p "$NEXT_PID" 2>/dev/null | awk '{printf "%d", $1/1024}')

    if [ -z "$MEM_MB" ]; then
      continue
    fi

    if [ "$MEM_MB" -gt "$MAX_MB" ]; then
      echo "⚠  next-server using ${MEM_MB} MB > ${MAX_MB} MB — restarting to free RAM..."
      kill "$NEXT_PID"
      wait "$NEXT_PID" 2>/dev/null
      echo "✓  Stopped. Restarting in 2s..."
      sleep 2
      break
    fi

    echo "   next-server RAM: ${MEM_MB} MB / ${MAX_MB} MB"
  done

  # Process exited on its own (crash or OOM) — short pause before restart
  if kill -0 "$NEXT_PID" 2>/dev/null; then
    wait "$NEXT_PID" 2>/dev/null
  fi
  echo "↺  Restarting..."
  sleep 1
done
