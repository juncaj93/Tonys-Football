#!/usr/bin/env bash
#
# The development database, in one command.
#
#   scripts/dev-db.sh up      start Postgres (starting it if the container was lost)
#   scripts/dev-db.sh reset   drop, recreate, migrate, seed — a known-good database
#   scripts/dev-db.sh fresh   reset, then apply every demo state
#   scripts/dev-db.sh psql    a shell on it
#   scripts/dev-db.sh status  is it up, and what is in it
#
# ## Why this file exists
#
# Two sessions in a row lost local Postgres and spent real time rebuilding it
# from a recipe in a Markdown file. A recipe in Markdown is not a workflow: it
# drifts, it is retyped wrongly, and it is only ever as good as whoever last
# remembered to update it.
#
# It also has to cope with two very different environments. `docker-compose.yml`
# is the intended one and `npm run db:up` is the intended command. The agent
# sandbox has no Docker, so this falls back to the Postgres 16 binaries that are
# installed there — including the part that catches everybody, which is that
# `initdb` refuses to run as root and has to be driven through the `postgres`
# user.
#
# Nothing here is destructive without being asked: `up` never drops anything, and
# `reset` says what it is about to do.
#
# ## The one rule
#
# `DATABASE_URL` must point at a local throwaway database. `npm run test`
# truncates league tables, and this script's `reset` drops the database outright.
# Both refuse to run against anything that looks like Neon or Vercel — see
# `refuse_remote` below. That guard exists because the rule was broken once and a
# preview dataset was destroyed.

set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=${PGDATA:-/tmp/tonyspg}
PGSOCK=${PGSOCK:-/tmp/pgsock}
DB_NAME=${DB_NAME:-tonys_dev}
DB_USER=${DB_USER:-tonys}
LOCAL_URL="postgres://${DB_USER}@127.0.0.1:5432/${DB_NAME}"

export DATABASE_URL=${DATABASE_URL:-$LOCAL_URL}
export SESSION_SECRET=${SESSION_SECRET:-local_throwaway_secret_thirty_two_chars_min}
export SLEEPER_LEAGUE_ID=${SLEEPER_LEAGUE_ID:-1385016656425668608}

say() { printf '  %s\n' "$*"; }

# A destructive command must never reach a hosted database. Matching on the host
# rather than on an allow-list, because a new hosted provider should fail closed.
refuse_remote() {
  case "$DATABASE_URL" in
    *neon.tech* | *vercel* | *supabase* | *amazonaws* | *.cloud*)
      echo "REFUSED: DATABASE_URL looks hosted ($DATABASE_URL)." >&2
      echo "This command drops data. Point DATABASE_URL at a local database." >&2
      exit 1
      ;;
  esac
}

has_docker() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# --- starting it -------------------------------------------------------------

start_docker() {
  say "docker compose up postgres"
  docker compose up -d --wait postgres
}

start_binaries() {
  if [ ! -d "$PGDATA/base" ]; then
    say "initdb $PGDATA (as the postgres user — it refuses to run as root)"
    mkdir -p "$PGDATA" "$PGSOCK"
    chown postgres:postgres "$PGDATA" "$PGSOCK"
    su postgres -s /bin/bash -c "$PGBIN/initdb -D $PGDATA -A trust -U $DB_USER" >/tmp/initdb.log 2>&1
  fi

  if su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
    say "postgres already running"
  else
    say "starting postgres on 127.0.0.1:5432"
    su postgres -s /bin/bash -c \
      "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg.log -o '-p 5432 -k $PGSOCK -c listen_addresses=127.0.0.1' start" \
      >/dev/null
  fi

  # `createdb` is idempotent here by intent: `up` must never destroy anything.
  su postgres -s /bin/bash -c "$PGBIN/createdb -h $PGSOCK -U $DB_USER $DB_NAME" 2>/dev/null || true
}

start() {
  if has_docker; then start_docker; else start_binaries; fi
  say "DATABASE_URL=$DATABASE_URL"
}

drop_and_create() {
  if has_docker; then
    docker compose exec -T postgres psql -U "$DB_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" -c "CREATE DATABASE $DB_NAME"
  else
    "$PGBIN/psql" "postgres://${DB_USER}@127.0.0.1:5432/postgres" \
      -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" \
      -c "CREATE DATABASE $DB_NAME" >/dev/null
  fi
}

# --- the commands ------------------------------------------------------------

case "${1:-help}" in
  up)
    start
    ;;

  reset)
    refuse_remote
    start
    say "dropping and recreating $DB_NAME"
    drop_and_create
    say "migrate"
    npm run --silent db:migrate
    say "seed"
    npm run --silent db:seed
    say "ready — $DATABASE_URL"
    ;;

  fresh)
    refuse_remote
    "$0" reset
    say "applying every demo state"
    # Every state that is not blocked on a later milestone. The CLI names the
    # blocked ones and refuses them loudly, so a failure here is real.
    npm run --silent demo -- keys |
      while read -r state; do
        DEMO_FIXTURES=1 npm run --silent demo -- apply "$state" >/dev/null
        say "  · $state"
      done
    say "ready — every demo state applied. npm run demo -- apply <state> prints its door."
    ;;

  psql)
    shift
    if has_docker; then
      docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" "$@"
    else
      # Straight over TCP, as whoever is running this. Only `initdb` and the
      # server itself refuse to be root; `psql` does not care, and going through
      # `su` here meant splicing arguments into a command string, where a
      # `-c "select ..."` silently loses its quoting and the failure reads as a
      # broken schema.
      "$PGBIN/psql" "$DATABASE_URL" "$@"
    fi
    ;;

  status)
    if has_docker; then
      docker compose ps postgres
    else
      su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA status" || say "not running"
    fi
    say "DATABASE_URL=$DATABASE_URL"
    "$0" psql -c "select
        (select count(*) from users)              as users,
        (select count(*) from seasons)            as seasons,
        (select count(*) from loot_boxes)         as boxes,
        (select count(*) from collectibles)       as collectibles,
        (select count(*) from users where sleeper_user_id like 'demo:%') as demo_seats" 2>/dev/null ||
      say "schema not applied yet — run: scripts/dev-db.sh reset"
    ;;

  *)
    sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
