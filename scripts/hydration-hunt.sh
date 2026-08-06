#!/usr/bin/env bash
#
# Visual debt 16 — a development-mode hunt for the residual hydration mismatch.
#
# Resets and seeds the database from repository truth, starts `next dev`, and
# drives it until a sighting. A dev build is the point: it prints the element
# React choked on, which the production bundle never does.
#
# It runs alone by design. Nothing else may touch `.next` or the app while this
# is going — a concurrent `next build` once rewrote the bundle under a running
# dev server and produced fourteen "sightings" that were all 500 pages.
#
#   bash scripts/hydration-hunt.sh [iterations]
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ITERATIONS="${1:-40}"
PORT="${HUNT_PORT:-3222}"
OUT="${HUNT_OUT:-hydration-hunt}"
LOG_DIR="${HUNT_LOG_DIR:-$OUT}"
mkdir -p "$LOG_DIR"
RUN="$(date +%s)"
LOG="$LOG_DIR/run-$RUN.log"

export DATABASE_URL="${DATABASE_URL:-postgres://tonys:local_dev_only@127.0.0.1:5432/tonys_hydration}"
export SESSION_SECRET="${SESSION_SECRET:-visual_qa_ephemeral_secret_thirty_two_chars_min}"
export SLEEPER_LEAGUE_ID="${SLEEPER_LEAGUE_ID:-1385016656425668608}"
export NEXT_TELEMETRY_DISABLED=1
export HUNT_BASE="http://localhost:$PORT"
export HUNT_ITERATIONS="$ITERATIONS"
export HUNT_OUT="$OUT"
export NO_PROXY='*' no_proxy='*'

exec > >(tee -a "$LOG") 2>&1
echo "=== hydration hunt $RUN — $ITERATIONS iterations, port $PORT ==="

# Refuse to start if anything is already serving. Two servers on one .next is
# the exact condition that invalidated the first attempt at this measurement.
if ps -eo args | grep -E "next (dev|start)" | grep -v grep > /dev/null; then
  echo "REFUSING: a Next.js server is already running. Stop it first."
  exit 4
fi

ADMIN_DB="postgres://tonys:local_dev_only@127.0.0.1:5432/postgres"
DB_NAME="${DATABASE_URL##*/}"
psql "$ADMIN_DB" -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" \
  -c "CREATE DATABASE $DB_NAME OWNER tonys;" || exit 1
npm run db:migrate | tail -1 || exit 1
npm run db:seed | tail -1 || exit 1

DEMO_FIXTURES=1 npx next dev -p "$PORT" > "$LOG_DIR/server-$RUN.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

for i in $(seq 1 90); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' "$HUNT_BASE/door" || true)" = "200" ]; then
    echo "dev server up after ${i}s"
    break
  fi
  sleep 1
done

DEMO_FIXTURES=1 npx tsx scripts/hydration-hunt.mts
STATUS=$?
echo "HUNT_EXIT=$STATUS"
echo "DONE $LOG"
exit "$STATUS"
